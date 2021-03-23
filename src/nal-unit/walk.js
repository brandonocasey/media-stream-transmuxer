/* eslint-disable no-console */
import {bytesToNumber, bytesMatch, toUint8} from '@videojs/vhs-utils/cjs/byte-helpers';

const NAL_TYPE_ONE = toUint8([0x00, 0x00, 0x00, 0x01]);
const NAL_TYPE_TWO = toUint8([0x00, 0x00, 0x01]);

const getNalOffset = function(bytes) {
  if (bytesMatch(bytes, NAL_TYPE_ONE)) {
    return 4;
  } else if (bytesMatch(bytes, NAL_TYPE_TWO)) {
    return 3;
  }
};

export const walkAnnexB = function(bytes, callback, {offset = 0} = {}) {
  bytes = toUint8(bytes);

  let i = offset;
  let currentNal = {};

  // TODO: change to finding start/end of a nal
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
      const stop = callback(currentNal.data);

      // reset current nal
      currentNal = {};

      if (stop) {
        return;
      }
    }

    if (!nalOffset) {
      break;
    }

    currentNal.start = i + nalOffset;

    i += nalOffset + 1;
  }
};

export const walkSized = function(bytes, callback, {offset = 0} = {}) {
  bytes = toUint8(bytes);

  let i = offset;

  while (i < bytes.length) {
    const nalLength = bytesToNumber(bytes.subarray(i, i + 4));
    const data = bytes.subarray(i + 4, i + 4 + nalLength);
    const stop = callback(data);

    if (stop) {
      return;
    }
    i += 4 + nalLength;
  }
};
