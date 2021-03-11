const getCodecString = function(basemime, codecs) {
  const codeclist = [];

  ['video', 'audio'].forEach(function(type) {
    if (codecs[type]) {
      if (codecs[type] === 'aac') {
        codecs[type] = 'mp4a.40.2';
      }
      codeclist.push(codecs[type]);
    }
  });

  return basemime + `;codecs="${codeclist.join(',')}"`;
};

export default getCodecString;
