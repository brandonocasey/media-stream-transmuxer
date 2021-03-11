import BmffMuxer from './muxer';
import BmffDemuxer from './demuxer';

export default {
  Muxer: BmffMuxer,
  Demuxer: BmffDemuxer,
  containerMatch: (container) => (/^mp4|mov$/).test(container.toLowerCase()),
  baseMimetypes: {video: 'video/mp4', audio: 'audio/mp4'},
  name: 'bmff (mov/mp4)',
  container: 'mp4'
};
