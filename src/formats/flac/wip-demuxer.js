/* eslint-disable no-console */
const BitReader = require('../../../../bit-array/dist/cjs/bit-reader.js');
const {bytesMatch, bytesToNumber} = require('@videojs/vhs-utils/es/byte-helpers.js');
const SYNC_BYTES = [0xFF, 0xF8];
const SYNC_MASK = [0xFF, 0xF8];
const isInSync = (d, offset) =>
  bytesMatch(d, SYNC_BYTES, {offset, mask: SYNC_MASK});
const fs = require('fs');
const path = require('path');

// https://xiph.org/flac/format.html#frame
const fLaC = [0x66, 0x4c, 0x61, 0x43];

const SAMPLE_RATES = {
  1: 88200,
  2: 176400,
  3: 192000,
  4: 8000,
  5: 16000,
  6: 22050,
  7: 24000,
  8: 32000,
  9: 44100,
  10: 48000,
  11: 96000
};

const SAMPLE_SIZES = {
  1: 8,
  2: 12,
  4: 16,
  5: 20,
  6: 24
};

const data = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'test.flac'));
const reader = new BitReader(data);

const getBlockOffset = function(d) {
  if (reader.bytesMatch(fLaC)) {
    d = data.subarray(4);
  }

  let type = d[0];
  const len = bytesToNumber(d.subarray(1, 4));
  const last = type > 128;

  type = type % 128;

  if (last) {
    return d.byteOffset + len + 4;
  }

  return getBlockOffset(d.subarray(4 + len));
};

let offset = getBlockOffset(reader);
const frames = [];
const notFrames = [];

while (offset < data.byteLength) {
  // Look for a pair of start and end sync bytes in the data..
  if (!isInSync(data, offset)) {
    offset += 1;
    continue;
  }

  const bits = {
    // reserved: (data[offset + 1] & 0b00000010) >> 1,
    blockingStrategyId: data[offset + 1] & 0b00000001,
    blockSizeId: (data[offset + 2] & 0b11110000) >> 4,
    sampleRateId: (data[offset + 2] & 0b00001111),
    channelId: (data[offset + 3] & 0b11110000) >> 4,
    sampleSizeId: (data[offset + 3] & 0b00001110) >> 1
    // reserved: data[offset + 3] & 0b00000001,
  };
  let headerSize = 4;

  const frame = {
    sampleSize: SAMPLE_SIZES[bits.sampleSizeId]
  };

  if (bits.channelId === 8 || bits.channelId === 9 || bits.channelId === 10) {
    frame.channels = 2;
  } else {
    frame.channels = bits.channelId + 1;
  }

  // variable
  if (bits.blockingStrategyId === 1) {
    frame.sampleNumber = data.subarray(offset + headerSize, offset + headerSize + 6);
    headerSize += 6;
  } else {
    frame.frameNumber = data.subarray(offset + headerSize, offset + headerSize + 5);
    headerSize += 5;
  }

  frame.blockingStrategy = bits.blockingStrategyId === 1 ? 'variable' : 'fixed';

  if (bits.blockSizeId === 1) {
    frame.blockSize = 192;
  } else if (bits.blockSizeId <= 5) {
    frame.blockSize = 576 * (1 << (bits.blockSizeId - 2));
  } else if (bits.blockSizeId === 6) {
    // get 8 bit from end of header??;
    frame.blockSize = data[offset + headerSize] << 8;
    headerSize += 1;
  } else if (bits.blockSizeId === 7) {
    frame.blockSize = data[offset + headerSize] << 8 | data[offset + headerSize + 1];
    headerSize += 2;
  } else if (bits.blockSizeId >= 8) {
    frame.blockSize = 256 * (1 << (bits.blockSizeId - 8));
  }

  if (bits.sampleRateId === 0) {
    // TODO: get from streaminfo:
  } else if (bits.sampleRateId === 12) {
    frame.sampleRateId = data[offset + headerSize];
    headerSize += 1;
  } else if (bits.sampleRateId === 13 || bits.sampleRateId === 14) {
    frame.blockSize = data[offset + headerSize] << 8 | data[offset + headerSize + 1];
    // 14 is in 10s of hz, 13 is in hz
    frame.blockSize *= (bits.sampleRateId === 14 ? 10 : 1);
    headerSize += 2;
  } else if (SAMPLE_RATES[bits.sampleRateId]) {
    frame.sampleRate = SAMPLE_RATES[bits.sampleRateId];
  }

  // skip crc
  headerSize += 1;

  // frame header + frame size
  let size = (((frame.sampleSize * frame.blockSize) / 8) + headerSize);

  // subframe headers
  size += frame.channels;

  // frame footer crc
  size += 2;

  frame.offset = offset;
  frame.size = size;

  // TODO:
  // debugger;
  for (let i = 0; i < frame.channels; i++) {
    const subframe = {
      // zeroBit = (data[offset + headerSize + i] & 0b10000000) >> 7,
      type: (data[offset + headerSize + i] & 0b01111110) >> 1,
      wastedBitsFlag: (data[offset + headerSize + i] & 0b00000001)
    };

    if (subframe.type === 0) {
      // constant
    } else if (subframe.type === 1) {
      // verbatim
    } else if (subframe.type <= 15) {
      // FIXED
      subframe.order = subframe.type & 0x07;
    } else if (subframe.type <= 63) {
      // LPC
      subframe.order = (subframe.type & 0x1F) + 1;
    }

    if (subframe.wastedBitsFlag) {
      // TODO
      // const k = data[offset + headerSize + i + 1].toString(2);
    }
  }

  if (frame.channels === 2) {
    frames.push(frame);
  } else {
    notFrames.push(frame);
  }
  offset += 1208;
}

// frames = notFrames;
// console.log(frames.length);

console.log(JSON.stringify(frames, null, 2));
