import EbmlMuxer from './muxer';
import EbmlDemuxer from './demuxer';
import EbmlProbe from './probe';

export default {
  Muxer: EbmlMuxer,
  Demuxer: EbmlDemuxer,
  probe: EbmlProbe,
  containerMatch: (container) => (/^webm|mkv$/).test(container.toLowerCase()),
  baseMimetypes: {video: 'video/webm', audio: 'audio/webm'},
  name: 'ebml (webm/mkv)',
  container: 'webm'
};
