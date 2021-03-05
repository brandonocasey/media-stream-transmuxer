/* eslint-disable no-console */
const {bytesMatch, toUint8, concatTypedArrays} = require('@videojs/vhs-utils/cjs/byte-helpers');
const fs = require('fs');
const ExpGolomb = require('./exp-golomb.js');

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

const readSPS = function(data) {
  const reader = new ExpGolomb(data.subarray(1));

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

    sps.fixedFramerate = reader.readBoolean();
  }

  return sps;
};

const groupNalsIntoFrames = function(nalUnits) {
  const frames = [];
  let currentFrame = {};
  let sps;

  for (let i = 0; i < nalUnits.length; i++) {
    const {type, data} = nalUnits[i];

    if (type === 0x07) {
      sps = readSPS(data);
    }

    // Split on:
    // 0x09 - access unit delimiter
    // 0x01 - slice of non-idr
    // 0x05 - slice of idr
    // TODO: i think if we see 0x09 we **only** split on that one

    if (type === 0x09 || type === 0x01 || type === 0x05) {
      // Since the very first nal unit is expected to be an AUD
      // only push to the frames array when currentFrame is not empty
      currentFrame.data = data;
      currentFrame.sps = sps;

      // Specifically flag key frames for ease of use later
      if (type === 0x05) {
        currentFrame.keyFrame = true;
      }

      // TODO: handle sei pic_timing nuit_field_based_flag
      if (sps.numUnitsInTick && sps.timescale) {
        currentFrame.duration = (sps.numUnitsInTick / sps.timescale) * 2;
        const lastFrame = frames.length ? frames[frames.length - 1] : {duration: 0, timestamp: 0};

        currentFrame.timestamp = lastFrame.timestamp + lastFrame.duration;
      }
      frames.push(currentFrame);
      currentFrame = {};
    } else if (currentFrame.data && currentFrame.data.length) {
      currentFrame.data = concatTypedArrays(currentFrame.data, data);
    }
  }
  // TODO: this code stinks, what the f is wrong

  return frames;
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

  let i = 1;

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

const walkNals = function(bytes, dataType = 'h264') {
  bytes = toUint8(bytes);

  const nals = [];
  let i = 0;
  let nalStart;
  let nalType;

  // keep searching until:
  // we reach the end of bytes
  // we reach the maximum number of nals they want to seach
  // NOTE: that we disregard nalLimit when we have found the start
  // of the nal we want so that we can find the end of the nal we want.
  while (i < bytes.length) {
    let nalOffset;

    if (bytesMatch(bytes.subarray(i), NAL_TYPE_ONE)) {
      nalOffset = 4;
    } else if (bytesMatch(bytes.subarray(i), NAL_TYPE_TWO)) {
      nalOffset = 3;
    }

    // we are unsynced,
    // find the next nal unit
    if (!nalOffset) {
      i++;
      continue;
    }

    if (nalStart) {
      nals.push({type: nalType, data: discardEmulationPreventionBytes(bytes.subarray(nalStart, i))});
    }

    if (dataType === 'h264') {
      nalType = (bytes[i + nalOffset] & 0x1f);
    } else if (dataType === 'h265') {
      nalType = (bytes[i + nalOffset] >> 1) & 0x3f;
    }

    nalStart = i + nalOffset;

    // nal header is 1 length for h264, and 2 for h265
    i += nalOffset + (dataType === 'h264' ? 1 : 2);
  }

  if (nals.length && nals[nals.length - 1].data.byteOffset !== nalStart) {
    nals.push({type: nalType, data: discardEmulationPreventionBytes(bytes.subarray(nalStart))});
  }

  return nals;
};

const nals = walkNals(fs.readFileSync('./test.264'));
const frames = groupNalsIntoFrames(nals);

const log = JSON.stringify(frames.map((f) => {
  f.data = {size: f.data.length};
  return f;
}), null, 2);

console.log(log);
