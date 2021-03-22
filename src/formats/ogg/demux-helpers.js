import {bytesMatch, bytesToNumber, stringToBytes} from '@videojs/vhs-utils/cjs/byte-helpers.js';
import {getId3Offset} from '@videojs/vhs-utils/cjs/id3-helpers.js';

const SYNC_BYTES = [0x4F, 0x67, 0x67, 0x53];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset});

// https://tools.ietf.org/html/rfc6716#section-3.1 page 14
// in ms
const opusFrameSizes = [
  // SILK-only NB
  10, 20, 40, 60,
  // SILK-only MB
  10, 20, 40, 60,
  // SILK-only WB
  10, 20, 40, 60,
  // Hybrid SWB
  10, 20,
  // Hybrid FB
  10, 20,
  // CELT-only NB
  2.5, 5, 10, 20,
  // CELT-only WB
  2.5, 5, 10, 20,
  // CELT-only SWB
  2.5, 5, 10, 20,
  // CELT-only FB
  2.5, 5, 10, 20
];

const OpusHead = new Uint8Array([
  // O, p, u, s
  0x4f, 0x70, 0x75, 0x73,
  // H, e, a, d
  0x48, 0x65, 0x61, 0x64
]);

const OpusTags = new Uint8Array([
  // O, p, u, s
  0x4f, 0x70, 0x75, 0x73,
  // T, a, g, s
  0x54, 0x61, 0x67, 0x73
]);

const parseOpusHead = function(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  // version 0, from mp4, does not use littleEndian.
  const littleEndian = version !== 0;

  const config = {
    version,
    channels: view.getUint8(1),
    preSkip: view.getUint16(2, littleEndian),
    sampleRate: view.getUint32(4, littleEndian),
    outputGain: view.getUint16(8, littleEndian),
    channelMappingFamily: view.getUint8(10)
  };

  if (config.channelMappingFamily > 0 && bytes.length > 10) {
    config.streamCount = view.getUint8(11);
    config.twoChannelStreamCount = view.getUint8(12);
    config.channelMapping = [];

    for (let c = 0; c < config.channels; c++) {
      config.channelMapping.push(view.getUint8(13 + c));
    }
  }

  return config;
};

const walkSegments = function(bytes, callback, {offset = 0, full = true} = {}) {
  offset = getId3Offset(bytes, offset);

  while (offset < bytes.byteLength) {
    if (!isInSync(bytes, offset)) {
      offset += 1;
      continue;
    }

    if (offset + 27 >= bytes.byteLength) {
      return;
    }
    const page = {
      fresh: (bytes[offset + 5] & 0x01) > 0,
      first: (bytes[offset + 5] & 0x02) > 0,
      last: (bytes[offset + 5] & 0x04) > 0,
      granualPosition: bytesToNumber(bytes.subarray(offset + 6, offset + 13), {signed: true, le: true}),
      serialNumber: bytesToNumber(bytes.subarray(offset + 14, offset + 17), {le: true}),
      sequenceNumber: bytesToNumber(bytes.subarray(offset + 18, offset + 21), {le: true}),
      checksum: bytesToNumber(bytes.subarray(offset + 22, offset + 25), {le: true}),
      segmentSizes: bytes[offset + 26],
      segments: [],
      frameSizes: []
    };

    // header size
    offset += 27;

    const segmentTableEnd = offset + page.segmentSizes;
    let segmentOffset = segmentTableEnd;

    while (offset < segmentTableEnd) {
      let size = 0;

      do {
        size += bytes[offset];
        offset++;
      } while (offset < bytes.length && bytes[offset - 1] === 0xFF);

      if (segmentOffset >= bytes.byteLength) {
        return;
      }

      segmentOffset += size;
      page.frameSizes.push(size);
    }

    for (let i = 0; i < page.frameSizes.length; i++) {
      const size = page.frameSizes[i];
      const segment = bytes.subarray(offset, offset + size);

      const stop = callback(page, segment);

      if (stop) {
        return;
      }
      offset += size;
    }
  }
};

const parseTrack = function(segment, number) {
  // skip header pages/segments
  if (bytesMatch(segment, OpusHead)) {
    const t = parseOpusHead(segment.subarray(8));

    return {
      number,
      duration: 0,
      info: {
        sampleRate: t.sampleRate,
        channels: t.channels,
        bitBepth: 16
      },
      timescale: t.sampleRate,
      type: 'audio',
      codec: 'opus'
    };
  } else if (bytesMatch(segment, stringToBytes('theora'), {offset: 1})) {

    // TODO: parse theora head
    return {
      number,
      duration: 0,
      info: {
        width: 0,
        heigth: 0
      },
      timescale: 0,
      type: 'video',
      codec: 'theora'
    };
  } else if (bytesMatch(segment, stringToBytes('vorbis'), {offset: 1})) {
    // TODO: parse vorbis
    return {
      number,
      duration: 0,
      info: {
        sampleRate: 0,
        channels: 0,
        bitBepth: 16
      },
      timescale: 48000,
      type: 'audio',
      codec: 'vorbis'
    };
  } else if (bytesMatch(segment, stringToBytes('Speex'))) {
    // TODO: parse speex
    return {
      number,
      duration: 0,
      info: {
        sampleRate: 0,
        channels: 0,
        bitBepth: 16
      },
      timescale: 48000,
      type: 'audio',
      codec: 'speex'
    };
  } else if (bytesMatch(segment, stringToBytes('FLAC'))) {
    // TODO: parse flac
    return {
      number,
      duration: 0,
      info: {
        sampleRate: 0,
        channels: 0,
        bitBepth: 16
      },
      timescale: 48000,
      type: 'audio',
      codec: 'speex'
    };
  }
};

export const parseTracksAndInfo = function(bytes) {
  const tracks = [];
  const serialTracks = {};

  walkSegments(bytes, function(page, segment) {
    if (!page.first) {
      return true;
    }
    const track = parseTrack(segment, tracks.length);

    if (track) {
      serialTracks[page.serialNumber] = track;
      tracks.push(track);
    }
  });

  return {
    serialTracks,
    tracks,
    info: {timesampScale: 48000, duration: 0}
  };
};

export const parseFrames = function(bytes, {lastFrame, serialTracks}) {
  const frames = [];

  walkSegments(bytes, function(page, segment) {
    if (bytesMatch(segment, OpusTags) || parseTrack(segment, 0)) {
      return;
    }

    lastFrame = frames.length && frames[frames.length - 1] || lastFrame;

    // TODO: we may need to grab more than one frame from a segment
    // for variable length opus
    frames.push({
      trackNumber: serialTracks[page.serialNumber].number,
      keyframe: true,
      // first 5 bits of the segment is the config, which defines the frame size
      duration: opusFrameSizes[segment[0] >> 3],
      timestamp: lastFrame ? (lastFrame.timestamp + lastFrame.duration) : 0,
      data: segment
    });

  });

  return frames;
};
