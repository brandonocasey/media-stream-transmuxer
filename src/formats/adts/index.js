// import Mp4Muxer from './muxer';
import AdtsDemuxer from './demuxer';
import AdtsProbe from './probe';

export default {
  // Muxer: M2tsMuxer,
  Demuxer: AdtsDemuxer,
  probe: AdtsProbe,
  containerMatch: (container) => (/^adts|aac$/).test(container.toLowerCase()),
  baseMimetypes: {audio: 'audio/aac'},
  name: 'adts (aac audio)',
  container: 'aac'
};
