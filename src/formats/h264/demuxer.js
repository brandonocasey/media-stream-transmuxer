import {parseH264TracksAndInfo, parseH264Frames} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';

class H264Demuxer extends DemuxStream {
  static probe(data) {
    return parseH264TracksAndInfo(data);
  }
  parse(data) {
    let offset = 0;

    if (!this.state.initDone) {
      if (!this.state.info || !this.state.tracks) {
        this.state = H264Demuxer.probe(data);
      }

      // not enough data to parse info/tracks yet
      if (!this.state.info || !this.state.tracks) {
        return;
      }

      this.trigger('data', {
        data: {
          info: this.state.info,
          tracks: this.state.tracks,
          frames: [this.state.cache.lastFrame]
        }
      });
      this.state.initDone = true;
      offset = this.getLastByte(this.state.cache.lastFrame.data);
    }

    const {frames, cache} = parseH264Frames(data, this.state.cache, {offset});

    if (frames.length) {
      this.state.cache = cache;

      this.trigger('data', {data: {frames}});
      offset = this.getLastByte(this.state.cache.lastFrame.data);
    }

    return offset;
  }

  reset() {
    super.reset();
    this.state.cache = null;
  }
}

export default H264Demuxer;
