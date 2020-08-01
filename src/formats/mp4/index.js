import Mp4Muxer from './muxer';
import Mp4Demuxer from './demuxer';
import Mp4Probe from './probe';

export default {
  Muxer: Mp4Muxer,
  Demuxer: Mp4Demuxer,
  probe: Mp4Probe,
  containerMatch: (container) => (/^mp4|mov$/).test(container.toLowerCase()),
  baseMimetypes: {video: 'video/mp4', audio: 'audio/mp4'},
  name: 'mp4 (mov/mp4)',
  container: 'mp4'
};
