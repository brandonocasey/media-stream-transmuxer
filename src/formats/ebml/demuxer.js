import {parseData} from '@videojs/vhs-utils/dist/ebml-helpers.js';
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

    demuxed.frames = demuxed.blocks.map(function(block) {
      block.data = concatTypedArrays.apply(null, block.frames);
      return block;
    });

    this.state.leftover = demuxed.leftover;
    this.state.tracks = demuxed.tracks;
    this.state.info = demuxed.info;

    if (!demuxed.frames.length && !flush) {
      this.state.leftover = allData;
      return;
    }

    super.push(demuxed);
  }

  reset() {
    // TODO: rename to segmentInfo, tracks, leftoverBytes
    this.state = {
      info: null,
      tracks: null,
      leftover: null
    };
  }

  flush() {
    this.push(this.state.leftover || new Uint8Array(), true);
    super.flush();
  }
}

export default EbmlDemuxer;
