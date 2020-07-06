import {parseData, parseTracks} from '@videojs/vhs-utils/dist/ebml-helpers.js';

const probe = (bytes) => parseTracks(bytes);

const demux = function(bytes, tracks) {
  const parsed = parseData(bytes, tracks);

  // TODO: normalize blocks into frames

  return {tracks: parsed.tracks, frames: []};
};

const mux = function(tracks, frames) {
  return new Uint8Array();
};

export default {mux, demux, probe};
