/* eslint-disable no-console */
import shallowEqual from '../shallow-equal.js';
import Stream from '../stream';
import EventTarget from '../event-target.js';
import Formats from '../formats/index.js';
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import {detectContainerForBytes} from '@videojs/vhs-utils/dist/containers';
import mimetypePermutations from './mimetype-permutations.js';

class TransmuxController extends EventTarget {
  constructor(options) {
    super();
    this.options = Object.assign({
      allowPassthrough: true
    }, options);

    this.reset();
  }

  reset() {
    this.storedData = null;
    this.input = null;
    this.output = null;
  }

  initialized() {
    return !!(this.demuxer && this.muxer);
  }

  init(output) {
    const canPassThrough = this.options.allowPassthrough &&
      this.input.container === output.container &&
      shallowEqual(this.input.codecs, output.codecs);

    if (canPassThrough) {
      this.output = output;
      this.demuxer = new Stream();
      this.muxer = new Stream();
      console.log('using passthrough demuxer');
      console.log('using passthrough muxer');
    }

    for (let i = 0; i < Formats.length; i++) {
      const format = Formats[i];

      if (this.demuxer && this.muxer) {
        break;
      }

      if (!this.demuxer && format.containerMatch(this.input.container)) {
        this.demuxer = new format.Demuxer();
        this.output = output;
        console.log(`using ${format.name} demuxer`);
      }

      if (!this.muxer && format.containerMatch(output.container)) {
        this.muxer = new format.Muxer({muxed: this.output.type === 'muxed'});
        this.output = output;
        console.log(`using ${format.name} muxer`);
      }
    }

    if (!this.initialized()) {
      this.trigger('unsupported', {
        reason: `cannot transmux container '${this.input.container}' with codecs ${JSON.stringify(this.input.codecs)} to anything supported by this browser.`
      });
      this.reset();
      return;
    }

    this.demuxer.pipe(this.muxer);

    // TODO: do we create two muxers for split content??
    this.muxer.on('data', (e) => {
      this.trigger('data', {
        data: e.detail.data,
        datatype: this.output.type !== 'split' && this.output.codecs.video ? 'video' : 'audio'
      });
    });

    this.muxer.on('done', (e) => {
      this.trigger('done');
    });

    this.push();
  }

  haveInputFormat() {
    return (this.input && Object.keys(this.input.codecs).length);
  }

  push(data) {
    this.storedData = concatTypedArrays(this.storedData, data);

    if (this.initialized()) {

      if (this.storedData.length) {
        this.demuxer.push(this.storedData);
        this.storedData = null;
      }
      if (this.flushAfterPush_) {
        this.flush();
      }
      return;
    }

    if (this.haveInputFormat()) {
      return;
    }
    const container = detectContainerForBytes(this.storedData);

    if (!container) {
      return;
    }

    let format;

    for (let i = 0; i < Formats.length; i++) {
      format = Formats[i];

      if (format.containerMatch(container)) {
        break;
      }
    }

    if (!format) {
      return;
    }

    const tracks = format.probe(this.storedData);

    if (!tracks || !tracks.length) {
      return;
    }

    // TODO: pass tracks to the demuxer for re-use
    // so they won't be parsed again.

    this.input = {tracks, container, codecs: {}};

    tracks.forEach((track) => {
      this.input.codecs[track.type] = track.codec;
    });
    this.trigger('input-format', {format: {codecs: this.input.codecs, container: this.input.container}});
    this.trigger('potential-formats', {formats: mimetypePermutations(this.input.codecs)});
  }

  flush() {
    if (!this.demuxer) {
      this.flushAfterPush_ = true;
    } else {
      this.flushAfterPush_ = false;
      if (this.storedData) {
        this.push();
      }
      this.demuxer.flush();
    }
  }
}

export default TransmuxController;
