import {generateEbml} from './mux-helpers.js';
import Stream from '../../stream.js';

class EbmlMuxer extends Stream {
  constructor(options) {
    super();
    this.reset();
  }

  push(demuxed, flush = false) {
    const data = generateEbml(demuxed, this.state, {clustersOnly: this.clustersOnly, flush});

    this.state.info = demuxed.info;
    this.state.tracks = demuxed.tracks;

    if (!data || !data.length) {
      return;
    }
    this.clustersOnly = true;

    super.push(data);
  }

  reset() {
    // TODO: rename to segmentInfo, tracks, leftoverBytes
    this.state = {
      frames: [],
      tracks: [],
      info: {}
    };
  }

  flush() {
    this.push({tracks: this.state.tracks, info: this.state.info, frames: []}, true);
    super.flush();
  }
}

export default EbmlMuxer;
