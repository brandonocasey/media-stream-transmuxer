/* eslint-disable no-console */
import {concatTypedArrays, toHexString} from '@videojs/vhs-utils/cjs/byte-helpers';
import ExpGolomb from '../../h26-helpers/exp-golomb.js';
import {
  getSarRatio,
  prependNalSize,
  walkAnnexB,
  discardEmulationPreventionBytes
} from '../../h26-helpers/index.js';

// TODO: parse this
const avcC = new Uint8Array([1, 100, 0, 13, 255, 225, 0, 29, 103, 100, 0, 13, 172, 217, 65, 161, 251, 255, 0, 213, 0, 208, 16, 0, 0, 3, 0, 16, 0, 0, 3, 3, 0, 241, 66, 153, 96, 1, 0, 6, 104, 235, 224, 101, 44, 139, 253, 248, 248, 0, 0, 0, 0, 16]);

// values of profile_idc that indicate additional fields are included in the SPS
// see Recommendation ITU-T H.264 (4/2013),
// 7.3.2.1.1 Sequence parameter set data syntax
const PROFILES_WITH_OPTIONAL_SPS_DATA = [
  100, 110, 122, 244, 44, 83,
  86, 118, 128
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

// data is nal minus the nal header.
const readSPS = function(nal) {
  const data = discardEmulationPreventionBytes(nal.subarray(1));
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
    sps.sarRatio = getSarRatio(reader);

    sps.width = (((picWidthInMbsMinus1 + 1) * 16) - frameCropLeftOffset * 2 - frameCropRightOffset * 2);
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

    // TODO: warn on non-fixed framerate.
    sps.fixedFramerate = reader.readBoolean();
  }

  return sps;
};

const parseNalHeader = function(bytes) {
  return {
    refIdc: (bytes[0] & 0b01100000) >> 5,
    type: bytes[0] & 0b00011111,
    length: 1
  };
};

const walkH264Frames = function(bytes, callback, cache = {}, options = {}) {
  cache.sps = cache.sps || {};
  cache.currentFrame = cache.currentFrame || {trackNumber: 0};
  cache.lastFrame = cache.lastFrame || {duration: 0, timestamp: 0};

  walkAnnexB(bytes, function(data) {
    const nal = {
      header: parseNalHeader(data),
      data: prependNalSize(data)
    };
    let stop = false;

    if (nal.header.type === 0x07) {
      cache.sps = readSPS(data);
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
  }, {offset: options.offset});
};

export const parseTracksAndInfo = function(bytes) {
  let sps;

  walkAnnexB(bytes, function(data) {
    const header = parseNalHeader(data);

    if (header.type === 0x07) {
      sps = readSPS(data);
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
      timescale: sps.timescale * sps.framerate,
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

export const parseFrames = function(bytes, cache, options) {
  const frames = [];

  walkH264Frames(bytes, (frame) => {
    frames.push(frame);
  }, cache, options);

  return {frames, cache};
};
