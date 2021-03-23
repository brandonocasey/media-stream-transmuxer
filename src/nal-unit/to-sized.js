const toSizedNal = function(data) {
  const sizedData = new Uint8Array(data.length + 4);
  const dv = new DataView(sizedData.buffer);

  dv.setUint32(0, data.length);
  sizedData.set(data, 4);

  return sizedData;
};

export default toSizedNal;
