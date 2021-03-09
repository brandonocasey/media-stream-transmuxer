const {bytesMatch} = require('@videojs/vhs-utils/cjs/byte-helpers.js');
const SYNC_BYTES = [0xFF, 0xF0];
const SYNC_MASK = [0xFF, 0xF0];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset, mask: SYNC_MASK});
const {getId3Offset} = require('@videojs/vhs-utils/cjs/id3-helpers.js');

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

const parseFrame = function(data) {
  const frame = {
    header: {
      id: (data[1] >> 3) & 0b1,
      layer: (data[1] >> 1) & 0b11,
      crcAbsent: (data[1]) & 0b1,
      profile: (data[2] >> 6) & 0b11,
      samplingFrequencyIndex: (data[2] >> 2) & 0b1111,
      // unused bit: (data[offset + 2] >> 1) & 0b1,
      channelConfig: ((data[2] & 0b1) << 2) | (data[3] >> 6),
      originalCopy: (data[3] >> 5) & 0b1,
      home: (data[3] >> 4) & 0b1,
      copyrightIdBit: (data[3] >> 3) & 0b1,
      copyrightIdStart: (data[3] >> 2) & 0b1,
      frameLength: ((data[3] & 0b11) << 11) | (data[4] << 3) | (data[5] >> 5),
      bufferFullness: ((data[5] & 0b11111) << 6) | (data[6] >> 2),
      // TODO: headerless??
      headerlessFrames: (data[6] & 0b11)
    }
  };

  let headerSize = 7;

  if (!frame.header.crcAbsent) {
    frame.header.crcWord = data[7] << 8 | data[8];
    headerSize += 2;
  }

  frame.sampleRate = samplingFrequencyIndexes[frame.header.samplingFrequencyIndex];

  frame.data = data.subarray(headerSize, frame.header.frameLength);

  // TODO: cache this
  frame.duration = 1024;

  return frame;
};

export const walk = function(data, callback, options = {}) {
  let offset = getId3Offset(data, (typeof options.offset === 'number' ? options.offset : 0));

  while (offset < data.byteLength) {
    // Look for a pair of start and end sync bytes in the data..
    if (!isInSync(data, offset)) {
      offset += 1;
      continue;
    }

    const frame = parseFrame(data.subarray(offset));
    const stop = callback(frame);

    if (stop) {
      break;
    }

    offset = frame.data.byteLength + frame.data.byteOffset;
  }
};

export const parseTracksAndInfo = function(data) {
  const result = {};

  walk(data, function(frame) {
    result.info = {
      timestampScale: frame.sampleRate,
      // TODO: get the real duration.
      duration: 0xffffff
    };

    result.tracks = [{
      number: 0,
      type: 'audio',
      codec: 'aac',
      timescale: frame.sampleRate,
      info: {
        channels: frame.header.channelConfig,
        bitDepth: 16,
        sampleRate: frame.sampleRate
      }
    }];

    return true;
  });

  return result;

};

export const parseFrames = function(data, {tracks}) {
  const track = tracks[0];
  const frames = [];

  walk(data, function(adtsFrame) {
    const prevFrame = frames.length && frames[frames.length - 1];

    frames.push({
      // all audio frames are keyframes
      keyframe: true,
      trackNumber: track.number,
      data: adtsFrame.data,
      timestamp: prevFrame ? (prevFrame.timestamp + prevFrame.duration) : 0,
      duration: adtsFrame.duration
    });
  });

  return frames;
};
