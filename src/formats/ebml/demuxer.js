import {parseSegmentInfo, parseTracks, parseBlocks, parseClusters} from './demux-helpers.js';
import DemuxStream from '../../demux-stream.js';

class EbmlDemuxer extends DemuxStream {
  pushBlocksToFrames_(blocks) {
    let last = 0;

    const frames = blocks.reduce((acc, block) => {
      acc.push.apply(acc, block.frames.map((frame) => {
        last = this.getLastByte(frame);

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
      this.trigger('data', {data: {frames}});
    }

    return last;
  }

  static probe(data) {
    return {tracks: parseTracks(data, true)};
  }

  parse(data) {
    let lastByte = 0;

    if (!this.state.initDone) {
      this.state.info = this.state.info || parseSegmentInfo(data);
      this.state.tracks = this.state.tracks.length ? this.state.tracks : EbmlDemuxer.probe(data).tracks;

      lastByte = this.getLastByte(this.state.info.bytes);

      this.state.tracks.forEach((track) => {
        const last = this.getLastByte(track.bytes);

        if (lastByte < last) {
          lastByte = last;
        }
      });
      this.trigger('data', {data: {
        tracks: this.state.tracks,
        info: {
          duration: this.state.info.duration,
          timestampScale: this.state.info.timestampScale
        }
      }});

      this.state.initDone = true;
    }

    if (typeof this.state.lastClusterTimestamp === 'number') {
      const last = this.pushBlocksToFrames_(parseBlocks(data, this.state.lastClusterTimestamp));

      if (lastByte < last) {
        lastByte = last;
      }
    }

    const clusters = parseClusters(data, this.state.info.timestampScale);

    if (clusters && clusters.length) {
      clusters.forEach((cluster) => {
        this.state.lastClusterTimestamp = cluster.timestamp;
        const last = this.pushBlocksToFrames_(cluster.blocks);

        if (lastByte < last) {
          lastByte = last;
        }
      });
    }

    return lastByte;
  }

  reset() {
    super.reset();
    this.state.timestampScale = null;
    this.state.lastClusterTimestamp = null;
  }
}

export default EbmlDemuxer;
