import {parseData, parseTracks} from '@videojs/vhs-utils/dist/ebml-helpers.js';
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers.js';
import generateEBML from './mux.js';

const probe = (bytes) => parseTracks(bytes);

const demux = function(bytes, state) {
  const parsed = parseData(bytes, state);

  state.info = parsed.info;
  state.tracks = parsed.tracks;

  parsed.frames = [];

  parsed.blocks.forEach(function(block, i) {
    parsed.frames.push(Object.assign(block, {
      data: concatTypedArrays.apply(null, block.frames)
    }));
  });

  if (!parsed.frames.length) {
    parsed.frames.length = 0;
    parsed.leftover = bytes;
  }

  state.leftover = parsed.leftover;

  return parsed;
};

// TODO: remove "state" from generateEBML
const mux = generateEBML;

export default {mux, demux, probe};
