import EbmlMuxer from './muxer';
import EbmlDemuxer from './demuxer';

export default {
  Muxer: EbmlMuxer,
  Demuxer: EbmlDemuxer,
  probe: EbmlDemuxer.probe,
  containerMatch: (container) => (/^webm|mkv$/).test(container.toLowerCase()),
  baseMimetypes: {video: 'video/webm', audio: 'audio/webm'},
  name: 'ebml (webm/mkv)',
  container: 'webm'
};
