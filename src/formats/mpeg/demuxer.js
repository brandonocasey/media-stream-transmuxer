import {parseTracksAndInfo, parseFrames} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';

class MpegDemuxer extends DemuxStream {
  static probe(data) {
    return parseTracksAndInfo(data);
  }
  parse(data) {
    let offset = 0;

    if (!this.state.initDone) {
      if (!this.state.info || !this.state.tracks) {
        this.state = MpegDemuxer.probe(data);
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
    }

    const frames = parseFrames(data, this.state);

    if (frames.length) {
      this.state.lastFrame = frames[frames.length - 1];

      this.trigger('data', {data: {frames}});
      offset = this.getLastByte(this.state.lastFrame.data);
    }

    return offset;
  }

  flush() {
    super.flush();
  }

  reset() {
    super.reset();
    this.state.cache = null;
  }
}

export default MpegDemuxer;
