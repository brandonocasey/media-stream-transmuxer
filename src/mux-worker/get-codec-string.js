const getCodecString = function(basemime, codecs) {
  const codeclist = [];

  ['video', 'audio'].forEach(function(type) {
    if (codecs[type]) {
      codeclist.push(codecs[type]);
    }
  });

  return basemime + `;codecs="${codeclist.join(',')}"`;
};

export default getCodecString;
