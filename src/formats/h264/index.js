// import Mp4Muxer from './muxer';
import H264Demuxer from './demuxer';

export default {
  // Muxer: M2tsMuxer,
  Demuxer: H264Demuxer,
  containerMatch: (container) => (/^h264$/).test(container.toLowerCase()),
  baseMimetypes: {audio: 'video/h264'},
  name: 'h264 (raw h264 video)',
  container: '264'
};
