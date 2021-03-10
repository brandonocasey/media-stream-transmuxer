import Stream from './stream.js';
import {concatTypedArrays} from '@videojs/vhs-utils/cjs/byte-helpers.js';

class DemuxStream extends Stream {
  constructor(initialState = {}) {
    super();
    this.state = initialState;
    this.reset();

    Object.assign(this.state, initialState);

    this.on('data', (e) => {
      Object.keys(e.detail.data).forEach((key) => {
        if (e.detail.data[key].length) {
          this.emitted[key] += e.detail.data[key].length;
        } else {
          this.emitted[key] += 1;
        }
      });
    });
  }

  getLastByte(data) {
    if (!data || data.length === 0) {
      return -1;
    }

    return data.byteLength + data.byteOffset;
  }

  push(data) {
    data = concatTypedArrays(this.leftoverBytes_, data);

    const lastByte = this.parse(data);

    // all bytes are leftover, nothing was found.
    if (!lastByte || lastByte === -1) {
      this.leftoverBytes_ = data;
    // all bytes were used
    } else if (lastByte === data.byteLength) {
      this.leftoverBytes_ = null;
    // only some bytes were used
    } else {
      this.leftoverBytes_ = data.subarray(lastByte);
    }
  }

  reset() {
    this.leftoverBytes = null;
    this.state = {};
    this.emitted = {
      tracks: 0,
      info: 0,
      frames: 0
    };
  }

  flush() {
    const data = this.emitted;

    this.reset();
    this.trigger('done', {data});
  }
}

export default DemuxStream;
