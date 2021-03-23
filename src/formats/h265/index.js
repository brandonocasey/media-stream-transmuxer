// import Mp4Muxer from './muxer';
import H265Demuxer from './demuxer';

export default {
  // Muxer: M2tsMuxer,
  Demuxer: H265Demuxer,
  containerMatch: (container) => (/^h265$/).test(container.toLowerCase()),
  baseMimetypes: {audio: 'video/h265'},
  name: 'h265 (raw h265 video)',
  container: '265'
};
