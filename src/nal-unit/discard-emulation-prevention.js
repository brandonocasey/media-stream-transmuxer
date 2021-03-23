/* eslint-disable no-console */
import {bytesMatch, toUint8} from '@videojs/vhs-utils/cjs/byte-helpers';

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

export default discardEmulationPreventionBytes;
