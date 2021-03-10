import {parseTracksAndInfo, parseFrames} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';
// import {TimeObject} from '../../time-scale.js';

class AdtsDemuxer extends DemuxStream {
  push(data) {
    data = this.mergeLeftoverBytes(data);

    if (!this.state.initDone) {
      const {info, tracks} = parseTracksAndInfo(data);

      this.state.info = info;
      this.state.tracks = tracks;

      super.push({
        info: {
          duration: this.state.info.duration,
          timestampScale: this.state.info.timestampScale

        },
        tracks: this.state.tracks
      });
      this.state.initDone = true;
    }

    const frames = parseFrames(data, {info: this.state.info, tracks: this.state.tracks});

    if (frames.length) {
      this.saveLastByte(frames[frames.length - 1].data);
      super.push({frames});
    }
    this.saveLeftoverBytes(data);
  }

  reset() {
    super.reset();
    // this.state.frameIndex = {};
    // this.state.offset = 0;
  }
}

export default AdtsDemuxer;
