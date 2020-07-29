import {parseSegmentInfo, parseTracks, parseBlocks, parseClusters} from './demux-helpers.js';
import Stream from '../../stream.js';
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers.js';

const blocksToFrames = (blocks) => blocks.reduce(function(acc, block) {
  acc.push.apply(acc, block.frames.map(function(frame) {
    return Object.assign({}, block, {data: frame});
  }));

  return acc;
}, []);

const findLastByte = (datas) => datas.reduce(function(acc, data) {
  const end = data.byteLength + data.byteOffset;

  if (end > acc) {
    acc = end;
  }

  return acc;
}, -1);

class EbmlDemuxer extends Stream {
  constructor() {
    super();
    this.reset();
  }

  push(data, flush) {
    data = concatTypedArrays(this.state.leftover, data);

    const rawDatas = [];
    const info = parseSegmentInfo(data);

    if (info && info.timestampScale) {
      this.state.timestampScale = info.timestampScale;
      rawDatas.push(info.raw);
      super.push({info});
    }
    const tracks = parseTracks(data);

    if (tracks && tracks.length) {
      rawDatas.push(tracks[tracks.length - 1].raw);
      super.push({tracks});
    }

    let leftoverBlocks;

    if (typeof this.state.lastClusterTimestamp === 'number') {
      leftoverBlocks = parseBlocks(data, this.state.timestampScale, this.state.lastClusterTimestamp);
      const frames = blocksToFrames(leftoverBlocks);

      if (frames && frames.length) {
        rawDatas.push(frames[frames.length - 1].raw);
        super.push({frames});
      }
    }

    const clusters = parseClusters(data);

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

    const lastByte = findLastByte(rawDatas);

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
      lastClusterTimestamp: null
    };
  }

  flush() {
    this.push(this.state.leftover || new Uint8Array(), true);
    super.flush();
  }
}

export default EbmlDemuxer;
