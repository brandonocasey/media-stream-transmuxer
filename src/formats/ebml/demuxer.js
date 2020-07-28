import {parseData} from './demux-helpers.js';
import Stream from '../../stream.js';
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers.js';

class EbmlDemuxer extends Stream {
  constructor() {
    super();
    this.reset();
  }

  push(data, flush) {
    const allData = concatTypedArrays(this.state.leftover, data);
    const demuxed = parseData(allData, this.state);

    demuxed.frames = [];
    demuxed.clusters.forEach(function(cluster) {
      cluster.blocks.forEach(function(block) {
        block.data = concatTypedArrays.apply(null, block.frames);
        demuxed.frames.push(block);
      });
    });

    this.state.leftover = demuxed.leftover;
    this.state.tracks = demuxed.tracks;
    this.state.info = demuxed.info;

    if (!demuxed.frames.length && !flush) {
      this.state.leftover = allData;
      return;
    }
    this.state.lastClusterTimestamp = demuxed.clusters && demuxed.clusters.length && demuxed.clusters[demuxed.clusters.length - 1].timestamp;

    super.push(demuxed);
  }

  reset() {
    // TODO: rename to segmentInfo, tracks, leftoverBytes
    this.state = {
      info: null,
      tracks: null,
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
