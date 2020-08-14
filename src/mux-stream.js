import Stream from './stream.js';

class MuxStream extends Stream {
  constructor({track} = {}) {
    super();
    this.state = {};
    this.reset();

    if (track) {
      this.state.tracks = [track];
    }
  }

  push(demuxed) {
    if (!this.state.tracks.length && demuxed.tracks) {
      this.state.tracks = demuxed.tracks;
    }

    if (demuxed.info) {
      this.state.info = demuxed.info;
    }

    if (!this.state.initDone && (!this.state.tracks || !this.state.info)) {
      return;
    }

    if (this.state.info && this.state.tracks && !this.state.initDone) {
      const data = this.initSegment({info: this.state.info, tracks: this.state.tracks});

      if (data) {
        if (this.state.tracks.length === 1) {
          this.state.type = this.state.tracks[0].type;
        } else {
          this.state.type = 'muxed';
        }
        super.push({data, datatype: this.state.type});
        this.state.initDone = true;
      }
    }

    if (demuxed.frames && demuxed.frames.length) {
      const data = this.dataSegment({info: this.state.info, tracks: this.state.tracks, frames: demuxed.frames});

      if (data) {
        super.push({data, datatype: this.state.type});
      }
    }
  }

  reset() {
    Object.assign(this.state, {
      type: null,
      info: null,
      initDone: false,
      trackFilter: null
    });

    this.state.tracks = this.state.tracks || [];
    this.state.tracks.length = 0;
  }

  flush() {
    this.reset();
    this.trigger('done');
  }
}

export default MuxStream;
