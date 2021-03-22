import {parseTracksAndInfo, parseFrames} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';

class OggDemuxer extends DemuxStream {
  static probe(data) {
    return parseTracksAndInfo(data);
  }

  parse(data) {
    let lastByte = 0;

    if (!this.state.initDone) {
      if (!this.state.info && !this.state.tracks) {
        this.state = OggDemuxer.probe(data);
      }
      if (!this.state.info || !this.state.tracks) {
        return;
      }

      this.trigger('data', {data: {
        info: this.state.info,
        tracks: this.state.tracks
      }});
      this.state.initDone = true;
    }

    const frames = parseFrames(data, this.state);

    if (frames.length) {
      const lastFrame = frames[frames.length - 1];

      this.state.lastFrame = lastFrame;

      lastByte = this.getLastByte(lastFrame.data);
      this.trigger('data', {data: {frames}});
    }

    return lastByte;
  }

  reset() {
    super.reset();
  }
  flush() {
    super.flush();
  }
}

export default OggDemuxer;
