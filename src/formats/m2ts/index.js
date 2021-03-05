// import Mp4Muxer from './muxer';
import M2tsDemuxer from './demuxer';
import M2tsProbe from './probe';

export default {
  // Muxer: M2tsMuxer,
  Demuxer: M2tsDemuxer,
  probe: M2tsProbe,
  containerMatch: (container) => (/^ts$/).test(container.toLowerCase()),
  baseMimetypes: {video: 'video/mp2t', audio: 'audio/mpt2'},
  name: 'm2ts (mpeg ts)',
  container: 'ts'
};
