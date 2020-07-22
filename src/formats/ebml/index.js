import {parseData, parseTracks} from '@videojs/vhs-utils/dist/ebml-helpers.js';
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers.js';
import generateEBML from './mux.js';

const probe = (bytes) => parseTracks(bytes);

const demux = function(bytes, tracks) {
  const parsed = parseData(bytes, tracks);

  parsed.frames = [];

  parsed.blocks.forEach(function(block) {
    parsed.frames.push({
      trackNumber: block.trackNumber,
      keyframe: block.keyframe,
      invisible: block.invisible,
      timestamp: block.timestamp,
      discardable: block.discardable,
      pts: block.pts,
      dts: block.dts,
      data: concatTypedArrays.apply(null, block.frames)
    });
  });

  return parsed;
};

const mux = function(dataObj, outputFormat) {
  return generateEBML(dataObj, outputFormat);
};

export default {mux, demux, probe};
