import {parseTracksAndInfo} from './demux-helpers.js';

// TODO: allow probe to pass all info
const probeM2ts = (data) => {
  const info = parseTracksAndInfo(data) || {};

  return info.tracks;
};

export default probeM2ts;
