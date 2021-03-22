import {parseTracksAndInfo, parseFrames} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';

class M2tsDemuxer extends DemuxStream {
  static probe(data) {
    return parseTracksAndInfo(data);
  }

  parse(data) {
    let lastByte = 0;

    if (!this.state.initDone) {
      if (!this.state.info && !this.state.tracks) {
        this.state = M2tsDemuxer.probe(data);
      }
      if (!this.state.info || !this.state.tracks) {
        return;
      }

      lastByte = this.state.pesOffset;
      this.state.pesOffset = null;

      this.trigger('data', {data: {
        info: this.state.info,
        tracks: this.state.tracks
      }});
      this.state.initDone = true;
    }

    const {frames, lastPidFrames} = parseFrames(data, {
      offset: lastByte,
      lastPidFrames: this.state.lastPidFrames,
      trackPids: this.state.trackPids
    });

    if (frames.length) {
      const lastFrame = frames[frames.length - 1];

      this.state.lastPidFrames = lastPidFrames;

      lastByte = this.getLastByte(lastFrame.data);
      this.trigger('data', {data: {frames}});
    }

    return lastByte;
  }

  reset() {
    super.reset();
  }
  flush() {
    if (this.state.lastPidFrames) {
      this.trigger('data', {data: {frames: Object.values(this.state.lastPidFrames)}});
    }
    super.flush();
  }
}

export default M2tsDemuxer;
