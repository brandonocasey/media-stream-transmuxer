const {bytesMatch, bytesToNumber} = require('@videojs/vhs-utils/dist/byte-helpers.js');
const SYNC_BYTES = [0x4F, 0x67, 0x67, 0x53];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset});
const {getId3Offset} = require('@videojs/vhs-utils/dist/id3-helpers.js');
const fs = require('fs');
const path = require('path');

const data = fs.readFileSync(path.resolve(__dirname, 'test.ogg'));
let offset = getId3Offset(data);

const frames = [];

// https://tools.ietf.org/html/rfc6716#section-3.1 page 14
// in ms
const opusFrameSizes = [
  // SILK-only NB
  10, 20, 40, 60,
  // SILK-only MB
  10, 20, 40, 60,
  // SILK-only WB
  10, 20, 40, 60,
  // Hybrid SWB
  10, 20,
  // Hybrid FB
  10, 20,
  // CELT-only NB
  2.5, 5, 10, 20,
  // CELT-only WB
  2.5, 5, 10, 20,
  // CELT-only SWB
  2.5, 5, 10, 20,
  // CELT-only FB
  2.5, 5, 10, 20
];

const OpusHead = new Uint8Array([
  // O, p, u, s
  0x4f, 0x70, 0x75, 0x73,
  // H, e, a, d
  0x48, 0x65, 0x61, 0x64
]);

const OpusTags = new Uint8Array([
  // O, p, u, s
  0x4f, 0x70, 0x75, 0x73,
  // T, a, g, s
  0x54, 0x61, 0x67, 0x73
]);

const parseOpusHead = function(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  // version 0, from mp4, does not use littleEndian.
  const littleEndian = version !== 0;

  const config = {
    version,
    channels: view.getUint8(1),
    preSkip: view.getUint16(2, littleEndian),
    sampleRate: view.getUint32(4, littleEndian),
    outputGain: view.getUint16(8, littleEndian),
    channelMappingFamily: view.getUint8(10)
  };

  if (config.channelMappingFamily > 0 && bytes.length > 10) {
    config.streamCount = view.getUint8(11);
    config.twoChannelStreamCount = view.getUint8(12);
    config.channelMapping = [];

    for (let c = 0; c < config.channels; c++) {
      config.channelMapping.push(view.getUint8(13 + c));
    }
  }

  return config;
};

const tracks = [];

while (offset < data.byteLength) {
  // Look for a pair of start and end sync bytes in the data..
  if (!isInSync(data, offset)) {
    offset += 1;
    continue;
  }
  const header = {
    fresh: (data[offset + 5] & 0x01) > 0,
    first: (data[offset + 5] & 0x02) > 0,
    last: (data[offset + 5] & 0x04) > 0,
    granualPosition: bytesToNumber(data.subarray(offset + 6, offset + 13), {signed: true, le: true}),
    serialNumber: bytesToNumber(data.subarray(offset + 14, offset + 17), {le: true}),
    sequenceNumber: bytesToNumber(data.subarray(offset + 18, offset + 21), {le: true}),
    checksum: bytesToNumber(data.subarray(offset + 22, offset + 25), {le: true}),
    segmentSizes: data[offset + 26],
    segments: []
  };

  // header size
  offset += 27;

  const frameSizes = [];
  const segmentTableEnd = offset + header.segmentSizes;

  while (offset < segmentTableEnd) {
    let size = 0;

    do {
      size += data[offset];
      offset++;
    } while (data[offset - 1] === 0xFF);

    frameSizes.push(size);
  }

  // TODO: do this in the loop above
  frameSizes.forEach(function(size) {
    header.segments.push(data.subarray(offset, offset + size));
    offset += size;
  });

  /*
  frame.sampleRate = samplingFrequencyIndexes[header.samplingFrequencyIndex];

  frame.data = data.subarray(offset + headerSize, offset + header.frameLength);

  // TODO: cache this
  frame.duration = (1024 / frame.sampleRate) * 1000;

  const lastFrame = frames.length && frames[frames.length - 1];

  frame.timestamp = lastFrame ? (lastFrame.timestamp + lastFrame.duration) : 0;

  */

  // skip header pages/segments
  if (bytesMatch(header.segments[0], OpusHead)) {
    tracks.push(parseOpusHead(header.segments[0].subarray(8)));
    continue;
  } else if (bytesMatch(header.segments[0], OpusTags)) {
    continue;
  }
  header.segments.forEach(function(segment) {
    const lastFrame = frames.length && frames[frames.length - 1];

    // TODO: we may need to grab more than one frame from a segment
    // for variable length opus
    frames.push({
      // first 5 bits of the segment is the config, which defines the frame size
      duration: opusFrameSizes[segment[0] >> 3],
      timestamp: lastFrame ? (lastFrame.timestamp + lastFrame.duration) : 0,
      sampleRate: tracks[0].sampleRate,
      data: segment
    });
  });
}
