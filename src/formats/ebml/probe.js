import {parseTracks} from './demux-helpers.js';

const probeEbml = (data) => parseTracks(data, true);

export default probeEbml;
