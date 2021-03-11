import {parseTracksAndInfo, parseFrames} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';

class AdtsDemuxer extends DemuxStream {
  static probe(data) {
    return parseTracksAndInfo(data);
  }
  parse(data) {
    let offset = 0;

    if (!this.state.initDone) {
      if (!this.state.info || !this.state.tracks) {
        this.state = AdtsDemuxer.probe(data);
      }

      // not enough data to parse info/tracks yet
      if (!this.state.info || !this.state.tracks) {
        return;
      }

      this.trigger('data', {
        data: {
          info: this.state.info,
          tracks: this.state.tracks,
          frames: [this.state.lastFrame]
        }
      });
      this.state.initDone = true;
      offset = this.getLastByte(this.state.lastFrame.data);
    }

    const frames = parseFrames(data, {
      tracks: this.state.tracks,
      lastFrame: this.state.lastFrame,
      offset
    });

    if (frames.length) {
      this.state.lastFrame = frames[frames.length - 1];

      this.trigger('data', {data: {frames}});
      offset = this.getLastByte(this.state.lastFrame.data);
    }

    return offset;
  }

  reset() {
    super.reset();
    this.state.lastFrame = null;
  }
}

export default AdtsDemuxer;
