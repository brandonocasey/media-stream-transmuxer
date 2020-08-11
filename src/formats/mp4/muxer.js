import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import Stream from '../../stream.js';
import {dataSegment, initSegment} from './mux-helpers.js';

class Mp4Muxer extends Stream {
  constructor({track} = {}) {
    super();
    this.track = track;
    this.reset();
  }

  push(demuxed) {
    if (demuxed.tracks) {
      this.state.tracks = !this.track ? demuxed.tracks : demuxed.tracks.filter((t) => t.number === this.track.number);
    }

    if (demuxed.info) {
      this.state.info = demuxed.info;
    }

    if (!this.state.initDone && (!this.state.tracks || !this.state.info)) {
      return;
    }
    let data;

    if (!this.state.initDone && demuxed.frames) {
      this.state.initDone = true;
      data = initSegment({tracks: this.state.tracks, info: this.state.info});
    }
    let frames = demuxed.frames || [];

    if (this.track) {
      frames = frames.filter((f) => this.track.number === f.trackNumber);
    }

    if (frames.length) {
      data = concatTypedArrays(data, dataSegment({
        sequenceNumber: this.state.sequenceNumber,
        tracks: this.state.tracks,
        info: this.state.info,
        frames
      }));
      this.state.sequenceNumber++;
    }

    if (data && data.length) {
      super.push(data);
    }
  }

  reset() {
    this.state = {
      tracks: null,
      info: null,
      initDone: false,
      sequenceNumber: 1,
      keyframesSeen: {}
    };
  }

  flush() {
    this.reset();
    super.flush();
  }
}

export default Mp4Muxer;
