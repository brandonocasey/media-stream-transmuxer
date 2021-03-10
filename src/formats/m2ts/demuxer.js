import {parseTracksAndInfo, parseFrames} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';
// import {TimeObject} from '../../time-scale.js';

class M2tsDemuxer extends DemuxStream {
  push(data) {
    data = this.mergeLeftoverBytes(data);

    if (!this.state.initDone) {
      this.state.info = parseTracksAndInfo(data);

      this.state.tracks = this.state.info.tracks;

      this.saveLastByte(this.state.info.bytes);
      // delete this.state.info.bytes;

      /*
      this.state.tracks.forEach((track) => {
        this.saveLastByte(track.bytes);
        delete track.bytes;
      });
      */

      // we set timestampScale to 1000 everything will come scaled to that
      // out of the demuxer
      super.push({
        info: {
          duration: this.state.info.duration,
          timestampScale: this.state.info.timestampScale

        },
        tracks: this.state.tracks
      });
      this.state.initDone = true;
    }

    const frames = parseFrames(data, this.state.info);
    // TODO: saveLastByte(frames.length - 1);

    // this.saveLeftoverBytes(data);

    super.push({frames});
  }

  reset() {
    super.reset();
    // this.state.frameIndex = {};
    // this.state.offset = 0;
  }
}

export default M2tsDemuxer;
