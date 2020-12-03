const v = new Uint8Array([
  0b11111111,
  0b00001111,
  0b11110000,
  0b10101010,
  0b01010101,
  0b00110011,
  0b11001100
]);

let bytePos = 0;
let bitPos = 0;

// TODO: littleEndian, signed, floating point
const readBits = (n) => {
  let cast = Number;

  if (n >= 53) {
    cast = BigInt;
  }
  const rightBits = cast(8 - (bitPos + n));
  const scale = cast(2) ** cast(rightBits);
  const mask = ((cast(2) ** cast(n)) - cast(1)) * scale;

  // TODO: multiple bytes
  const result = (v[bytePos] & mask) / scale;

  bitPos += n;
  bytePos += Math.floor(bitPos / 8);
  bitPos = bitPos % 8;

  return result;
};

console.log(readBits(1));
console.log(readBits(1));
console.log(readBits(2));
console.log(readBits(4));
console.log(readBits(8));
console.log(readBits(8));
