import {
  toUint8,
  bytesToNumber,
  bytesMatch,
  bytesToString,
  numberToBytes,
  padStart
} from '@videojs/vhs-utils/dist/byte-helpers';
import {getAvcCodec, getHvcCodec, getAv1Codec} from '@videojs/vhs-utils/dist/codec-helpers';
import {TAGS, TRACK_TYPE_NUMBER} from './constants';
import {get as getvint} from './vint.js';

// relevant specs for this parser:
// https://matroska-org.github.io/libebml/specs.html
// https://www.matroska.org/technical/elements.html
// https://www.webmproject.org/docs/container/

const EMPTY_UINT8 = new Uint8Array();

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
  let results = [];

  if (!paths.length) {
    return results;
  }

  let i = 0;

  while (i < bytes.length) {
    const id = getvint(bytes, i, false);
    const dataHeader = getvint(bytes, i + id.length);
    const dataStart = i + id.length + dataHeader.length;

    // dataSize is unknown or this is a live stream
    if (dataHeader.value === 0x7f) {
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

    if (bytesMatch(paths[0], id.bytes)) {
      if (paths.length === 1) {
        // this is the end of the paths and we've found the tag we were
        // looking for
        results.push(data);
      } else {
        // recursively search for the next tag inside of the data
        // of this one
        results = results.concat(findEbml(data, paths.slice(1), fullOnly));
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

// see https://www.matroska.org/technical/basics.html#block-structure
export const decodeBlock = function(block, type, timestampScale, clusterTimestamp = 0) {
  let duration;

  if (type === 'group') {
    duration = findEbml(block, [TAGS.BlockDuration])[0];
    if (duration) {
      duration = new DataView(duration.buffer, duration.byteOffset, duration.byteLength).getFloat64();
    }
    block = findEbml(block, [TAGS.Block])[0];
    type = 'block';
    // treat data as a block after this point
  }
  const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const trackNumber = getvint(block, 0);
  const relativeTimestamp = dv.getInt16(trackNumber.length, false);
  const flags = block[trackNumber.length + 2];
  const data = block.subarray(trackNumber.length + 3);
  const timestamp = clusterTimestamp + relativeTimestamp;
  // pts/dts in seconds
  const ptsdts = (((1 / timestampScale) * timestamp) * timestampScale) / 1000;

  // return the frame
  const parsed = {
    duration,
    trackNumber: trackNumber.value,
    keyframe: type === 'simple' && (flags >> 7) === 1,
    invisible: ((flags & 0x08) >> 3) === 1,
    lacing: ((flags & 0x06) >> 1),
    discardable: type === 'simple' && (flags & 0x01) === 1,
    frames: [],
    pts: ptsdts,
    dts: ptsdts,
    timestamp
  };

  if (!parsed.lacing) {
    parsed.frames.push(data);
    return parsed;
  }

  const numberOfFrames = data[0] + 1;

  const frameSizes = [];
  let offset = 1;

  // Fixed
  if (parsed.lacing === 2) {
    const sizeOfFrame = (data.length - offset) / numberOfFrames;

    for (let i = 0; i < numberOfFrames; i++) {
      frameSizes.push(sizeOfFrame);
    }
  }

  // xiph
  if (parsed.lacing === 1) {
    for (let i = 0; i < numberOfFrames - 1; i++) {
      let size = 0;

      do {
        size += data[offset];
        offset++;
      } while (data[offset - 1] === 0xFF);

      frameSizes.push(size);
    }
  }

  // ebml
  if (parsed.lacing === 3) {
    // first vint is unsinged
    // after that vints are singed and
    // based on a compounding size
    let size = 0;

    for (let i = 0; i < numberOfFrames - 1; i++) {
      const vint = i === 0 ? getvint(data, offset) : getvint(data, offset, true, true);

      size += vint.value;
      frameSizes.push(size);
      offset += vint.length;
    }
  }

  frameSizes.forEach(function(size) {
    parsed.frames.push(data.subarray(offset, offset + size));
    offset += size;
  });

  return parsed;
};

// VP9 Codec Feature Metadata (CodecPrivate)
// https://www.webmproject.org/docs/container/
const parseVp9Private = (bytes) => {
  let i = 0;
  const params = {};

  while (i < bytes.length) {
    const id = bytes[i] & 0x7f;
    const len = bytes[i + 1];
    let val;

    if (len === 1) {
      val = bytes[i + 2];
    } else {
      val = bytes.subarray(i + 2, i + 2 + len);
    }

    if (id === 1) {
      params.profile = val;
    } else if (id === 2) {
      params.level = val;
    } else if (id === 3) {
      params.bitDepth = val;
    } else if (id === 4) {
      params.chromaSubsampling = val;
    } else {
      params[id] = val;
    }

    i += 2 + len;
  }

  return params;
};

export const parseTracks = function(bytes) {
  bytes = toUint8(bytes);
  const decodedTracks = [];
  const tracks = findFinalEbml(bytes, [TAGS.Segment, TAGS.Tracks, TAGS.Track], true);

  if (!tracks.length) {
    return decodedTracks;
  }

  tracks.forEach(function(track) {
    let trackType = findEbml(track, TAGS.TrackType)[0];

    trackType = TRACK_TYPE_NUMBER[trackType];

    // todo parse language
    // TODO: constants/helpers for codecs
    const decodedTrack = {
      rawCodec: bytesToString(findEbml(track, [TAGS.CodecID])[0]),
      type: trackType,
      number: bytesToNumber(findEbml(track, [TAGS.TrackNumber])[0]),
      default: findEbml(track, [TAGS.FlagDefault])[0],
      rawData: track
    };

    const codecPrivate = findEbml(track, [TAGS.CodecPrivate])[0];
    const defaultDuration = findEbml(track, [TAGS.DefaultDuration])[0];
    const codecDelay = findEbml(track, [TAGS.CodecDelay])[0];
    const seekPreRoll = findEbml(track, [TAGS.SeekPreRoll])[0];

    if (codecPrivate && codecPrivate.length) {
      decodedTrack.codecPrivate = codecPrivate;
    }

    if (defaultDuration && defaultDuration.length) {
      decodedTrack.defaultDuration = bytesToNumber(defaultDuration);
    }

    if (codecDelay && codecDelay.length) {
      decodedTrack.codecDelay = bytesToNumber(codecDelay);
    }

    if (seekPreRoll && seekPreRoll.length) {
      decodedTrack.seekPreRoll = bytesToNumber(seekPreRoll);
    }

    if (trackType === 'video') {
      const video = findEbml(track, [TAGS.Video])[0];

      decodedTrack.info = {
        width: bytesToNumber(findEbml(video, [TAGS.PixelWidth])[0]),
        heigth: bytesToNumber(findEbml(video, [TAGS.PixelHeigth])[0])
      };
    } else {
      const audio = findEbml(track, [TAGS.Audio])[0];

      decodedTrack.info = {
        channels: bytesToNumber(findEbml(audio, [TAGS.Channels])[0]),
        samplingFrequency: bytesToNumber(findEbml(audio, [TAGS.SamplingFrequency])[0]),
        bitDepth: bytesToNumber(findEbml(audio, [TAGS.BitDepth])[0])
      };

    }

    let codec = '';

    if ((/V_MPEG4\/ISO\/AVC/).test(decodedTrack.rawCodec)) {
      codec = `avc1.${getAvcCodec(decodedTrack.codecPrivate)}`;
    } else if ((/V_MPEGH\/ISO\/HEVC/).test(decodedTrack.rawCodec)) {
      codec = `hev1.${getHvcCodec(decodedTrack.codecPrivate)}`;
    } else if ((/V_MPEG4\/ISO\/ASP/).test(decodedTrack.rawCodec)) {
      if (decodedTrack.codecPrivate) {
        codec = 'mp4v.20.' + decodedTrack.codecPrivate[4].toString();
      } else {
        codec = 'mp4v.20.9';
      }
    } else if ((/^V_THEORA/).test(decodedTrack.rawCodec)) {
      codec = 'theora';
    } else if ((/^V_VP8/).test(decodedTrack.rawCodec)) {
      codec = 'vp8';
    } else if ((/^V_VP9/).test(decodedTrack.rawCodec)) {
      if (decodedTrack.codecPrivate) {
        const {profile, level, bitDepth, chromaSubsampling} = parseVp9Private(decodedTrack.codecPrivate);

        codec = 'vp09.';
        codec += `${padStart(profile, 2, '0')}.`;
        codec += `${padStart(level, 2, '0')}.`;
        codec += `${padStart(bitDepth, 2, '0')}.`;
        codec += `${padStart(chromaSubsampling, 2, '0')}`;

        // Video -> Colour -> Ebml name
        const matrixCoefficients = findEbml(track, [0xE0, [0x55, 0xB0], [0x55, 0xB1]])[0] || [];
        const videoFullRangeFlag = findEbml(track, [0xE0, [0x55, 0xB0], [0x55, 0xB9]])[0] || [];
        const transferCharacteristics = findEbml(track, [0xE0, [0x55, 0xB0], [0x55, 0xBA]])[0] || [];
        const colourPrimaries = findEbml(track, [0xE0, [0x55, 0xB0], [0x55, 0xBB]])[0] || [];

        // if we find any optional codec parameter specify them all.
        if (matrixCoefficients.length ||
          videoFullRangeFlag.length ||
          transferCharacteristics.length ||
          colourPrimaries.length) {
          codec += `.${padStart(colourPrimaries[0], 2, '0')}`;
          codec += `.${padStart(transferCharacteristics[0], 2, '0')}`;
          codec += `.${padStart(matrixCoefficients[0], 2, '0')}`;
          codec += `.${padStart(videoFullRangeFlag[0], 2, '0')}`;
        }

      } else {
        codec = 'vp9';
      }
    } else if ((/^V_AV1/).test(decodedTrack.rawCodec)) {
      codec = `av01.${getAv1Codec(decodedTrack.codecPrivate)}`;
    } else if ((/A_ALAC/).test(decodedTrack.rawCodec)) {
      codec = 'alac';
    } else if ((/A_MPEG\/L2/).test(decodedTrack.rawCodec)) {
      codec = 'mp2';
    } else if ((/A_MPEG\/L3/).test(decodedTrack.rawCodec)) {
      codec = 'mp3';
    } else if ((/^A_AAC/).test(decodedTrack.rawCodec)) {
      if (decodedTrack.codecPrivate) {
        codec = 'mp4a.40.' + (decodedTrack.codecPrivate[0] >>> 3).toString();
      } else {
        codec = 'mp4a.40.2';
      }
    } else if ((/^A_AC3/).test(decodedTrack.rawCodec)) {
      codec = 'ac-3';
    } else if ((/^A_PCM/).test(decodedTrack.rawCodec)) {
      codec = 'pcm';
    } else if ((/^A_MS\/ACM/).test(decodedTrack.rawCodec)) {
      codec = 'speex';
    } else if ((/^A_EAC3/).test(decodedTrack.rawCodec)) {
      codec = 'ec-3';
    } else if ((/^A_VORBIS/).test(decodedTrack.rawCodec)) {
      codec = 'vorbis';
    } else if ((/^A_FLAC/).test(decodedTrack.rawCodec)) {
      codec = 'flac';
    } else if ((/^A_OPUS/).test(decodedTrack.rawCodec)) {
      codec = 'opus';
    }

    decodedTrack.codec = codec;
    decodedTracks.push(decodedTrack);
  });

  return decodedTracks.sort((a, b) => a.number - b.number);
};

export const parseBlocks = function(data, timestampScale, clusterTimestamp) {
  const simpleBlocks = findEbml(data, [TAGS.SimpleBlock], true)
    .map((b) => ({type: 'simple', data: b, clusterTimestamp}));
  const blockGroups = findEbml(data, [TAGS.BlockGroup], true)
    .map((b) => ({type: 'group', data: b, clusterTimestamp}));

  // get all blocks and simple blocks then sort them into the correct order
  const blocks = simpleBlocks
    .concat(blockGroups)
    .sort((a, b) => a.data.byteOffset - b.data.byteOffset);

  return blocks.map(function(block, bi) {
    return decodeBlock(block.data, block.type, timestampScale, clusterTimestamp);
  });
};

export const parseData = function(data, {tracks, info, lastClusterTimestamp} = {}) {
  const segmentInfo = findEbml(data, [TAGS.Segment, TAGS.SegmentInformation], true)[0];

  if (!info && segmentInfo) {
    info = {};

    const timestampScale = findEbml(segmentInfo, [TAGS.TimestampScale])[0];
    const duration = findEbml(segmentInfo, [TAGS.SegmentDuration])[0];

    // in nanoseconds, defaults to 1ms
    if (timestampScale && timestampScale.length) {
      info.timestampScale = bytesToNumber(timestampScale);
    } else {
      info.timestampScale = 1000000;
    }

    if (duration && duration.length) {
      info.duration = new DataView(duration.buffer, duration.byteOffset, duration.byteLength).getFloat64();
    }
  }

  if (!tracks) {
    tracks = parseTracks(data);
  }

  const clustersDatas = findFinalEbml(data, [TAGS.Segment, TAGS.Cluster]);
  const clusters = [];

  if (info) {
    const leftoverBlocks = parseBlocks(data, info.timestampScale, lastClusterTimestamp);

    if (leftoverBlocks.length) {
      clusters.push({timestamp: lastClusterTimestamp, blocks: leftoverBlocks});
    }
  }

  clustersDatas.forEach(function(clusterData, ci) {
    let timestamp = findEbml(clusterData, [TAGS.ClusterTimestamp])[0] || 0;

    if (timestamp && timestamp.length) {
      timestamp = bytesToNumber(timestamp);
    }
    clusters.push({
      timestamp,
      blocks: parseBlocks(clusterData, info.timestampScale, timestamp)
    });
  });

  const allCues = [];
  const cues = findFinalEbml(data, [TAGS.Segment, TAGS.Cues], true);

  cues.forEach(function(cue) {
    const cuePoints = findEbml(cue, [TAGS.CuePoint]);

    cuePoints.forEach(function(cuePoint) {
      const positions = findEbml(cuePoint, [TAGS.CueTrackPosition]);
      const time = findEbml(cuePoint, [TAGS.CueTime]);

      positions.forEach(function(cuePosition) {
        allCues.push({
          time,
          trackNumber: findEbml(cuePosition, [TAGS.CueTrack]),
          clusterPosition: findEbml(cuePosition, [TAGS.CueClusterPosition]),
          relativePosition: findEbml(cuePosition, [TAGS.CueRelativePosition])
        });
      });
    });
  });

  const lastCue = cues.length && cues[cues.length - 1] || EMPTY_UINT8;
  const lastCluster = clusters.length && clusters[clusters.length - 1] || EMPTY_UINT8;
  const lastBlock = lastCluster.blocks &&
    lastCluster.blocks.length &&
    lastCluster.blocks[lastCluster.blocks.length - 1] || EMPTY_UINT8;
  const lastFrame = lastBlock.frames && lastBlock.frames[lastBlock.frames.length - 1] || EMPTY_UINT8;
  const cueEnd = lastCue.byteOffset + lastCue.byteLength;
  const frameEnd = lastFrame.byteOffset + lastFrame.byteLength;
  let leftover;

  if (frameEnd === 0 && cueEnd === 0) {
    leftover = data;
  } else if (frameEnd === data.length || cueEnd === data.length) {
    leftover = new Uint8Array();
  } else if (frameEnd > cueEnd) {
    leftover = data.subarray(frameEnd);
  } else if (cueEnd > frameEnd) {
    leftover = data.subarray(cueEnd);
  }

  return {
    tracks,
    clusters,
    cues: allCues,
    info,
    leftover
  };
};
