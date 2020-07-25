/* eslint-disable no-console */
import shallowEqual from '../shallow-equal.js';
import Stream from '../stream';
import EventTarget from '../event-target.js';
import Formats from '../formats/index.js';
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import {parseFormatForBytes} from '@videojs/vhs-utils/dist/format-parser';
import getCodecString from './get-codec-string.js';

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

  init(outputs) {
    let outputFormat;

    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i];

      if (!output.canPlay) {
        continue;
      }

      if (output.type === 'muxed' && this.options.allowPassthrough && this.input.container === output.container && shallowEqual(this.input.codecs, output.codecs)) {
        this.output = output;
        this.demuxer = new Stream();
        this.muxer = new Stream();
        console.log('using passthrough demuxer');
        console.log('using passthrough muxer');
        // TODO: dont hardcode this
        outputFormat = Formats[0];
        break;
      }

      for (let z = 0; z < Formats.length; z++) {
        const format = Formats[z];

        if (!this.demuxer && format.containerMatch(this.input.container)) {
          this.demuxer = new format.Demuxer();
          this.output = output;
          console.log(`using ${format.name} demuxer`);
        }

        if (!this.muxer && format.containerMatch(output.container)) {
          this.muxer = new format.Muxer();
          this.output = output;
          outputFormat = format;
          console.log(`using ${format.name} muxer`);
        }
      }
    }

    if (!this.initialized()) {
      this.trigger('unsupported', {reason: `cannot transmux ${this.input} with ${JSON.stringify(this.codecs)} to anything supported`});
      this.reset();
      return;
    }

    const trackinfo = {};

    if (this.output.type !== 'split') {
      const type = this.output.codecs.video ? 'video' : 'audio';

      trackinfo[type] = getCodecString(outputFormat.baseMimetypes[type], this.output.codecs);
    } else {
      trackinfo.video = getCodecString(outputFormat.baseMimetypes.video, {video: this.output.codecs.video});
      trackinfo.audio = getCodecString(outputFormat.baseMimetypes.audio, {audio: this.output.codecs.audio});
    }

    this.trigger('trackinfo', {trackinfo});

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

    // TODO: use format probes
    if (!this.haveInputFormat()) {
      this.input = parseFormatForBytes(this.storedData);

      if (this.haveInputFormat()) {
        this.trigger('format', {format: this.input});
      }
    }
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
