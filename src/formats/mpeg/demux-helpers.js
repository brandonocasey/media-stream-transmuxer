import {bytesMatch} from '@videojs/vhs-utils/cjs/byte-helpers.js';
import {getId3Offset} from '@videojs/vhs-utils/cjs/id3-helpers.js';
const SYNC_BYTES = [0xFF, 0xF0];
const SYNC_MASK = [0xFF, 0xF0];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset, mask: SYNC_MASK});

// by version bits
const SAMPLE_RATES = {
  2.5: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  1: [44100, 48000, 32000]
};

// version value at index 1 is reseved
const VERSIONS = [2.5, 0, 2, 1];
const LAYERS = [0, 3, 2, 1];

// by version -> layer
const BITRATES = {
  1: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  },
  2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  }
};

// v2, layer 2/3 have the same
BITRATES[2][3] = BITRATES[2][2];

// version -> layer
const SAMPLE_COUNT = {
  1: {0: 0, 1: 384, 2: 1152, 3: 1152},
  2: {0: 0, 1: 384, 2: 1152, 3: 576}
};

// Info
const INFO = [0x49, 0x6e, 0x66, 0x6f];
const XING = [0x58, 0x69, 0x6e, 0x67];
const VBRI = [0x56, 0x42, 0x52, 0x49];

const walk = function(data, callback, {offset = 0, lastFrame} = {}) {
  offset = getId3Offset(data, offset);

  const frames = [];

  while (offset < data.byteLength) {
    // Look for a pair of start and end sync bytes in the data..
    if (!isInSync(data, offset)) {
      offset += 1;
      continue;
    }

    if ((offset + 3) > data.byteLength) {
      return;
    }

    const frame = {};
    const header = frame.header = {
      version: VERSIONS[(data[offset + 1] >> 3) & 0b11],
      layer: LAYERS[(data[offset + 1] >> 1) & 0b11],
      crcAbsent: (data[offset + 1]) & 0b1,
      bitrateIndex: (data[offset + 2] >> 4) & 0b1111,
      sampleRateIndex: (data[offset + 2] >> 2) & 0b11,
      padding: (data[offset + 2] >> 1) & 0b1,
      // unused bit: (data[offset + 2]) & 0b1,
      channelConfig: ((data[offset + 3] >> 6) & 0b11),
      modeExtension: ((data[offset + 3] >> 4) & 0b11),
      copyright: (data[offset + 3] >> 2) & 0b1,
      original: (data[offset + 3] >> 1) & 0b1
    };

    let headerSize = 3;

    if (!header.crcAbsent) {
      if ((offset + 5) > data.byteLength) {
        return;
      }
      header.crcWord = data[offset + 4] << 8 | data[offset + 5];
      headerSize += 2;
    }

    const sampleCount = SAMPLE_COUNT[header.version][header.layer];
    const bitrate = BITRATES[header.version][header.layer][header.bitrateIndex] * 1000;

    frame.sampleRate = SAMPLE_RATES[header.version][header.sampleRateIndex];
    frame.duration = (sampleCount / frame.sampleRate) * 1000;

    const frameLength = header.layer === 1 ?
      Math.floor(12 * bitrate / frame.sampleRate + header.padding) * 4 :
      Math.floor(sampleCount * (bitrate / 8) / frame.sampleRate) + header.padding;

    frame.data = data.subarray(offset + headerSize, offset + frameLength);

    lastFrame = frames.length && frames[frames.length - 1] || lastFrame;

    frame.timestamp = lastFrame ? (lastFrame.timestamp + lastFrame.duration) : 0;

    if ((offset + headerSize + frameLength) > data.byteLength) {
      return;
    }

    offset += frame.data.byteLength + headerSize;

    // not a real first frame, do not add to frames list
    // https://www.codeproject.com/articles/8295/mpeg-audio-frame-header
    if (!frames.length) {
      let i = 0;

      // find the first non-null data
      while (i < frame.data.length) {
        if (frame.data[i] !== 0x00) {
          break;
        }
        i++;
      }
      if (bytesMatch(frame.data, INFO) || bytesMatch(frame.data, INFO, {offset: i})) {
        continue;
      } else if (bytesMatch(frame.data, XING) || bytesMatch(frame.data, XING, {offset: i})) {
        continue;
      } else if (bytesMatch(frame.data, VBRI) || bytesMatch(frame.data, VBRI, {offset: i})) {
        continue;
      }
    }

    const stop = callback(frame);

    if (stop) {
      return;
    }
  }
};

const mp3FrameToFrame = function(mp3Frame, trackNumber) {
  return {
    // all audio frames are keyframes
    keyframe: true,
    trackNumber,
    data: mp3Frame.data,
    timestamp: mp3Frame.timestamp,
    duration: mp3Frame.duration
  };
};

export const parseTracksAndInfo = function(bytes) {
  const result = {};

  walk(bytes, function(frame) {
    result.info = {
      timestampScale: frame.sampleRate,
      // TODO: get the real duration. default duration??
      duration: 0
    };

    result.tracks = [{
      number: 0,
      type: 'audio',
      codec: 'mp3',
      timescale: frame.sampleRate,
      info: {
        channels: frame.header.channelConfig,
        bitDepth: 16,
        sampleRate: frame.sampleRate
      }
    }];

    result.lastFrame = mp3FrameToFrame(frame, 0);

    return true;
  });

  return result;
};

export const parseFrames = function(bytes, {tracks, lastFrame}) {
  const frames = [];

  walk(bytes, function(frame) {
    frames.push(mp3FrameToFrame(frame, tracks[0].number));
  });

  return frames;
};
