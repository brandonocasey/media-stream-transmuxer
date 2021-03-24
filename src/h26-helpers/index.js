import {bytesMatch, toUint8, bytesToNumber} from '@videojs/vhs-utils/cjs/byte-helpers';

const NAL_TYPE_ONE = toUint8([0x00, 0x00, 0x00, 0x01]);
const NAL_TYPE_TWO = toUint8([0x00, 0x00, 0x01]);
const EMULATION_PREVENTION = toUint8([0x00, 0x00, 0x03]);

const getNalOffset = function(bytes) {
  if (bytesMatch(bytes, NAL_TYPE_ONE)) {
    return 4;
  } else if (bytesMatch(bytes, NAL_TYPE_TWO)) {
    return 3;
  }
};

export const getSarRatio = function(reader) {

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

  return sarRatio;
};

/**
 * Expunge any "Emulation Prevention" bytes from a "Raw Byte
 * Sequence Payload"
 *
 * @param data {Uint8Array} the bytes of a RBSP from a NAL
 * unit
 * @return {Uint8Array} the RBSP without any Emulation
 * Prevention Bytes
 */
export const discardEmulationPreventionBytes = function(bytes) {
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

// for adding the u32 annex b prefix to the front of a uint8array
// for annex b type nal units
export const prependAnnexB = function(data) {
  const newData = new Uint8Array(data.length + 4);

  // add annex b prefix
  newData[0] = 0x00;
  newData[1] = 0x00;
  newData[1] = 0x00;
  newData[1] = 0x01;

  newData.set(data, 4);

  return newData;
};

// for adding the u32 size to the front of a uint8array
// for avcc type nal units
export const prependNalSize = function(data) {
  const sizedData = new Uint8Array(data.length + 4);
  const dv = new DataView(sizedData.buffer);

  dv.setUint32(0, data.length);
  sizedData.set(data, 4);

  return sizedData;
};

// walk annex b style nal units
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

// walk size prepended style nal units aka avcc
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
