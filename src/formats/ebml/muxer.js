import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import {initSegment, encodeCluster, encodeBlock} from './mux-helpers.js';
import Stream from '../../stream.js';

class EbmlMuxer extends Stream {
  constructor({track} = {}) {
    super();
    this.track = track;
    this.reset();
  }

  push(demuxed) {
    let data;

    if (demuxed.info) {
      this.state.initData.info = demuxed.info;
    }

    if (demuxed.tracks) {
      this.state.initData.tracks = !this.track ? demuxed.tracks : demuxed.tracks.filter((t) => t.number === this.track.number);
    }

    if (!this.state.initDone && (!this.state.initData.tracks || !this.state.initData.info)) {
      return;
    }

    if (!this.state.initDone && demuxed.frames) {
      this.state.initDone = true;
      data = initSegment(this.state.initData);

      this.state.initData.tracks.forEach((track) => {
        this.state.keyframesSeen[track.number] = true;
      });
      this.state.initData = {tracks: null, info: null};
    }

    demuxed.frames = demuxed.frames || [];

    const allKeyframes = demuxed.frames.every((f) => f.keyframe);

    for (let i = 0; i < demuxed.frames.length; i++) {
      const frame = demuxed.frames[i];

      if (this.track && frame.trackNumber !== this.track.number) {
        continue;
      }

      if (frame.keyframe) {
        this.state.keyframesSeen[frame.trackNumber] = true;
      }

      const keyframesSeen = Object.keys(this.state.keyframesSeen).every((number) => this.state.keyframesSeen[number]);

      // new cluster
      if ((!allKeyframes && keyframesSeen) || (allKeyframes && (i % 40) === 0)) {
        this.state.lastClusterTimestamp = frame.timestamp;
        Object.keys(this.state.keyframesSeen).forEach((number) => {
          this.state.keyframesSeen[number] = false;
        });
        data = concatTypedArrays(data, encodeCluster(frame.timestamp));
      }

      data = concatTypedArrays(data, encodeBlock(frame, this.state.lastClusterTimestamp));
    }

    if (data && data.length) {
      super.push(data);
    }
  }

  reset() {
    this.state = {
      initData: {tracks: null, info: null},
      initDone: false,
      lastClusterTimestamp: null,
      keyframesSeen: {}
    };
  }

  flush() {
    this.reset();
    super.flush();
  }
}

export default EbmlMuxer;
