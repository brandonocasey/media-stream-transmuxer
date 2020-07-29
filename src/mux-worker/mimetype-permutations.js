import Formats from '../formats/index.js';
import getCodecString from './get-codec-string.js';

const mimetypePermutations = function(codecs) {
  return Formats.reduce(function(acc, format) {
    const baseType = format.baseMimetypes;
    const container = format.container;

    if (codecs.audio && codecs.video && baseType.audio && baseType.video) {
      acc.push({
        type: 'muxed',
        codecs,
        container,
        mimetypes: {
          video: getCodecString(baseType.video, codecs)
        }
      });
      acc.push({
        type: 'split',
        codecs,
        container,
        mimetypes: {
          audio: getCodecString(baseType.audio, {audio: codecs.audio}),
          video: getCodecString(baseType.video, {video: codecs.video})
        }
      });
    }

    if (codecs.audio && baseType.audio) {
      acc.push({
        type: 'audio',
        codecs: {audio: codecs.audio},
        container,
        mimetypes: {
          audio: getCodecString(baseType.audio, {audio: codecs.audio})
        }
      });
    }

    if (codecs.video && baseType.video) {
      acc.push({
        type: 'video',
        codecs: {video: codecs.video},
        container,
        mimetypes: {
          video: getCodecString(baseType.video, {audio: codecs.video})
        }
      });
    }

    return acc;
  }, []);
};

export default mimetypePermutations;
