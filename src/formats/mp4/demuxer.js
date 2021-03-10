import {parseTracks, parseMediaInfo} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';

class Mp4Demuxer extends DemuxStream {
  static probe(data) {
    return {tracks: parseTracks(data, true)};
  }

  parse(data) {
    let offset = 0;

    if (!this.state.initDone) {
      this.state.info = parseMediaInfo(data);
      this.state.tracks = this.state.tracks.length ? this.state.tracks : Mp4Demuxer.probe(data).tracks;

      offset = this.getLastByte(this.state.info.bytes);

      this.state.tracks.forEach((track) => {
        const lastByte = this.getLastByte(track.bytes);

        if (offset < lastByte) {
          offset = lastByte;
        }
      });

      this.trigger('data', {
        data: {
          info: {
            duration: this.state.info.duration,
            timestampScale: this.state.info.timestampScale
          },
          tracks: this.state.tracks
        }
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

        offset = this.getLastByte(frame.data);

        frames.push(frame);
      }
    });

    this.state.offset += offset;

    this.trigger('data', {data: {frames}});

    return offset;
  }

  reset() {
    super.reset();
    this.state.frameIndex = {};
    this.state.offset = 0;
  }
}

export default Mp4Demuxer;
