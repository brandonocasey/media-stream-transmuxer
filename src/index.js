/* eslint-disable no-console */
import requestStream from './request-stream.js';
import MuxWorker from 'worker!../dist/mux-worker.worker.js';
import window from 'global/window';
import EventTarget from './event-target.js';

class XhrStreamer extends EventTarget {
  constructor() {
    super();
    this.worker_ = null;
    this.handleMessage = this.handleMessage.bind(this);
  }

  createWorker_() {
    if (this.worker_) {
      return;
    }

    this.worker_ = new MuxWorker();
    this.worker_.addEventListener('message', this.handleMessage);
    this.worker_.postMessage({type: 'init', options: {allowPassthrough: false}});
  }

  streamRequest(uri) {
    this.createWorker_();

    const dataFn = (data) => {
      this.worker_.postMessage({type: 'push', data: data.buffer}, [data.buffer]);
    };
    const doneFn = () => {
      this.abort_ = null;
      this.worker_.postMessage({type: 'flush'});
    };

    this.abort_ = requestStream(uri, dataFn, doneFn);
  }

  abort() {
    if (this.abort_) {
      this.abort_();
    }

    if (this.worker_) {
      this.worker_.postMessage({type: 'abort'});
    }
  }

  handleMessage(e) {
    const message = e.data;

    switch (message.type) {
    case 'canPlay':
      this.worker_.postMessage({
        type: 'canPlayResponse',
        formats: message.formats.map((obj) => Object.assign(obj, {
          canPlay: !obj.mimetypes.some((m) => !window.MediaSource.isTypeSupported(m))
        }))
      });
      break;
    default:
      this.trigger(message.type, message);
      break;
    }

  }

  dispose() {
    this.worker_.removeEventListener('message', this.handleMessage);
    this.worker_.terminate();
  }

}

export default XhrStreamer;
