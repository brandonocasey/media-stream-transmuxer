import {parseTracksAndInfo, parseFrames} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';

class H265Demuxer extends DemuxStream {
  static probe(data) {
    return parseTracksAndInfo(data);
  }
  parse(data) {
    let offset = 0;

    if (!this.state.initDone) {
      if (!this.state.info || !this.state.tracks) {
        this.state = H265Demuxer.probe(data);
      }

      // not enough data to parse info/tracks yet
      if (!this.state.info || !this.state.tracks) {
        return;
      }

      this.trigger('data', {
        data: {
          info: this.state.info,
          tracks: this.state.tracks
        }
      });
      this.state.initDone = true;
    }

    this.state.cache = this.state.cache || {};

    const {frames, cache} = parseFrames(data, this.state.cache, {offset});

    if (frames.length) {
      this.state.cache = cache;

      this.trigger('data', {data: {frames}});
      offset = this.getLastByte(this.state.cache.lastFrame.data);
    }

    return offset;
  }

  flush() {
    if (this.state.cache.currentFrame) {
      const frame = this.state.cache.currentFrame;

      this.state.cache.lastFrame = this.state.cache.currentFrame;
      this.state.cache.currentFrame = null;

      this.trigger('data', {data: {frames: [frame]}});
    }

    super.flush();
  }

  reset() {
    super.reset();
    this.state.cache = null;
  }
}

export default H265Demuxer;
