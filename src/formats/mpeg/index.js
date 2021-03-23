// import MpegMuxer from './muxer';
import MpegDemuxer from './demuxer';

export default {
  // Muxer: MpegMuxer,
  Demuxer: MpegDemuxer,
  containerMatch: (container) => (/^mp3$/).test(container.toLowerCase()),
  baseMimetypes: {audio: 'audio/mp3'},
  name: 'mp3 (mpeg 1 layer III)',
  container: 'mp3'
};
