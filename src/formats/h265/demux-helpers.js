/* eslint-disable no-console */
import {concatTypedArrays} from '@videojs/vhs-utils/cjs/byte-helpers';
import {walkAnnexB} from '../../nal-unit/walk.js';
import toSizedNal from '../../nal-unit/to-sized.js';

const parseNalHeader = function(bytes) {
  return {
    type: (bytes[0] & 0b01111110) >> 1,
    layerId: (bytes[0] & 0b00000001) << 6 | (bytes[1] & 0b11111000) >> 3,
    temporalId: (bytes[1] & 0b00000111),
    length: 2
  };
};

export const parseTracksAndInfo = function(bytes) {
  let sps;

  walkAnnexB(bytes, function(data) {
    const header = parseNalHeader(data);

    if (header.type !== 33 && header.type !== 34 && header.type !== 32 && header.type !== 39) {
      // TODO parse out codec/timing information
    }
  });

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
      codec: 'hev1',
      info: {
        width: sps.width,
        height: sps.height
      }
    }]
  };
};

const walkH265Frames = function(bytes, callback, options) {
  const frames = [];
  let currentFrame = {};

  walkAnnexB(bytes, function(data) {
    const nal = {
      header: parseNalHeader(data),
      data: toSizedNal(data)
    };

    // split on 0, 1, 21, or 35
    // 21 is keyframe
    if (nal.header.type === 0x00 || nal.header.type === 0x01 || nal.header.type === 0x15 || nal.header.type === 0x23) {

      if (currentFrame.data) {
        frames.push(currentFrame);
      }

      currentFrame = {};

      if (nal.header.type === 0x15) {
        currentFrame.keyframe = true;
      }

      currentFrame.data = nal.data;
    } else if (currentFrame.data) {
      currentFrame.data = concatTypedArrays(currentFrame.data, nal.data);
    }
  });

  return frames;
};

export const parseFrames = function(bytes, cache, options) {
  const frames = [];

  walkH265Frames(bytes, (frame) => {
    frames.push(frame);
  }, cache, options);

  return {frames, cache};
};
