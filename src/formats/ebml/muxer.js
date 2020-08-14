import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import {initSegment, encodeCluster, encodeBlock} from './mux-helpers.js';
import MuxStream from '../../mux-stream.js';

class EbmlMuxer extends MuxStream {
  initSegment(options) {
    const init = initSegment(options);

    options.tracks.forEach((track) => {
      this.state.keyframesSeen[track.number] = true;
    });

    return init;
  }

  dataSegment({info, tracks, frames}) {
    // TODO: better way to do this
    const allKeyframes = frames.every((f) => f.keyframe);
    const datas = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      if (!this.state.tracks.some((t) => t.number === frame.trackNumber)) {
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
        datas.push(encodeCluster(frame.timestamp));
      }

      datas.push(encodeBlock(frame, this.state.lastClusterTimestamp));
    }

    if (datas.length) {
      return concatTypedArrays.apply(null, datas);
    }
  }

  reset() {
    super.reset();
    this.state.lastClusterTimestamp = null;
    this.state.keyframesSeen = {};
  }
}

export default EbmlMuxer;
