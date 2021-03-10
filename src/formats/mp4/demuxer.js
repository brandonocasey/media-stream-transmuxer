import {parseTracks, parseMediaInfo} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';
import {TimeObject} from '../../time-scale.js';

class Mp4Demuxer extends DemuxStream {
  parse(data) {
    if (!this.state.initDone) {
      this.state.info = parseMediaInfo(data);
      this.state.tracks = this.state.tracks.length ? this.state.tracks : parseTracks(data);

      this.saveLastByte(this.state.info.bytes);
      delete this.state.info.bytes;

      this.state.tracks.forEach((track) => {
        this.saveLastByte(track.bytes);
        delete track.bytes;
      });

      // we set timestampScale to 1000 everything will come scaled to that
      // out of the demuxer
      super.push({
        info: {
          duration: (this.state.info.duration / this.state.info.timestampScale) * 1000,
          timestampScale: new TimeObject(1000, 'ms')

        },
        tracks: this.state.tracks
      });
      this.state.initDone = true;
    }

    const frames = [];

    this.state.tracks.forEach((track) => {
      this.state.frameIndex[track.number] = this.state.frameIndex[track.number] || 0;

      for (; this.state.frameIndex[track.number] < track.frameTable.length; this.state.frameIndex[track.number]++) {
        const {start, end, keyframe, timestamp, duration} = track.frameTable[this.state.frameIndex[track.number]];

        if ((end - this.state.offset) > data.length) {
          break;
        }

        const frame = {
          duration,
          trackNumber: track.number,
          keyframe,
          timestamp,
          data: data.subarray((start - this.state.offset), (end - this.state.offset))
        };

        this.saveLastByte(frame.data);

        frames.push(frame);
      }
    });

    if (this.state.lastByte !== -1) {
      this.state.offset += this.state.lastByte;
    }
    this.saveLeftoverBytes(data);

    super.push({frames});
  }

  reset() {
    super.reset();
    this.state.frameIndex = {};
    this.state.offset = 0;
  }
}

export default Mp4Demuxer;
