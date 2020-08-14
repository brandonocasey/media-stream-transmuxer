import MuxStream from '../../mux-stream.js';
import {dataSegment, initSegment} from './mux-helpers.js';

class Mp4Muxer extends MuxStream {
  initSegment(options) {
    return initSegment(options);
  }

  dataSegment({info, tracks, frames}) {
    this.state.leftoverFrames.push.apply(this.state.leftoverFrames, frames);

    const data = dataSegment({
      sequenceNumber: this.state.sequenceNumber,
      tracks,
      info,
      frames: this.state.leftoverFrames
    });

    if (data) {
      this.state.leftoverFrames.length = 0;
      this.state.sequenceNumber++;
    }

    return data;
  }

  reset() {
    super.reset();
    this.state.sequenceNumber = 1;
    this.state.leftoverFrames = this.state.leftoverFrames || [];
    this.state.leftoverFrames.length = 0;
  }

  flush() {
    this.reset();
    super.flush();
  }
}

export default Mp4Muxer;
