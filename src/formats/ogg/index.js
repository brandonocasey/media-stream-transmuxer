import OggDemuxer from './demuxer';

export default {
  // Muxer: OggMuxer,
  Demuxer: OggDemuxer,
  containerMatch: (container) => (/^ogg|opus|spx|oga|ogx|ogm$/).test(container.toLowerCase()),
  baseMimetypes: {video: 'video/ogg', audio: 'audio/ogg'},
  name: 'ogg',
  container: 'ogg'
};
