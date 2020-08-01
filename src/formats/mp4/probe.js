import {parseTracks} from './demux-helpers.js';

const probeMp4 = (data) => parseTracks(data, true);

export default probeMp4;
