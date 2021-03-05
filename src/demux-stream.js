import Stream from './stream.js';
import {concatTypedArrays} from '@videojs/vhs-utils/cjs/byte-helpers.js';

class DemuxStream extends Stream {
  constructor({tracks} = {}) {
    super();
    this.state = {tracks: []};
    this.reset();

    if (tracks && tracks.length) {
      this.state.tracks.push.apply(this.state.tracks, tracks);
    }
  }

  mergeLeftoverBytes(data) {
    return concatTypedArrays(this.state.leftoverBytes, data);
  }

  saveLastByte(bytes) {
    const lastByte = bytes.byteLength + bytes.byteOffset;

    if (this.state.lastByte < lastByte) {
      this.state.lastByte = lastByte;
    }
  }

  saveLeftoverBytes(data) {
    // nothing was found, all data is "leftover"
    if (this.state.lastByte === -1) {
      this.state.leftoverBytes = data;
    } else if (this.state.lastByte === data.byteLength) {
      this.state.leftoverBytes = null;
    } else {
      this.state.leftoverBytes = data.subarray(this.state.lastByte);
    }

    this.state.lastByte = -1;
  }

  reset() {
    this.state.tracks.length = 0;
    this.state.info = null;
    this.state.leftoverBytes = null;
    this.state.initDone = false;
    this.state.lastByte = -1;
  }

  flush() {
    this.reset();
    this.trigger('done');
  }
}

export default DemuxStream;
