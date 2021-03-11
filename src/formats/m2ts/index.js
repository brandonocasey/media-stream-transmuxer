// import Mp4Muxer from './muxer';
import M2tsDemuxer from './demuxer';

export default {
  // Muxer: M2tsMuxer,
  Demuxer: M2tsDemuxer,
  containerMatch: (container) => (/^ts$/).test(container.toLowerCase()),
  baseMimetypes: {video: 'video/mp2t', audio: 'audio/mpt2'},
  name: 'm2ts (mpeg ts)',
  container: 'ts'
};
