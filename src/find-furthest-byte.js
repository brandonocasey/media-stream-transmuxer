const findFurthestByte = (datas) => datas.reduce(function(acc, d) {
  if (!d) {
    return acc;
  }
  const end = d.byteLength + d.byteOffset;

  if (end > acc) {
    acc = end;
  }

  return acc;
}, -1);

export default findFurthestByte;
