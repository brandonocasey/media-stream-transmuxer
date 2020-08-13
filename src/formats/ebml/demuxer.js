import {parseSegmentInfo, parseTracks, parseBlocks, parseClusters} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';
import {TimeObject} from '../../time-scale.js';

class EbmlDemuxer extends DemuxStream {
  pushBlocksToFrames_(blocks) {
    const frames = blocks.reduce((acc, block) => {
      // TODO: timestamp/duration/etc will not work with lacing
      acc.push.apply(acc, block.frames.map((frame) => {
        this.saveLastByte(frame);

        return {
          trackNumber: block.trackNumber,
          keyframe: block.keyframe,
          duration: block.duration,
          timestamp: block.timestamp,
          data: frame
        };
      }));

      return acc;
    }, []);

    if (frames && frames.length) {
      super.push({frames});
    }
  }

  push(data) {
    data = this.mergeLeftoverBytes(data);

    if (!this.state.initDone) {
      this.state.info = this.state.info || parseSegmentInfo(data);
      this.state.tracks = this.state.tracks.length ? this.state.tracks : parseTracks(data);

      this.saveLastByte(this.state.info.raw);
      delete this.state.info.raw;

      this.state.tracks.forEach((track) => {
        this.saveLastByte(track.raw);
        delete track.raw;
      });
      super.push({
        tracks: this.state.tracks,
        info: {
          duration: this.state.info.duration,
          timestampScale: new TimeObject(1000000, 'ns')
        }
      });
      this.state.initDone = true;
    }

    if (typeof this.state.lastClusterTimestamp === 'number') {
      this.pushBlocksToFrames_(parseBlocks(data, this.state.lastClusterTimestamp));
    }

    const clusters = parseClusters(data, this.state.info.timestampScale);

    if (clusters && clusters.length) {
      clusters.forEach((cluster) => {
        this.state.lastClusterTimestamp = cluster.timestamp;
        this.pushBlocksToFrames_(cluster.blocks);
      });
    }

    this.saveLeftoverBytes(data);
  }

  reset() {
    super.reset();
    this.state.timestampScale = null;
    this.state.lastClusterTimestamp = null;
  }
}

export default EbmlDemuxer;
