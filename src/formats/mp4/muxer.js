import Stream from '../../stream.js';

class Mp4Muxer extends Stream {
  constructor({track} = {}) {
    super();
    this.track = track;
    this.reset();
  }

  push(demuxed) {}

  reset() {
    this.state = {};
  }

  flush() {
    this.reset();
    super.flush();
  }
}

export default Mp4Muxer;
