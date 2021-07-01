/* eslint-disable no-console */
import {bytesMatch, concatTypedArrays, stringToBytes} from '@videojs/vhs-utils/cjs/byte-helpers.js';

const SYNC_BYTES = [0x47];
const PACKET_START_CODE_PREFIX = [0x00, 0x00, 0x01];

const getStreamType = (type, esinfo) => {
  if (type === 0x01 || type === 0x02) {
    return {codec: 'mp4v.20', type: 'video'};
  }

  if (type === 0x03 || type === 0x04) {
    return {codec: 'mp3', type: 'audio'};
  }

  if (type === 0x0f || type === 0x11 || type === 0x1c) {
    return {codec: 'aac', type: 'audio'};
  }

  if (type === 0x1b || type === 0x20) {
    return {codec: 'avc1', type: 'video'};
  }

  if (type === 0x21) {
    return {codec: 'jpeg2000', type: 'video'};
  }

  if (type === 0x24) {
    return {codec: 'hev1', type: 'video'};
  }

  if (type === 0x81 || type === 0x6a) {
    return {codec: 'ac-3', type: 'audio'};
  }

  if (type === 0x84 || type === 0xa1 || type === 0x7a || type === 0x87) {
    return {codec: 'eac-3', type: 'audio'};
  }

  if (type === 0x86) {
    return {codec: 'scte-35', type: 'text'};
  }

  if (esinfo && esinfo.length) {
    if (bytesMatch(esinfo, stringToBytes('Opus'), {offset: 2})) {
      return {codec: 'opus', type: 'audio'};
    }

    if (bytesMatch(esinfo, stringToBytes('AC-3'))) {
      return {codec: 'ac-3', type: 'audio'};
    }

    if (bytesMatch(esinfo, stringToBytes('EAC3'))) {
      return {codec: 'eac-3', type: 'audio'};
    }

    if (bytesMatch(esinfo, stringToBytes('HEVC'))) {
      return {codec: 'eac-3', type: 'audio'};
    }

    if (bytesMatch(esinfo, stringToBytes('ID3'))) {
      return {codec: 'id3', type: 'text'};
    }
  }

  return {codec: 'unknown', type};

};

// TODO: parse this
const avcC = new Uint8Array([1, 100, 0, 13, 255, 225, 0, 29, 103, 100, 0, 13, 172, 217, 65, 161, 251, 255, 0, 213, 0, 208, 16, 0, 0, 3, 0, 16, 0, 0, 3, 3, 0, 241, 66, 153, 96, 1, 0, 6, 104, 235, 224, 101, 44, 139, 253, 248, 248, 0, 0, 0, 0, 16]);

// TODO: pass full pes frames to codec specific format demuxers
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset});
const parsePtsdts = (bytes) =>
  // 1 << 29
  (bytes[0] & 0x0e) * 536870912 +
  // 1 << 22
  (bytes[1] & 0xff) * 4194304 +
  // 1 << 14
  (bytes[2] & 0xfe) * 16384 +
  // 1 << 7
  (bytes[3] & 0xff) * 128 +
  (bytes[4] & 0xfe) / 2;

export const parsePES = function(packet) {
  const payload = packet.payload;

  if (!bytesMatch(payload, PACKET_START_CODE_PREFIX)) {
    return null;
  }

  let pes = {
    streamId: payload[3],
    // if set to zero it can be any length,
    // can only be zero for video.
    length: payload[4] << 8 | payload[5]
  };

  // no pes header for:
  // padding stream (0xBE)
  // private stream 2 (0xBF)
  // pes header marker bit not set, first two bits are 0b10
  if (pes.streamId === 0xBE || pes.streamId === 0xBF || ((payload[6] & 0b11000000) >> 6) !== 0b10) {
    return pes;
  }

  pes = Object.assign(pes, {
    scrambling: (payload[6] & 0b00110000) >> 4,
    priority: (payload[6] & 0b00001000) >> 3,
    // pes followwed by video/audio syncord
    dataAlignmentInicator: ((payload[6] & 0b00000100) >> 2) === 1,
    copyright: ((payload[6] & 0b00000010) >> 1) === 1,
    original: (payload[6] & 0b00000001) === 1,
    ptsdts: (payload[7] & 0b11000000) >> 6,
    escr: ((payload[7] & 0b00100000) >> 5) === 1,
    esRate: ((payload[7] & 0b00010000) >> 4) === 1,
    dsmTrickMode: ((payload[7] & 0b00001000) >> 3) === 1,
    additionalCopy: ((payload[7] & 0b00000100) >> 2) === 1,
    crc: ((payload[7] & 0b00000010) >> 1) === 1,
    extension: (payload[7] & 0b00000001) === 1,
    headerLength: payload[8]
  });

  let offset = 9;

  pes.headerData = payload.subarray(offset, pes.headerLength);
  pes.data = payload.subarray(offset + pes.headerLength);

  // http://dvd.sourceforge.net/dvdinfo/pes-hdr.html
  // 0b10 is pts only
  // 0b11 is pts followed by dts
  if (pes.ptsdts === 0b10 && pes.headerLength >= 5) {
    pes.pts = pes.dts = parsePtsdts(payload.subarray(offset));
    offset += 5;
  } else if (pes.ptsdts === 0b11 && pes.headerLength >= 10) {
    pes.pts = parsePtsdts(payload.subarray(offset));
    pes.dts = parsePtsdts(payload.subarray(offset + 5));
    offset += 10;
  }

  // TODO: do we need to parse escr, esRate, crc, or extension data?

  return pes;
};

export const parsePSI = function(packet) {
  const payload = packet.payload;

  // TODO: do we need to handle pointer?
  const psi = {
    pointer: payload[0],
    tableId: payload[1],
    syntax: (payload[2] & 0b10000000) >> 7,
    // reserved: (payload[2] & 0b01110000) >> 4,

    // length starts counting after the length bytes
    // which does not include 5 header bytes... ok then
    length: ((payload[2] & 0b00001111) << 8) | payload[3],
    streamId: payload[4] << 8 | payload[5],
    // reserved: payload[6] & 0b11000000 >> 6,
    version: payload[6] & 0b00111110 >> 1,
    current: payload[6] & 0b00000001,
    section: payload[7],
    lastSection: payload[8]
  };

  let headerOffset = 9;

  // TODO: we should do a better job parsing here
  if (psi.tableId === 0x42) {
    psi.type = 'SDT';
  } else if (psi.tableId === 0x00) {
    psi.type = 'PAT';
    psi.programs = [];

    for (let i = headerOffset; i < psi.length; i += 4) {
      psi.programs.push({
        number: payload[i] << 8 | payload[i + 1],
        // reserved: (payload[i + 2] & 0b11100000) >> 5,
        pid: (payload[i + 2] & 0b00011111) << 8 | payload[i + 3]
      });
    }
  } else if (psi.tableId === 0x02) {
    psi.type = 'PMT';
    psi.streams = [];

    // 3 bits reserved (payload[headerOffset] & 0b11100000) >> 5
    psi.pcrPid = (payload[headerOffset] & 0b00011111) << 8 | payload[headerOffset + 1];
    // 4 bits reserved (payload[headerOffset + 2] & 0b11110000) >> 4
    psi.programInfoLength = (payload[headerOffset + 2] & 0b00001111) < 8 | payload[headerOffset + 3];

    psi.programInfo = payload.subarray(headerOffset + 4, headerOffset + 4 + psi.programInfoLength);

    headerOffset += 4 + psi.programInfoLength;

    for (let i = headerOffset; i < psi.length; i += 5) {
      const stream = {
        type: payload[i],
        // reserved: (payload[i + 1] & 0b11100000) >> 5,
        pid: (payload[i + 1] & 0b00011111) << 8 | payload[i + 2],
        // reserved = (payload[i + 3] & 0b11110000) >> 5,
        esInfo: null
      };
      const esInfoLength = (payload[i + 3] & 0b00001111) << 8 | payload[i + 4];

      if (esInfoLength) {
        stream.esInfo = payload.subarray(i + 5, i + 5 + esInfoLength);
      } else {
        stream.esInfo = new Uint8Array();
      }

      const {codec, type} = getStreamType(stream.type, stream.esInfo);

      stream.type = type;
      stream.codec = codec;

      i += esInfoLength;

      psi.streams.push(stream);
    }

    psi.payload = payload.subarray(psi.length);
  }

  return psi;
};

const parsePacket = function(packetBytes) {
  let headerSize = 4;

  // packetBytes[0] is syncword
  const packet = {
    error: !!((packetBytes[1] & 0b10000000) >> 7),
    payloadStart: !!((packetBytes[1] & 0b01000000) >> 6),
    priority: !!((packetBytes[1] & 0b00100000) >> 5),
    pid: ((packetBytes[1] & 0b00011111) << 8) | packetBytes[2],
    scrambling: (packetBytes[3] & 0b11000000) >> 6,
    adaptationField: (packetBytes[3] & 0b00110000) >>> 4,
    continuity: (packetBytes[3] & 0b00001111)
  };

  // we only have adaptation header if adaptationField is set to 2
  // or 3
  if (packet.adaptationField === 2 || packet.adaptationField === 3) {

    packet.adaptation = {
      length: packetBytes[4] + 1,
      discontinuity: !!(packetBytes[5] & 0x80),
      randomAccess: !!(packetBytes[5] & 0x40),
      esPriority: !!(packetBytes[5] & 0x20),
      pcrFlag: !!(packetBytes[5] & 0x10),
      opcrFlag: !!(packetBytes[5] & 0x08),
      splicingPoint: !!(packetBytes[5] & 0x04),
      transportPrivate: !!(packetBytes[5] & 0x02),
      adaptationExtension: !!(packetBytes[5] & 0x01)
    };

    headerSize += packet.adaptation.length;

    const extraBytes = packet.adaptation.length - 2;

    if (extraBytes > 0) {
      const key = !packet.adaptation.adaptationExtension ? 'stuffingBytes' : 'extensionBytes';

      packet.adaptation[key] = extraBytes;
    }
  }

  // we only have payload if adaptationField is 1 or 3
  if (packet.adaptationField === 1 || packet.adaptationField === 3) {
    packet.payload = packetBytes.subarray(headerSize);
  } else {
    packet.payload = new Uint8Array();
  }

  return packet;
};

export const walk = function(data, packetCallback, options = {}) {
  // default to walking forward.
  const forward = (typeof options.forward === 'boolean') ? options.forward : true;
  const defaultOffset = forward ? 0 : (data.length - 188);
  // start at 0 or data.length - 188
  let offset = (typeof options.offset === 'number') ? options.offset : defaultOffset;

  while ((forward ? (offset < data.length) : (offset > 0))) {
    // Look for a pair of start and end sync bytes in the data..
    if (!isInSync(data, offset)) {
      offset = forward ? (offset + 1) : (offset - 1);
      continue;
    }

    // make sure that the byte after this packet has a sync word
    // if the data ends before a sync word would start, that also counts.
    if (!isInSync(data[offset + 188]) && (data.length - offset) !== 188) {
      break;
    }

    const stop = packetCallback(parsePacket(data.subarray(offset, offset + 188)), offset);

    if (stop) {
      break;
    }

    offset = forward ? (offset + 188) : (offset - 188);
  }
};

export const parseFrames = function(data, {trackPids, pesOffset, lastPidFrames = {}}) {
  const frames = [];

  walk(data, function(packet, offset) {
    // skip non-pes packets
    // TODO: we should handle new streams that have been added
    if (!trackPids[packet.pid] || !packet.payload) {
      return;
    }

    // keyframe, duration, timestamp, data, trackNumber
    if (packet.payloadStart) {
      const pes = parsePES(packet);

      const frame = {
        keyframe: packet.adaptation && packet.adaptation.randomAccess,
        trackNumber: trackPids[packet.pid].track.number,
        timestamp: pes.pts,
        cts: pes.pts - pes.dts,
        dts: pes.dts,
        data: pes.data
      };

      if (lastPidFrames[packet.pid]) {
        // default current frame duration to last frame duration
        frame.duration = lastPidFrames[packet.pid].duration = frame.dts - lastPidFrames[packet.pid].dts;
        frames.push(frame);
      }

      lastPidFrames[packet.pid] = frame;
    } else {
      const frame = lastPidFrames[packet.pid];

      frame.data = concatTypedArrays(frame.data, packet.payload);
    }

  }, {offset: pesOffset});

  return {frames, lastPidFrames};
};

export const parseTracksAndInfo = function(data) {
  const trackPids = {};
  const programPids = {};
  let duration;
  let pesOffset = 0;
  const tracks = [];
  const durations = {};
  const firstPts = {};
  let inPes;

  walk(data, function(packet, offset) {

    if (trackPids[packet.pid]) {
      if (pesOffset === 0) {
        pesOffset = offset;
      }

      if (!firstPts[packet.pid] && packet.payloadStart) {
        firstPts[packet.pid] = parsePES(packet).pts;
      }

      return;
    }

    // nothing to process if a packet has no payload
    if (!packet.payload.length) {
      return;
    }

    if (!packet.payloadStart && inPes) {
      return;
    }

    // look for payloadStart and the packet start code prefix
    // to verify that a stream started with pes rather than pmt/pat
    if (packet.payloadStart && bytesMatch(packet.payload, PACKET_START_CODE_PREFIX)) {
      const pes = parsePES(packet);

      if (!trackPids[pes.streamId]) {
        // streamId 0xc0-0xdf = audio and 0xe0-0xef = 'video'
        const type = (pes.streamId >= 0xc0 && pes.streamId <= 0xDF) ? 'audio' : 'video';
        // const container = detectContainerForBytes(pes.data);
        let number = 0;

        if (type === 'audio' && pes.streamId & 0b11100000) {
          number = pes.streamId & 0b00011111;
        } else if (type === 'video' && pes.streamId & 0b11100000) {
          number = pes.streamId & 0b00001111;
        }

        // TODO: more dynamic check using pes.data..
        // TODO: include non-guess for timescale and info
        const track = {
          type,
          codec: (type === 'audio') ? 'aac' : 'avc1',
          number,
          timescale: 48000,
          info: type === 'video' ?
            {width: 426, height: 240, avcC} :
            {channels: 2, bitDepth: 16, sampleRate: 48000}
        };

        trackPids[pes.streamId] = {track};

        tracks.push(track);
      }

      inPes = true;
      return;
    }

    inPes = false;

    // TODO: we should do a better job differentiating PSI's here
    if (packet.pid <= 0x11 || programPids[packet.pid] !== -1) {
      const psi = parsePSI(packet);

      if (psi.type === 'PMT') {
        psi.streams.forEach(function(stream) {
          if (!trackPids[stream.pid]) {
            trackPids[stream.pid] = stream;
            stream.track = {
              number: tracks.length,
              type: stream.type,
              codec: stream.codec,
              timescale: 48000,
              // TODO:
              info: stream.type === 'video' ?
                {width: 426, height: 240, avcC} :
                {channels: 2, bitDepth: 16, sampleRate: 48000}
            };

            tracks.push(stream.track);
          }
        });
      } else if (psi.type === 'PAT') {
        psi.programs.forEach(function(program) {
          if (!programPids[program.pid]) {
            programPids[program.pid] = program;
          }
        });
      }
    }
  });

  // grab the pts of the last frame and add the duration to get the mpegts total duration.
  walk(data, function(packet) {
    if (!packet.payloadStart || !trackPids[packet.pid] || durations[packet.pid]) {
      return;
    }

    const pes = parsePES(packet);

    trackPids[packet.pid].track.duration = durations[packet.pid] = pes.pts - firstPts[packet.pid];

    if (!duration || durations[packet.pid] > duration) {
      duration = durations[packet.pid];
    }

    // if we have the last duration for each track stop looking
    if (Object.keys(trackPids) === Object.keys(durations)) {
      return true;
    }
  }, {forward: false});

  return {
    trackPids,
    programPids,
    pesOffset,
    tracks,
    info: {
      duration,
      timestampScale: 90000
    }
  };
};

