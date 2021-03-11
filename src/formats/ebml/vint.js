import {
  concatTypedArrays,
  numberToBytes,
  bytesToNumber,
  sliceBytes
} from '@videojs/vhs-utils/cjs/byte-helpers.js';

/**
 * This is a simple table to determine the length
 * of things in ebml. The length is one based (starts at 1,
 * rather than zero) and for every zero bit before a one bit
 * we add one to length. We also need this table because in some
 * case we have to xor all the length bits from another value.
 */
export const LENGTH_TABLE = [
  0b10000000,
  0b01000000,
  0b00100000,
  0b00010000,
  0b00001000,
  0b00000100,
  0b00000010,
  0b00000001
];

export const set = function(number) {
  const length = number === 127 ? 2 : Math.ceil(number.toString(2).length / 7);
  let vint = numberToBytes(number);
  const lengthByte = LENGTH_TABLE[length - 1];

  // if we don't have enough space for the full length
  // add length as its own byte
  if (length !== vint.length) {
    vint = concatTypedArrays([lengthByte], vint);
  // otherwise add length to the first byte
  } else {
    vint[0] |= lengthByte;
  }

  return vint;
};

// length in ebml is stored in the first 4 to 8 bits
// of the first byte. 4 for the id length and 8 for the
// data size length. Length is measured by converting the number to binary
// then 1 + the number of zeros before a 1 is encountered starting
// from the left.
export const get = function(bytes, offset, removeLength = true, signed = false) {
  let length = 1;

  for (let i = 0; i < LENGTH_TABLE.length; i++) {
    if (bytes[offset] & LENGTH_TABLE[i]) {
      break;
    }

    length++;
  }
  let valueBytes = bytes.subarray(offset, offset + length);

  // NOTE that we do **not** subarray here because we need to copy these bytes
  // as they will be modified below to remove the dataSizeLen bits and we do not
  // want to modify the original data. normally we could just call slice on
  // uint8array but ie 11 does not support that...
  if (removeLength) {
    valueBytes = sliceBytes(bytes, offset, offset + length);
    valueBytes[0] ^= LENGTH_TABLE[length - 1];
  }

  return {
    length,
    value: bytesToNumber(valueBytes, {signed}),
    bytes: valueBytes
  };
};
