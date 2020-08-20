/* eslint-disable no-console */
import XhrStreamer from './xhr-streamer.js';
import {toUint8} from '@videojs/vhs-utils/dist/byte-helpers';
import window from 'global/window';
import EventTarget from './event-target';

export default class SourceUpdater extends EventTarget {
  constructor(el) {
    super();
    this.el = el;
    this.reset();
  }

  reset() {
    this.mse = new window.MediaSource();
    if (this.url) {
      window.URL.revokeObjectURL(this.url);
    }
    this.url = window.URL.createObjectURL(this.mse);
    this.el.src = this.url;
    this.el.volume = 0.1;
    this.queue = {};
    this.buffers = {};
    if (this.stream) {
      this.stream.dispose();
    }
    this.stream = new XhrStreamer();
  }

  createBuffers(mimetypes) {
    if (!this.mse.readyState === 'open') {
      this.delayedCreateBuffers_ = this.createBuffers.bind(this, mimetypes);
      this.mse.addEventListener('sourceopen', this.delayedCreateBuffers_);
    }

    this.mse.removeEventListener('sourceopen', this.delayedCreateBuffers_);
    Object.keys(mimetypes).forEach((type) => {
      console.log('creating sb ' + mimetypes[type]);
      this.queue[type] = [];
      this.buffers[type] = this.mse.addSourceBuffer(mimetypes[type]);
      this.buffers[type].addEventListener('updateend', this.shiftQueue.bind(this, type));
      this.mse.addEventListener('sourceopen', this.shiftQueue.bind(this, type));
      this.shiftQueue(type);
    });
  }

  queueAppend(type, data) {
    this.queue[type].push(this.append.bind(this, type, data));
    this.shiftQueue(type);
  }

  shiftQueue(type) {
    if (!this.buffers[type] || this.buffers[type].updating || this.mse.readyState !== 'open' || !this.queue[type].length) {
      return;
    }
    this.queue[type].shift()();
  }

  append(type, data) {
    // console.log('appending ' + type + ' ' + nextdata.byteLength);
    this.buffers[type].appendBuffer(toUint8(data));
  }

  startStream(url, options) {
    this.stream.streamRequest(url);
    this.stream.on('data', (e) => {
      const datatype = e.detail.datatype === 'muxed' ? 'video' : e.detail.datatype;

      this.queueAppend(datatype, e.detail.data);
    });

    // TODO: api for selecting a format
    this.stream.on('potential-formats', (e) => {
      const supportedFormats = [];

      for (let i = 0; i < e.detail.formats.length; i++) {
        const format = e.detail.formats[i];

        if (Object.keys(format.mimetypes).every((k) => window.MediaSource.isTypeSupported(format.mimetypes[k]))) {
          supportedFormats.push(format);
        }
      }

      console.log('supported formats', supportedFormats);

      this.trigger('supported-formats', {supportedFormats});

    });

    this.stream.on('unsupported', (e) => {
      console.error(e.detail.reason);
      this.reset();
    });

    const startTime = window.performance.now();

    this.stream.on('done', (e) => {
      const types = Object.keys(this.queue);
      const eos = (type) => {
        if (types.some((t) => this.queue[t].length !== 0 || this.buffers[t].updating)) {
          if (this.queue[type].length) {
            this.queue[type].push(eos);
            this.shiftQueue(type);
          }

          return;
        }
        if (this.mse.readyState !== 'open') {
          return;
        }

        console.log('calling end of stream after ' + (window.performance.now() - startTime) + 'ms');
        this.mse.endOfStream();
      };

      types.forEach((type) => {
        this.queue[type].push(eos.bind(null, type));
        this.shiftQueue(type);
      });

    });
  }

  selectFormat(format) {
    console.log('Selecting ', format);
    this.createBuffers(format.mimetypes);
    this.stream.selectOutput(format);
  }

  dispose() {
    this.reset();
    super.dispose();
  }
}
