import {findBox} from './demux-helpers.js';
import Stream from '../../stream.js';
import {bytesToNumber, concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import findFurthestByte from '../../find-furthest-byte.js';

class Mp4Demuxer extends Stream {
  constructor({tracks}) {
    super();
    this.reset();
    this.tracks = tracks;
  }

  push(data) {
    data = concatTypedArrays(this.state.leftover, data);
    const frames = [];
    const rawDatas = [];

    if (!this.state.initDone) {
      const mvhd = findBox(data, ['moov', 'mvhd'], true)[0];

      if (!mvhd || !mvhd.length) {
        return;
      }
      const info = {};

      // ms to ns
      // mvhd v1 has 8 byte duration and other fields too
      if (mvhd[0] === 1) {
        info.timestampScale = bytesToNumber(mvhd.subarray(20, 24)) * 1000;
        info.duration = bytesToNumber(mvhd.subarray(24, 32));
      } else {
        info.timestampScale = bytesToNumber(mvhd.subarray(12, 16)) * 1000;
        info.duration = bytesToNumber(mvhd.subarray(16, 20));
      }

      // TODO:
      this.tracks[1].info = {channels: 2, samplingFrequency: this.tracks[1].timescale, bitDepth: 32};

      super.push({info});
      super.push({tracks: this.tracks});
      this.state.initDone = true;
    }

    this.tracks.forEach((track) => {
      this.state.frameIndex[track.number] = this.state.frameIndex[track.number] || 0;

      for (; this.state.frameIndex[track.number] < track.frames.length; this.state.frameIndex[track.number]++) {
        const {start, end, keyframe, timestamp} = track.frames[this.state.frameIndex[track.number]];

        if ((end - this.state.offset) > data.length) {
          return;
        }

        frames.push({
          trackNumber: track.number,
          keyframe,
          timestamp,
          data: data.subarray((start - this.state.offset), (end - this.state.offset))
        });
      }

      if (frames.length) {
        rawDatas.push(frames[frames.length - 1].data);
      }
    });

    const lastByte = findFurthestByte(rawDatas);

    // nothing was found, all data is "leftover"
    if (lastByte === -1) {
      this.state.leftover = data;
    } else if (lastByte === data.byteLength) {
      this.state.leftover = null;
    } else {
      this.state.offset += lastByte;
      this.state.leftover = data.subarray(lastByte);
    }

    super.push({frames});
  }

  reset() {
    this.state = {
      initDone: false,
      leftover: null,
      frameIndex: {},
      offset: 0
    };
  }

  flush() {
    super.flush();
  }
}

export default Mp4Demuxer;
