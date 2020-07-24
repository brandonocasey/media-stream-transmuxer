import Formats from '../formats/index.js';
import getCodecString from './get-codec-string.js';

const mimetypePermutations = function(format) {
  return Formats.reduce(function(acc, _format) {
    const baseType = _format.baseMimetypes;

    if (format.codecs.audio && format.codecs.video && baseType.audio && baseType.video) {
      acc.push({
        type: 'muxed',
        container: _format.container,
        codecs: format.codecs,
        mimetypes: [
          getCodecString(baseType.video, format.codecs)
        ]
      });
      acc.push({
        type: 'split',
        container: _format.container,
        codecs: format.codecs,
        mimetypes: [
          getCodecString(baseType.audio, {audio: format.codecs.audio}),
          getCodecString(baseType.video, {video: format.codecs.video})
        ]
      });
    }

    if (format.codecs.audio && baseType.audio) {
      acc.push({
        type: 'audio',
        container: _format.container,
        codecs: {audio: format.codecs.audio},
        mimetypes: [
          getCodecString(baseType.audio, {audio: format.codecs.audio})
        ]
      });
    }

    if (format.codecs.video && baseType.video) {
      acc.push({
        type: 'video',
        container: _format.container,
        codecs: {video: format.codecs.video},
        mimetypes: [
          getCodecString(baseType.video, {audio: format.codecs.video})
        ]
      });
    }

    return acc;
  }, []);
};

export default mimetypePermutations;
