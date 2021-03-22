/* eslint-disable no-console */
import {bytesMatch, toUint8, concatTypedArrays, toHexString} from '@videojs/vhs-utils/cjs/byte-helpers';
import ExpGolomb from './exp-golomb.js';

// TODO: parse this
const avcC = new Uint8Array([1, 100, 0, 13, 255, 225, 0, 29, 103, 100, 0, 13, 172, 217, 65, 161, 251, 255, 0, 213, 0, 208, 16, 0, 0, 3, 0, 16, 0, 0, 3, 3, 0, 241, 66, 153, 96, 1, 0, 6, 104, 235, 224, 101, 44, 139, 253, 248, 248, 0, 0, 0, 0, 16]);

// values of profile_idc that indicate additional fields are included in the SPS
// see Recommendation ITU-T H.264 (4/2013),
// 7.3.2.1.1 Sequence parameter set data syntax
const PROFILES_WITH_OPTIONAL_SPS_DATA = [
  100, 110, 122, 244, 44, 83,
  86, 118, 128, 138, 139, 134
];

/**
 * Advance the ExpGolomb decoder past a scaling list. The scaling
 * list is optionally transmitted as part of a sequence parameter
 * set and is not relevant to transmuxing.
 *
 * @param count {number} the number of entries in this scaling list
 * @param expGolombDecoder {object} an ExpGolomb pointed to the
 * start of a scaling list
 * @see Recommendation ITU-T H.264, Section 7.3.2.1.1.1
 */
const skipScalingList = function(count, reader) {
  let lastScale = 8;
  let nextScale = 8;
  let deltaScale;

  for (let j = 0; j < count; j++) {
    if (nextScale !== 0) {
      deltaScale = reader.readExpGolomb();
      nextScale = (lastScale + deltaScale + 256) % 256;
    }

    lastScale = (nextScale === 0) ? lastScale : nextScale;
  }
};

const NAL_TYPE_ONE = toUint8([0x00, 0x00, 0x00, 0x01]);
const NAL_TYPE_TWO = toUint8([0x00, 0x00, 0x01]);
const EMULATION_PREVENTION = toUint8([0x00, 0x00, 0x03]);

/**
 * Expunge any "Emulation Prevention" bytes from a "Raw Byte
 * Sequence Payload"
 *
 * @param data {Uint8Array} the bytes of a RBSP from a NAL
 * unit
 * @return {Uint8Array} the RBSP without any Emulation
 * Prevention Bytes
 */
const discardEmulationPreventionBytes = function(bytes) {
  const positions = [];

  let i = 0;

  // Find all `Emulation Prevention Bytes`
  while (i < bytes.length - 2) {
    if (bytesMatch(bytes.subarray(i, i + 3), EMULATION_PREVENTION)) {
      positions.push(i + 2);
      i++;
    }

    i++;
  }

  // If no Emulation Prevention Bytes were found just return the original
  // array
  if (positions.length === 0) {
    return bytes;
  }

  // Create a new array to hold the NAL unit data
  const newLength = bytes.length - positions.length;
  const newData = new Uint8Array(newLength);
  let sourceIndex = 0;

  for (i = 0; i < newLength; sourceIndex++, i++) {
    if (sourceIndex === positions[0]) {
      // Skip this byte
      sourceIndex++;
      // Remove this position index
      positions.shift();
    }
    newData[i] = bytes[sourceIndex];
  }

  return newData;
};

// data is nal minus the nal header.
const readSPS = function(nal) {
  const data = discardEmulationPreventionBytes(nal.data.subarray(5));
  const reader = new ExpGolomb(data);

  const sps = {
    profile: reader.readUnsignedByte(),
    constraint: reader.readUnsignedByte() & 0xFC,
    level: reader.readUnsignedByte()
  };

  // seq_parameter_set_id
  reader.skipUnsignedExpGolomb();

  if (PROFILES_WITH_OPTIONAL_SPS_DATA.indexOf(sps.profile) !== -1) {
    sps.chromaFormat = reader.readUnsignedExpGolomb();

    if (sps.chromaFormat === 3) {
      // separate_colour_plane_flag
    }

    // bit_depth_luma_minus8
    reader.skipUnsignedExpGolomb();
    // bit_depth_chroma_minus8
    reader.skipUnsignedExpGolomb();
    // qpprime_y_zero_transform_bypass_flag
    reader.skipBits(1);

    // seq_scaling_matrix_present_flag
    if (reader.readBoolean()) {
      const scalingListCount = (sps.chromaFormat !== 3) ? 8 : 12;

      for (let i = 0; i < scalingListCount; i++) {
        // seq_scaling_list_present_flag[ i ]
        if (reader.readBoolean()) {
          if (i < 6) {
            skipScalingList(16, reader);
          } else {
            skipScalingList(64, reader);
          }
        }
      }
    }
  }

  // log2_max_frame_num_minus4
  reader.skipUnsignedExpGolomb();
  const picOrderCntType = reader.readUnsignedExpGolomb();

  if (picOrderCntType === 0) {
    // log2_max_pic_order_cnt_lsb_minus4
    reader.skipUnsignedExpGolomb();
  } else if (picOrderCntType === 1) {
    // delta_pic_order_always_zero_flag
    reader.skipBits(1);
    // offset_for_non_ref_pic
    reader.skipExpGolomb();
    // offset_for_top_to_bottom_field
    reader.skipExpGolomb();
    const numRefFramesInPicOrderCntCycle = reader.readUnsignedExpGolomb();

    for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
      // offset_for_ref_frame[ i ]
      reader.skipExpGolomb();
    }
  }

  // max_num_ref_frames
  reader.skipUnsignedExpGolomb();
  // gaps_in_frame_num_value_allowed_flag
  reader.skipBits(1);

  const picWidthInMbsMinus1 = reader.readUnsignedExpGolomb();
  const picHeightInMapUnitsMinus1 = reader.readUnsignedExpGolomb();
  const frameMbsOnlyFlag = reader.readBits(1);

  // frame_mbs_only
  if (frameMbsOnlyFlag === 0) {
    // mb_adaptive_frame_field_flag
    reader.skipBits(1);
  }

  // direct_8x8_inference_flag
  reader.skipBits(1);

  let frameCropLeftOffset = 0;
  let frameCropRightOffset = 0;
  let frameCropTopOffset = 0;
  let frameCropBottomOffset = 0;

  // frame_cropping_flag
  if (reader.readBoolean()) {
    frameCropLeftOffset = reader.readUnsignedExpGolomb();
    frameCropRightOffset = reader.readUnsignedExpGolomb();
    frameCropTopOffset = reader.readUnsignedExpGolomb();
    frameCropBottomOffset = reader.readUnsignedExpGolomb();
  }

  // vui_parameters_present_flag
  if (!reader.readBoolean()) {
    return sps;
  }

  if (reader.readBoolean()) {
    // aspect_ratio_info_present_flag
    const aspectRatioIdc = reader.readUnsignedByte();
    let sarRatio;

    switch (aspectRatioIdc) {
    case 1: sarRatio = [1, 1]; break;
    case 2: sarRatio = [12, 11]; break;
    case 3: sarRatio = [10, 11]; break;
    case 4: sarRatio = [16, 11]; break;
    case 5: sarRatio = [40, 33]; break;
    case 6: sarRatio = [24, 11]; break;
    case 7: sarRatio = [20, 11]; break;
    case 8: sarRatio = [32, 11]; break;
    case 9: sarRatio = [80, 33]; break;
    case 10: sarRatio = [18, 11]; break;
    case 11: sarRatio = [15, 11]; break;
    case 12: sarRatio = [64, 33]; break;
    case 13: sarRatio = [160, 99]; break;
    case 14: sarRatio = [4, 3]; break;
    case 15: sarRatio = [3, 2]; break;
    case 16: sarRatio = [2, 1]; break;
    case 255: {
      sarRatio = [
        reader.readUnsignedByte() << 8 | reader.readUnsignedByte(),
        reader.readUnsignedByte() << 8 | reader.readUnsignedByte()
      ];
      break;
    }
    }

    const sarScale = sarRatio ? sarRatio[0] / sarRatio[1] : 1;

    sps.width = Math.ceil((((picWidthInMbsMinus1 + 1) * 16) - frameCropLeftOffset * 2 - frameCropRightOffset * 2) * sarScale);
    sps.height = ((2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16) - (frameCropTopOffset * 2) - (frameCropBottomOffset * 2);

  }

  // overscan
  if (reader.readBoolean()) {
    // overscan appropriate flag
    reader.skipBits(1);
  }
  // video signal type
  if (reader.readBoolean()) {
    // video format
    reader.skipBits(3);
    // video full range flag
    reader.skipBits(1);
    // colour description present
    if (reader.readBoolean()) {
      // colour primaries
      reader.skipUnsignedByte();
      // transfer characteristics
      reader.skipUnsignedByte();
      // matrix coefficients
      reader.skipUnsignedByte();
    }

  }
  // chroma loc
  if (reader.readBoolean()) {
    // chroma sample loc type top
    reader.skipUnsignedExpGolomb();
    // chroma sample loc type bottom
    reader.skipUnsignedExpGolomb();
  }

  // timing info
  if (reader.readBoolean()) {
    sps.numUnitsInTick =
      reader.readUnsignedByte() << 24 |
      reader.readUnsignedByte() << 16 |
      reader.readUnsignedByte() << 8 |
      reader.readUnsignedByte();

    sps.timescale =
      reader.readUnsignedByte() << 24 |
      reader.readUnsignedByte() << 16 |
      reader.readUnsignedByte() << 8 |
      reader.readUnsignedByte();

    sps.framerate = sps.timescale / (sps.numUnitsInTick * 2);

    // timescale is in kilohertz convert to hertz
    sps.timescale *= sps.framerate * 1000;

    sps.fixedFramerate = reader.readBoolean();
  }

  return sps;
};

const getNalOffset = function(bytes) {
  if (bytesMatch(bytes, NAL_TYPE_ONE)) {
    return 4;
  } else if (bytesMatch(bytes, NAL_TYPE_TWO)) {
    return 3;
  }
};

const parseNalHeader = function(bytes, dataType) {
  if (dataType === 'h264') {
    return {
      refIdc: (bytes[0] & 0b01100000) >> 5,
      type: bytes[0] & 0b00011111,
      length: 1
    };
  } else if (dataType === 'h265') {
    // TODO: parse this correctly
    return {
      type: (bytes[0] >> 1) & 0b00111111,
      length: 2
    };
  }
};

const walkNal = function(bytes, callback, {dataType = 'h264', offset = 0} = {}) {
  bytes = toUint8(bytes);

  let i = offset;
  let currentNal = {};

  while (i < bytes.length) {
    const nalOffset = getNalOffset(bytes.subarray(i));

    // TODO: only do i+1 < bytes.length on flush
    if (!nalOffset && (i + 1) < bytes.length) {
      i++;
      continue;
    }

    // if we have a "current" nal, then the nal
    // that we just found is the end of that one
    if (typeof currentNal.start === 'number') {
      currentNal.data = bytes.slice(currentNal.start, i);
      const nalLen = new DataView(new ArrayBuffer(4));

      nalLen.setUint32(0, currentNal.data.length);

      currentNal.data = concatTypedArrays(nalLen.buffer, currentNal.data);
      delete currentNal.start;

      const stop = callback(currentNal);

      // reset current nal
      currentNal = {};

      if (stop) {
        return;
      }
    }

    if (!nalOffset) {
      break;
    }

    currentNal.header = parseNalHeader(bytes.subarray(i + nalOffset), dataType);
    currentNal.start = i + nalOffset;

    // nal header is 1 length for h264, and 2 for h265
    i += nalOffset + currentNal.header.length;
  }
};

const walkH264Frames = function(bytes, callback, cache = {}, options = {}) {
  cache.sps = cache.sps || {};
  cache.currentFrame = cache.currentFrame || {trackNumber: 0};
  cache.lastFrame = cache.lastFrame || {duration: 0, timestamp: 0};

  walkNal(bytes, function(nal) {
    let stop = false;

    if (nal.header.type === 0x07) {
      cache.sps = readSPS(nal);
    }
    // Split on:
    // TODO:
    // https://stackoverflow.com/a/19939107/4194254
    // 0x09 - access unit delimiter if we see 0x09, we split on that **only**
    // 0x01 - slice of non-idr
    // TODO: grab parseSei from m2ts/caption-stream in mux.js to parse 0x06 sei
    if (nal.header.type === 0x09 || nal.header.type === 0x01 || nal.header.type === 0x05) {
      if (cache.currentFrame.data) {
        if (cache.currentFrame.sps.numUnitsInTick && cache.currentFrame.sps.timescale) {
          cache.currentFrame.duration = cache.sps.timescale;
          cache.currentFrame.timestamp = cache.lastFrame.timestamp + cache.lastFrame.duration;
        }

        cache.lastFrame = cache.currentFrame;
        cache.currentFrame = {trackNumber: 0};

        stop = callback(cache.lastFrame);
      }
      cache.currentFrame.data = nal.data;
      cache.currentFrame.sps = cache.sps;

      if (nal.header.type === 0x05) {
        cache.currentFrame.keyframe = true;
      }

    } else if (cache.currentFrame.data) {
      cache.currentFrame.data = concatTypedArrays(cache.currentFrame.data, nal.data);
    }

    return stop;
  }, {offset: options.offset, dataType: 'h264'});
};

export const parseH264TracksAndInfo = function(bytes) {
  let sps;

  walkNal(bytes, function(nal) {
    if (nal.header.type === 0x07) {
      sps = readSPS(nal);
      return true;
    }
  });

  if (!sps) {
    return;
  }

  const codec =
    `avc1.${toHexString(sps.profile)}` +
    `${toHexString(sps.constraint & 0xFC)}` +
    `${toHexString(sps.level)}`;

  return {
    info: {
      timestampScale: 1000,
      // TODO: get a real duration
      duration: 0
    },
    tracks: [{
      number: 0,
      // TODO: times fps
      timescale: sps.timescale * 25,
      type: 'video',
      codec,
      info: {
        width: sps.width,
        height: sps.height,
        avcC
      }
    }]
  };
};

export const parseH264Frames = function(bytes, cache, options) {
  const frames = [];

  walkH264Frames(bytes, (frame) => {
    frames.push(frame);
  }, cache, options);

  return {frames, cache};
};
