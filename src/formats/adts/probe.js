import {parseTracksAndInfo} from './demux-helpers.js';

// TODO: allow probe to pass all info
const probeAdts = (data) => {
  const info = parseTracksAndInfo(data) || {};

  return info.tracks;
};

export default probeAdts;
