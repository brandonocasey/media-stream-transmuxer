const toAnnexB = function(data) {
  const newData = new Uint8Array(data.length + 4);

  // add annex b prefix
  newData[0] = 0x00;
  newData[1] = 0x00;
  newData[1] = 0x00;
  newData[1] = 0x01;

  newData.set(data, 4);

  return newData;
};

export default toAnnexB;
