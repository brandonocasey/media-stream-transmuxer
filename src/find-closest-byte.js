const findEarliestByte = (datas) => datas.reduce(function(acc, data) {
  if (!data) {
    return acc;
  }
  const end = data.byteLength + data.byteOffset;

  if (end < acc) {
    acc = end;
  }

  return acc;
}, -1);

export default findEarliestByte;
