/* eslint-disable no-console */
import {concatTypedArrays} from '@videojs/vhs-utils/cjs/byte-helpers';
import ExpGolomb from '../../h26-helpers/exp-golomb.js';
import {
  getSarRatio,
  prependNalSize,
  walkAnnexB,
  discardEmulationPreventionBytes
} from '../../h26-helpers/index.js';

const parseNalHeader = function(bytes) {
  return {
    type: (bytes[0] & 0b01111110) >> 1,
    layerId: (bytes[0] & 0b00000001) << 6 | (bytes[1] & 0b11111000) >> 3,
    temporalId: (bytes[1] & 0b00000111),
    length: 2
  };
};

// profile_tier_level -> codec string
const getCodec = function(reader, maxSubLayers) {
  const profile = {
    space: reader.readBits(2),
    tier: reader.readBoolean(),
    id: reader.readBits(5),
    compatability: []
  };

  for (let i = 0; i < 32; i++) {
    profile.compatability.push(reader.readBits(1));
  }

  let codec = 'hev1.';

  if (profile.space === 1) {
    codec += 'A';
  } else if (profile.space === 2) {
    codec += 'B';
  } else if (profile.space === 3) {
    codec += 'C';
  }

  codec += `${profile.id}.`;

  // ffmpeg does this in big endian
  let profileCompatVal = parseInt(profile.compatability.reverse().join(''), 2);

  // apple does this in little endian...
  if (profileCompatVal > 255) {
    profileCompatVal = parseInt(profile.compatability.join(''), 2);
  }

  codec += `${profileCompatVal.toString(16)}.`;

  if (!profile.tier) {
    codec += 'L';
  } else {
    codec += 'H';
  }

  Object.assign(profile, {
    progressiveSource: reader.readBits(1),
    interlacedSource: reader.readBits(1),
    nonPacked: reader.readBits(1),
    frameOnly: reader.readBits(1),
    // reserved
    reserved: reader.skipBits(44),
    level: reader.readBits(8),
    subLayerProfilePresent: [],
    subLayerLevelPresent: []
  });

  codec += profile.level;

  const constraints = profile.progressiveSource << 3 |
    profile.interlacedSource << 2 |
    profile.nonPacked << 1 |
    profile.frameOnly;

  if (constraints) {
    let constraintString = constraints.toString(16);

    if (constraintString.length === 1) {
      constraintString += '0';
    }
    codec += `.${constraintString}`;
  }

  for (let i = 0; i < maxSubLayers; i++) {
    profile.subLayerProfilePresent.push(reader.readBoolean());
    profile.subLayerLevelPresent.push(reader.readBoolean());
  }

  if (maxSubLayers > 0) {
    for (let i = maxSubLayers; i < 8; i++) {
      reader.skipBits(2);
    }
  }

  for (let i = 0; i < maxSubLayers; i++) {
    if (profile.subLayerProfilePresent[i]) {
      reader.skipBits(2);
      reader.skipBits(1);
      reader.skipBits(5);
      reader.skipBits(32);
      reader.skipBits(4);
      reader.skipBits(44);
    }

    if (profile.subLayerLevelPresent[i]) {
      reader.skipBits(8);
    }
  }

  return codec;
};

const readSPS = function(data) {
  const result = {};
  const reader = new ExpGolomb(discardEmulationPreventionBytes(data.subarray(2)));

  reader.skipBits(4);
  const maxSubLayers = reader.readBits(3);

  reader.skipBits(1);

  result.codec = getCodec(reader, maxSubLayers);

  reader.skipUnsignedExpGolomb();
  const chromaFormat = reader.readUnsignedExpGolomb();

  if (chromaFormat === 3) {
    reader.skipBits(1);
  }
  result.width = reader.readUnsignedExpGolomb();
  result.height = reader.readUnsignedExpGolomb();

  // conformance window flag
  if (reader.readBoolean()) {
    reader.skipUnsignedExpGolomb();
    reader.skipUnsignedExpGolomb();
    reader.skipUnsignedExpGolomb();
    reader.skipUnsignedExpGolomb();
  }

  reader.skipUnsignedExpGolomb();
  reader.skipUnsignedExpGolomb();

  const log2MaxPicOrderCountMinus4 = reader.readUnsignedExpGolomb();

  // sub layer ordering info present
  const start = reader.readBoolean() ? 0 : maxSubLayers;

  for (let i = start; i <= maxSubLayers; i++) {
    reader.skipUnsignedExpGolomb();
    reader.skipUnsignedExpGolomb();
    reader.skipUnsignedExpGolomb();
  }

  reader.skipUnsignedExpGolomb();
  reader.skipUnsignedExpGolomb();
  reader.skipUnsignedExpGolomb();
  reader.skipUnsignedExpGolomb();
  reader.skipUnsignedExpGolomb();
  reader.skipUnsignedExpGolomb();

  // scaling list enabled and scaling list present flags
  if (reader.readBoolean() && reader.readBoolean()) {
    console.warn('UNTESTED h265 SCALING LIST CODE');
    for (let sizeId = 0; sizeId < 4; sizeId++) {
      for (let matrixId = 0; matrixId < ((sizeId === 3) ? 2 : 6); matrixId++) {
        if (!reader.readBoolean()) {
          reader.skipUnsignedExpGolomb();
        } else {
          if (sizeId > 1) {
            reader.skipExpGolomb();
          }

          const coefNum = Math.min(64, (1 << (4 + (sizeId << 1))));

          for (let i = 0; i < coefNum; i++) {
            reader.skipExpGolomb();
          }
        }
      }
    }
  }

  reader.skipBits(2);

  if (reader.readBoolean()) {
    reader.skipBits(4);
    reader.skipBits(4);
    reader.skipUnsignedExpGolomb();
    reader.skipUnsignedExpGolomb();
    reader.skipBits(1);
  }

  const shortPics = reader.readUnsignedExpGolomb();
  const shortSets = [];

  if (shortPics.length) {
    console.warn('h265 UNTESTED SHORT PICS code');
  }
  for (let i = 0; i < shortPics; i++) {
    let interRefPicPreditionFlag = false;

    if (i !== 0) {
      interRefPicPreditionFlag = reader.readBoolean();
    }

    if (interRefPicPreditionFlag) {
      let idDelta = 1;

      if (i === shortPics) {
        idDelta = reader.readUnsignedExpGolomb() + 1;
      }

      reader.skipBits(1);
      reader.skipUnsignedExpGolomb();

      const refId = i - idDelta;

      for (let z = 0; z < shortSets[refId] + 1; z++) {
        if (reader.readBoolean()) {
          reader.skipBits(1);
        }
      }

    } else {
      const negativePics = reader.readUnsignedExpGolomb();
      const positivePics = reader.readUnsignedExpGolomb();

      shortSets[i] = negativePics + positivePics;

      for (let z = 0; z < negativePics; z++) {
        reader.skipUnsignedExpGolomb();
        reader.skipBits(1);
      }

      for (let z = 0; z < positivePics; z++) {
        reader.skipUnsignedExpGolomb();
        reader.skipBits(1);
      }
    }
  }

  if (reader.readBoolean()) {
    const longPics = reader.readUnsignedExpGolomb();

    console.warn('h265 UNTESTED long PICS code');
    for (let i = 0; i < longPics; i++) {
      reader.skipBits(log2MaxPicOrderCountMinus4 + 4);
      reader.skipBits(1);
    }
  }

  reader.skipBits(2);

  // vui parameters
  if (reader.readBoolean()) {
    // aspect ratio present
    if (reader.readBoolean()) {
      result.sarRatio = getSarRatio(reader);
    }

    // overscan info present
    if (reader.readBoolean()) {
      reader.skipBits(1);
    }

    if (reader.readBoolean()) {
      reader.skipBits(3);
      reader.skipBits(1);

      // colour description present
      if (reader.readBoolean()) {
        reader.skipBits(8);
        reader.skipBits(8);
        reader.skipBits(8);
      }
    }

    // chroma loc info present
    if (reader.readBoolean()) {
      reader.skipUnsignedExpGolomb();
      reader.skipUnsignedExpGolomb();
    }

    reader.skipBits(3);

    // default display window flag
    if (reader.readBoolean()) {
      reader.skipUnsignedExpGolomb();
      reader.skipUnsignedExpGolomb();
      reader.skipUnsignedExpGolomb();
      reader.skipUnsignedExpGolomb();
    }

    // vui timing info present
    if (reader.readBoolean()) {
      result.numUnitsInTick =
        reader.readUnsignedByte() << 24 |
        reader.readUnsignedByte() << 16 |
        reader.readUnsignedByte() << 8 |
        reader.readUnsignedByte();

      result.timescale =
        reader.readUnsignedByte() << 24 |
        reader.readUnsignedByte() << 16 |
        reader.readUnsignedByte() << 8 |
        reader.readUnsignedByte();

      result.framerate = result.timescale / (result.numUnitsInTick * 2);

      // timescale is in kilohertz convert to hertz
      result.timescale *= result.framerate * 1000;
    }
  }

  return result;
};

export const parseTracksAndInfo = function(bytes) {
  let sps;

  walkAnnexB(bytes, function(data) {
    const {type} = parseNalHeader(data);

    // seq_parameter_set_rbsp
    if (type === 33) {
      sps = readSPS(data);
      return true;
    }
  });

  return {
    info: {
      timestampScale: sps.timescale,
      // TODO: get a real duration
      duration: 0
    },
    tracks: [{
      number: 0,
      timescale: sps.timescale * sps.framerate,
      type: 'video',
      codec: sps.codec,
      info: {
        width: sps.width,
        height: sps.height
      }
    }]
  };
};

export const parseFrames = function(bytes, state) {
  const frames = [];
  let sps;

  state.currentFrame = state.currentFrame || {nalTypes: []};

  walkAnnexB(bytes, function(nalData) {
    const {type} = parseNalHeader(nalData);
    const data = prependNalSize(nalData);

    if (type === 33) {
      sps = readSPS(nalData);
    }

    // split on 0, 1, 21, or 35
    // 21 is keyframe
    if (type < 32 || type === 35) {
      if (state.currentFrame.data) {
        state.currentFrame.trackNumber = state.tracks[0].number;
        state.currentFrame.duration = sps.timescale;
        state.currentFrame.timestamp = state.lastFrame ? (state.lastFrame.timestamp + state.lastFrame.duration) : 0;
        state.lastFrame = state.currentFrame;

        frames.push(state.currentFrame);
        state.currentFrame = {nalTypes: []};
      }

      if (type === 8 && (!state.lastFrame || state.lastFrame.nalTypes.indexOf(9) === -1)) {
        state.currentFrame.keyframe = true;
      }

      if (type === 21) {
        state.currentFrame.keyframe = true;
      }

      if (type === 20) {
        state.currentFrame.keyframe = true;
      }
      state.currentFrame.nalTypes.push(type);

      state.currentFrame.data = data;
    } else if (state.currentFrame.data) {
      state.currentFrame.nalTypes.push(type);
      state.currentFrame.data = concatTypedArrays(state.currentFrame.data, data);
    }
  });

  return frames;
};
