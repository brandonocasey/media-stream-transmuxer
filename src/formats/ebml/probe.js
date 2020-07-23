import {parseTracks} from '@videojs/vhs-utils/dist/ebml-helpers.js';

// TODO: probe should have a "fullOnly" mode
const probeEbml = (data) => parseTracks(data, true);

export default probeEbml;
