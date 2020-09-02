const {bytesMatch, bytesToNumber} = require('@videojs/vhs-utils/dist/byte-helpers.js');
const SYNC_BYTES = [0xFF, 0xF8];
const SYNC_MASK = [0xFF, 0xF8];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset, mask: SYNC_MASK});
const fs = require('fs');
const path = require('path');

const fLaC = [0x66, 0x4c, 0x61, 0x43];

const getBlockOffset = function(data) {
  if (bytesMatch(data, fLaC)) {
    data = data.subarray(4);
  }

  let type = data[0];
  const len = bytesToNumber(data.subarray(1, 4));
  const last = type > 128;

  type = type % 128;

  if (last) {
    return data.byteOffset + len + 4;
  }

  return getBlockOffset(data.subarray(4 + len));
};

const data = fs.readFileSync(path.resolve(__dirname, 'test.flac'));
let offset = getBlockOffset(data);

const frames = [];
let start;

while (offset < data.byteLength) {
  // Look for a pair of start and end sync bytes in the data..
  if (!isInSync(data, offset)) {
    offset += 1;
    continue;
  }
  if (start) {
    frames.push(data.subarray(start, offset));
  } else {
    start = offset;
  }
  // increment by STREAMINFO min-frame-size
  offset += 4096;
}
frames.push(data.subarray(start, data.byteLength));

console.log(frames.length);
