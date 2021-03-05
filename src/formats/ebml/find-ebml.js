import {toUint8, bytesMatch, numberToBytes} from '@videojs/vhs-utils/cjs/byte-helpers';
import {get as getvint} from './vint.js';

const normalizePath = function(path) {
  if (typeof path === 'string') {
    return path.match(/.{1,2}/g).map((p) => normalizePath(p));
  }

  if (typeof path === 'number') {
    return numberToBytes(path);
  }

  if (!path) {
    throw new Error('undefined path in findEbml');
  }

  return path;
};

const normalizePaths = function(paths) {
  if (!Array.isArray(paths)) {
    return [normalizePath(paths)];
  }

  return paths.map((p) => normalizePath(p));
};

const getInfinityDataSize = (id, bytes, offset) => {
  if (offset >= bytes.length) {
    return bytes.length;
  }
  const innerid = getvint(bytes, offset, false);

  if (bytesMatch(id.bytes, innerid.bytes)) {
    return offset;
  }

  const dataHeader = getvint(bytes, offset + innerid.length);

  return getInfinityDataSize(id, bytes, offset + dataHeader.length + dataHeader.value + innerid.length);
};

/**
 * Notes on the EBLM format.
 *
 * EBLM uses "vints" tags. Every vint tag contains
 * two parts
 *
 * 1. The length from the first byte. You get this by
 *    converting the byte to binary and counting the zeros
 *    before a 1. Then you add 1 to that. Examples
 *    00011111 = length 4 because there are 3 zeros before a 1.
 *    00100000 = length 3 because there are 2 zeros before a 1.
 *    00000011 = length 7 because there are 6 zeros before a 1.
 *
 * 2. The bits used for length are removed from the first byte
 *    Then all the bytes are merged into a value. NOTE: this
 *    is not the case for id ebml tags as there id includes
 *    length bits.
 *
 */
export const findEbml = function(bytes, paths, fullOnly = false) {
  paths = normalizePaths(paths);
  bytes = toUint8(bytes);
  const results = [];

  if (!paths.length) {
    return results;
  }

  let i = 0;

  while (i < bytes.length) {
    const id = getvint(bytes, i, false);
    const dataHeader = getvint(bytes, i + id.length);
    const dataStart = i + id.length + dataHeader.length;

    // if length is all 0x7f aka all 1 bits
    // dataSize is unknown or this is a live stream
    if (bytes[i + id.length] === 0x7f) {
      dataHeader.value = getInfinityDataSize(id, bytes, dataStart);

      if (dataHeader.value !== bytes.length) {
        dataHeader.value -= dataStart;
      }
    }
    let dataEnd = dataStart + dataHeader.value;

    if (dataEnd > bytes.length) {
      if (fullOnly && paths.length === 1) {
        break;
      }
      dataEnd = bytes.length;
    }

    const data = bytes.subarray(dataStart, dataEnd);

    if ((typeof paths[0] === 'function' && paths[0](id.bytes)) || bytesMatch(paths[0], id.bytes)) {
      if (paths.length === 1) {
        // this is the end of the paths and we've found the tag we were
        // looking for
        data.tag = id.bytes;
        results.push(data);
      } else {
        // recursively search for the next tag inside of the data
        // of this one
        results.push.apply(results, findEbml(data, paths.slice(1), fullOnly));
      }
    }

    const totalLength = id.length + dataHeader.length + data.length;

    // move past this tag entirely, we are not looking for it
    i += totalLength;
  }

  return results;
};

export const findFinalEbml = function(data, paths, fullOnly) {
  let result = [];

  for (let i = 0; i < paths.length; i++) {
    const found = findEbml(data, paths.slice(i), fullOnly);

    if (found.length) {
      result = result.concat(found);
    }
  }

  return result;
};
