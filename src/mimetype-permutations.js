import Formats from './formats/index.js';

const getCodecString = function(basemime, codecs) {
  const codeclist = [];

  ['video', 'audio'].forEach(function(type) {
    if (codecs[type]) {
      codeclist.push(codecs[type]);
    }
  });

  return basemime + `;codecs="${codeclist.join(',')}"`;
};

const mimetypePermutations = function(format) {
  // TODO: pass in tracks instead??
  return Formats.reduce(function(acc, _format) {
    const baseType = _format.baseMimetypes;

    if (format.codecs.audio && format.codecs.video && baseType.audio && baseType.video) {
      acc.push({type: 'video', mimetype: getCodecString(baseType.video, format.codecs)});
    }

    if (format.codecs.audio && baseType.audio) {
      acc.push({type: 'audio', mimetype: getCodecString(baseType.audio, {audio: format.codecs.audio})});
    }

    if (format.codecs.video && baseType.video) {
      acc.push({type: 'video', mimetype: getCodecString(baseType.video, {video: format.codecs.video})});
    }

    return acc;
  }, []);
};

export default mimetypePermutations;
