import {parseSegmentInfo, parseTracks, parseBlocks, parseClusters} from './demux-helpers.js';
import Stream from '../../stream.js';
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers.js';
import findFurthestByte from '../../find-furthest-byte.js';
import {TimeObject} from '../../time-scale.js';

const blocksToFrames = (blocks) => blocks.reduce(function(acc, block) {
  acc.push.apply(acc, block.frames.map(function(frame) {
    return Object.assign({}, block, {data: frame});
  }));

  return acc;
}, []);

class EbmlDemuxer extends Stream {
  constructor({tracks}) {
    super();
    this.reset();
    if (tracks && tracks.length) {
      this.state.tracks = tracks;
    }
  }

  push(data) {
    data = concatTypedArrays(this.state.leftover, data);

    const rawDatas = [];
    const info = parseSegmentInfo(data);

    if (info && info.timestampScale) {
      this.state.timestampScale = info.timestampScale;
      rawDatas.push(info.raw);
      info.timestampScale = new TimeObject(1000000, 'ns');

      super.push({info});
    }
    const tracks = this.state.tracks.length ? this.state.tracks.slice() : parseTracks(data);

    if (tracks && tracks.length) {
      this.state.tracks.length = 0;
      rawDatas.push(tracks[tracks.length - 1].raw);
      super.push({tracks: tracks.slice()});
    }

    let leftoverBlocks;

    if (typeof this.state.lastClusterTimestamp === 'number') {
      leftoverBlocks = parseBlocks(data, this.state.lastClusterTimestamp);
      const frames = blocksToFrames(leftoverBlocks);

      if (frames && frames.length) {
        rawDatas.push(frames[frames.length - 1].raw);
        super.push({frames});
      }
    }

    const clusters = parseClusters(data, this.state.timestampScale);

    if (clusters && clusters.length) {
      let lastCluster;

      clusters.forEach((cluster) => {
        const frames = blocksToFrames(cluster.blocks);

        if (frames && frames.length) {
          lastCluster = cluster;
          super.push({frames});
        }
      });
      if (lastCluster) {
        rawDatas.push(lastCluster.blocks[lastCluster.blocks.length - 1].raw);
        this.state.lastClusterTimestamp = lastCluster.timestamp;
      }
    }

    const lastByte = findFurthestByte(rawDatas);

    // nothing was found, all data is "leftover"
    if (lastByte === -1) {
      this.state.leftover = data;
    } else if (lastByte === data.byteLength) {
      this.state.leftover = null;
    } else {
      this.state.leftover = data.subarray(lastByte);
    }
  }

  reset() {
    this.state = {
      timestampScale: null,
      leftover: null,
      lastClusterTimestamp: null,
      tracks: []
    };
  }

  flush() {
    super.flush();
  }
}

export default EbmlDemuxer;
