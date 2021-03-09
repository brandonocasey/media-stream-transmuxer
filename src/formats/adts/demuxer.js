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

      // TODO:
      // this.saveLastByte(this.state.info.bytes);
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

    const frames = parseFrames(data, {info: this.state.info, tracks: this.state.tracks});
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

export default AdtsDemuxer;
