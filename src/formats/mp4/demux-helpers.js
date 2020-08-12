import {
  stringToBytes,
  toUint8,
  bytesMatch,
  bytesToString,
  toHexString,
  padStart,
  bytesToNumber
} from '@videojs/vhs-utils/dist/byte-helpers';
import {getAvcCodec, getHvcCodec, getAv1Codec} from '@videojs/vhs-utils/dist/codec-helpers';
import {TimeObject} from '../../time-scale.js';

const normalizePath = function(path) {
  if (typeof path === 'string') {
    return stringToBytes(path);
  }

  if (typeof path === 'number') {
    return path;
  }

  if (!path) {
    throw new Error('undefined path in findBox');
  }

  return path;
};

const normalizePaths = function(paths) {
  if (!Array.isArray(paths)) {
    return [normalizePath(paths)];
  }

  return paths.map((p) => normalizePath(p));
};

let DESCRIPTORS;

export const parseDescriptors = function(bytes) {
  bytes = toUint8(bytes);
  const results = [];
  let i = 0;

  while (bytes.length > i) {
    const tag = bytes[i];
    let size = 0;
    let headerSize = 0;

    // tag
    headerSize++;

    let byte = bytes[headerSize];

    // first byte
    headerSize++;

    while (byte & 0x80) {
      size = (byte & 0x7F) << 7;
      byte = bytes[headerSize];
      headerSize++;
    }

    size += byte & 0x7F;

    for (let z = 0; z < DESCRIPTORS.length; z++) {
      const {id, parser} = DESCRIPTORS[z];

      if (tag === id) {
        results.push(parser(bytes.subarray(headerSize, headerSize + size)));
        break;
      }
    }

    i += size + headerSize;
  }

  return results;

};

DESCRIPTORS = [
  {id: 0x03, parser(bytes) {
    const desc = {
      tag: 0x03,
      id: bytes[0] << 8 | bytes[1],
      flags: bytes[2],
      size: 3,
      dependsOnEsId: 0,
      ocrEsId: 0,
      descriptors: [],
      url: ''
    };

    // depends on es id
    if (desc.flags & 0x80) {
      desc.dependsOnEsId = bytes[desc.size] << 8 | bytes[desc.size + 1];
      desc.size += 2;
    }

    // url
    if (desc.flags & 0x40) {
      const len = bytes[desc.size];

      desc.url = bytesToString(bytes.subarray(desc.size + 1, desc.size + 1 + len));

      desc.size += len;
    }

    // ocr es id
    if (desc.flags & 0x20) {
      desc.ocrEsId = bytes[desc.size] << 8 | bytes[desc.size + 1];
      desc.size += 2;
    }

    desc.descriptors = parseDescriptors(bytes.subarray(desc.size)) || [];

    return desc;
  }},
  {id: 0x04, parser(bytes) {
    // DecoderConfigDescriptor
    const desc = {
      tag: 0x04,
      oti: bytes[0],
      streamType: bytes[1],
      bufferSize: bytes[2] << 16 | bytes [3] << 8 | bytes[4],
      maxBitrate: bytes[5] << 24 | bytes[6] << 16 | bytes [7] << 8 | bytes[8],
      avgBitrate: bytes[9] << 24 | bytes[10] << 16 | bytes [11] << 8 | bytes[12],
      descriptors: parseDescriptors(bytes.subarray(13))
    };

    return desc;
  }},
  {id: 0x05, parser(bytes) {
    // DecoderSpecificInfo

    return {
      tag: 0x05,
      bytes
    };
  }},
  {id: 0x06, parser(bytes) {
    // SLConfigDescriptor

    return {tag: 0x06, bytes};
  }}
];

export const findBox = function(bytes, paths, fullOnly = false) {
  paths = normalizePaths(paths);
  bytes = toUint8(bytes);

  const results = [];

  if (!paths.length) {
    // short-circuit the search for empty paths
    return results;
  }
  let i = 0;

  while (i < bytes.length) {
    const size = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    const type = bytes.subarray(i + 4, i + 8);
    let end = i + size;

    if (end > bytes.length) {
      if (fullOnly) {
        break;
      }

      end = bytes.length;
    }

    const data = bytes.subarray(i + 8, end);

    if (bytesMatch(type, paths[0])) {
      if (paths.length === 1) {
        // this is the end of the path and we've found the box we were
        // looking for
        results.push(data);
      } else {
        // recursively search for the next box along the path
        results.push.apply(results, findBox(data, paths.slice(1), fullOnly));
      }
    }

    i = end;
  }

  // we've finished searching all of bytes
  return results;
};

export const findNamedBox = function(bytes, path) {
  path = normalizePath(path);

  if (!path.length) {
    // short-circuit the search for empty paths
    return [];
  }

  let i = 0;

  while (i < bytes.length) {
    if (bytesMatch(bytes.subarray(i, i + path.length), path)) {
      const size = (bytes[i - 4] << 24 | bytes[i - 3] << 16 | bytes[i - 2] << 8 | bytes[i - 1]) >>> 0;
      const end = size > 1 ? i + size : bytes.byteLength;

      return bytes.subarray(i + 4, end);
    }

    i++;
  }

  // we've finished searching all of bytes
  return [];

};

const parseSamples = function(data, entrySize = 4, parseEntry = (d) => bytesToNumber(d)) {
  const entries = [];

  if (!data || !data.length) {
    return entries;
  }

  let entryCount = bytesToNumber(data.subarray(4, 8));

  for (let i = 8; entryCount; i += entrySize, entryCount--) {
    entries.push(parseEntry(data.subarray(i, i + entrySize)));
  }

  return entries;
};

export const buildFrameTable = function(stbl, timescale) {
  const keySamples = parseSamples(findBox(stbl, ['stss'])[0]);
  const chunkOffsets = parseSamples(findBox(stbl, ['stco'])[0]);
  const timeToSamples = parseSamples(findBox(stbl, ['stts'])[0], 8, (entry) => ({
    sampleCount: bytesToNumber(entry.subarray(0, 4)),
    sampleDelta: bytesToNumber(entry.subarray(4, 8))
  }));
  const samplesToChunks = parseSamples(findBox(stbl, ['stsc'])[0], 12, (entry) => ({
    firstChunk: bytesToNumber(entry.subarray(0, 4)),
    samplesPerChunk: bytesToNumber(entry.subarray(4, 8)),
    sampleDescriptionIndex: bytesToNumber(entry.subarray(8, 12))
  }));

  const stsz = findBox(stbl, ['stsz'])[0];

  // stsz starts with a 4 byte sampleSize which we don't need
  const sampleSizes = parseSamples(stsz && stsz.length && stsz.subarray(4) || null);
  const frames = [];

  for (let chunkIndex = 0; chunkIndex < chunkOffsets.length; chunkIndex++) {
    let samplesInChunk;

    for (let i = 0; i < samplesToChunks.length; i++) {
      const sampleToChunk = samplesToChunks[i];
      const isThisOne = (chunkIndex + 1) >= sampleToChunk.firstChunk &&
        (i + 1 >= samplesToChunks.length || (chunkIndex + 1) < samplesToChunks[i + 1].firstChunk);

      if (isThisOne) {
        samplesInChunk = sampleToChunk.samplesPerChunk;
        break;
      }
    }

    let chunkOffset = chunkOffsets[chunkIndex];

    for (let i = 0; i < samplesInChunk; i++) {
      const frameEnd = sampleSizes[frames.length];

      // if we don't have key samples every frame is a keyframe
      let keyframe = !keySamples.length;

      if (keySamples.length && keySamples.indexOf(frames.length + 1) !== -1) {
        keyframe = true;
      }

      const frame = {
        keyframe,
        start: chunkOffset,
        end: chunkOffset + frameEnd
      };

      for (let k = 0; k < timeToSamples.length; k++) {
        const {sampleCount, sampleDelta} = timeToSamples[k];

        if ((frames.length) <= sampleCount) {
          // ms to ns
          const lastTimestamp = frames.length ? frames[frames.length - 1].timestamp.get('ms') : 0;

          frame.timestamp = new TimeObject(lastTimestamp + sampleDelta, 'ms');
          frame.duration = new TimeObject(sampleDelta, 'ms');
          break;
        }
      }

      frames.push(frame);

      chunkOffset += frameEnd;
    }
  }

  return frames;
};

export const parseTracks = function(bytes) {
  bytes = toUint8(bytes);

  const traks = findBox(bytes, ['moov', 'trak'], true);
  const tracks = [];

  traks.forEach(function(trak) {
    const track = {};
    const mdia = findBox(trak, ['mdia'])[0];

    const hdlr = findBox(mdia, ['hdlr'])[0];
    const trakType = bytesToString(hdlr.subarray(8, 12));

    if (trakType === 'soun') {
      track.type = 'audio';
    } else if (trakType === 'vide') {
      track.type = 'video';
    } else {
      track.type = trakType;
    }

    const tkhd = findBox(trak, ['tkhd'])[0];

    if (tkhd) {
      const view = new DataView(tkhd.buffer, tkhd.byteOffset, tkhd.byteLength);
      const tkhdVersion = view.getUint8(0);

      track.number = (tkhdVersion === 0) ? view.getUint32(12) : view.getUint32(20);
    }

    const mdhd = findBox(mdia, ['mdhd'])[0];

    if (mdhd) {
      // mdhd is a FullBox, meaning it will have its own version as the first byte
      const version = mdhd[0];
      const index = version === 0 ? 12 : 20;

      track.timescale = (
        mdhd[index] << 24 |
        mdhd[index + 1] << 16 |
        mdhd[index + 2] << 8 |
        mdhd[index + 3]
      ) >>> 0;
    }

    const stbl = findBox(mdia, ['minf', 'stbl'])[0];
    const stsd = findBox(stbl, ['stsd'])[0];
    const sampleDescriptions = stsd.subarray(8);
    let codec = bytesToString(sampleDescriptions.subarray(4, 8));
    const codecBox = findBox(sampleDescriptions, [codec])[0];

    if (track.type === 'video') {
      track.info = {
        width: codecBox[24] << 8 | codecBox[25],
        height: codecBox[26] << 8 | codecBox[27]
      };
    } else if (track.type === 'audio') {
      track.info = {
        channels: codecBox[16] << 8 | codecBox[17],
        bitDepth: codecBox[18] << 8 | codecBox[19],
        sampleRate: codecBox[24] << 8 | codecBox[25]
      };
    }

    if (codec === 'avc1') {
      const avcC = findNamedBox(codecBox, 'avcC');

      // AVCDecoderConfigurationRecord
      codec += `.${getAvcCodec(avcC)}`;
      track.info.avcC = avcC;
      // TODO: do we need to parse all this?
      /* {
        configurationVersion: avcC[0],
        profile: avcC[1],
        profileCompatibility: avcC[2],
        level: avcC[3],
        lengthSizeMinusOne: avcC[4] & 0x3
      };

      let spsNalUnitCount = avcC[5] & 0x1F;
      const spsNalUnits = track.info.avc.spsNalUnits = [];

      // past spsNalUnitCount
      let offset = 6;

      while (spsNalUnitCount--) {
        const nalLen = avcC[offset] << 8 | avcC[offset + 1];

        spsNalUnits.push(avcC.subarray(offset + 2, offset + 2 + nalLen));

        offset += nalLen + 2;
      }
      let ppsNalUnitCount = avcC[offset];
      const ppsNalUnits = track.info.avc.ppsNalUnits = [];

      // past ppsNalUnitCount
      offset += 1;

      while (ppsNalUnitCount--) {
        const nalLen = avcC[offset] << 8 | avcC[offset + 1];

        ppsNalUnits.push(avcC.subarray(offset + 2, offset + 2 + nalLen));

        offset += nalLen + 2;
      }*/

      // HEVCDecoderConfigurationRecord
    } else if (codec === 'hvc1' || codec === 'hev1') {
      codec += `.${getHvcCodec(findNamedBox(codecBox, 'hvcC'))}`;
    } else if (codec === 'mp4a' || codec === 'mp4v') {
      const esds = findNamedBox(codecBox, 'esds');
      const esDescriptor = parseDescriptors(esds.subarray(4))[0];
      const decoderConfig = esDescriptor.descriptors.filter(({tag}) => tag === 0x04)[0];

      if (decoderConfig) {
        codec += '.' + toHexString(decoderConfig.oti);
        if (decoderConfig.oti === 0x40) {
          codec += '.' + (decoderConfig.descriptors[0].bytes[0] >> 3).toString();
        } else if (decoderConfig.oti === 0x20) {
          codec += '.' + (decoderConfig.descriptors[0].bytes[4]).toString();
        } else if (decoderConfig.oti === 0xdd) {
          codec = 'vorbis';
        }
      }

    } else if (codec === 'av01') {
      // AV1DecoderConfigurationRecord
      codec += `.${getAv1Codec(findNamedBox(codecBox, 'av1C'))}`;
    } else if (codec === 'vp09') {
      // VPCodecConfigurationRecord
      const vpcC = findNamedBox(codecBox, 'vpcC');

      // https://www.webmproject.org/vp9/mp4/
      const profile = vpcC[0];
      const level = vpcC[1];
      const bitDepth = vpcC[2] >> 4;
      const chromaSubsampling = (vpcC[2] & 0x0F) >> 1;
      const videoFullRangeFlag = (vpcC[2] & 0x0F) >> 3;
      const colourPrimaries = vpcC[3];
      const transferCharacteristics = vpcC[4];
      const matrixCoefficients = vpcC[5];

      codec += `.${padStart(profile, 2, '0')}`;
      codec += `.${padStart(level, 2, '0')}`;
      codec += `.${padStart(bitDepth, 2, '0')}`;
      codec += `.${padStart(chromaSubsampling, 2, '0')}`;
      codec += `.${padStart(colourPrimaries, 2, '0')}`;
      codec += `.${padStart(transferCharacteristics, 2, '0')}`;
      codec += `.${padStart(matrixCoefficients, 2, '0')}`;
      codec += `.${padStart(videoFullRangeFlag, 2, '0')}`;
    } else if (codec === 'theo') {
      codec = 'theora';
    } else if (codec === 'spex') {
      codec = 'speex';
    } else if (codec === '.mp3') {
      codec = 'mp4a.40.34';
    } else if (codec === 'msVo') {
      codec = 'vorbis';
    } else {
      codec = codec.toLowerCase();
    }
    /* eslint-enable */
    // flac, ac-3, ec-3, opus
    track.codec = codec;

    // Firefox requires a codecDelay for opus playback
    // see https://bugzilla.mozilla.org/show_bug.cgi?id=1276238
    if (track.codec === 'opus') {
      track.codecDelay = 6500000;
    }

    track.frames = buildFrameTable(stbl, track.timescale);

    track.raw = trak;
    // codec has no sub parameters
    tracks.push(track);
  });

  return tracks;
};
