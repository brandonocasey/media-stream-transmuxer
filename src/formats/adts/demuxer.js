const {bytesMatch} = require('@videojs/vhs-utils/es/byte-helpers.js');
const SYNC_BYTES = [0xFF, 0xF0];
const SYNC_MASK = [0xFF, 0xF0];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset, mask: SYNC_MASK});
const {getId3Offset} = require('@videojs/vhs-utils/es/id3-helpers.js');
const fs = require('fs');
const path = require('path');

const data = fs.readFileSync(path.resolve(__dirname, '../../../test.aac'));
// TODO: mp4 has this also, grab it from there.
const samplingFrequencyIndexes = [
  96000,
  88200,
  64000,
  48000,
  44100,
  32000,
  24000,
  22050,
  16000,
  12000,
  11025,
  8000,
  7350
];

let offset = getId3Offset(data);

const frames = [];

while (offset < data.byteLength) {
  // Look for a pair of start and end sync bytes in the data..
  if (!isInSync(data, offset)) {
    offset += 1;
    continue;
  }

  // skip first sync byte

  const frame = {};
  const header = {
    id: (data[offset + 1] >> 3) & 0b1,
    layer: (data[offset + 1] >> 1) & 0b11,
    crcAbsent: (data[offset + 1]) & 0b1,
    profile: (data[offset + 2] >> 6) & 0b11,
    samplingFrequencyIndex: (data[offset + 2] >> 2) & 0b1111,
    // unused bit: (data[offset + 2] >> 1) & 0b1,
    channelConfig: ((data[offset + 2] & 0b1) << 2) | (data[offset + 3] >> 6),
    originalCopy: (data[offset + 3] >> 5) & 0b1,
    home: (data[offset + 3] >> 4) & 0b1,
    copyrightIdBit: (data[offset + 3] >> 3) & 0b1,
    copyrightIdStart: (data[offset + 3] >> 2) & 0b1,
    frameLength: ((data[offset + 3] & 0b11) << 11) | (data[offset + 4] << 3) | (data[offset + 5] >> 5),
    bufferFullness: ((data[offset + 5] & 0b11111) << 6) | (data[offset + 6] >> 2),
    headerlessFrames: (data[offset + 6] & 0b11)
  };
  let headerSize = 7;

  if (!header.crcAbsent) {
    header.crcWord = data[offset + 7] << 8 | data[offset + 8];
    headerSize += 2;
  }

  frame.sampleRate = samplingFrequencyIndexes[header.samplingFrequencyIndex];

  frame.data = data.subarray(offset + headerSize, offset + header.frameLength);

  // TODO: cache this
  frame.duration = (1024 / frame.sampleRate) * 1000;

  const lastFrame = frames.length && frames[frames.length - 1];

  frame.timestamp = lastFrame ? (lastFrame.timestamp + lastFrame.duration) : 0;

  frames.push(frame);
  offset += frame.data.byteLength + headerSize;
}
