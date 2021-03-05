/* eslint-disable no-console */
import {bytesMatch, concatTypedArrays} from '@videojs/vhs-utils/cjs/byte-helpers.js';
import {TimeObject} from '../../time-scale.js';

const SYNC_BYTES = [0x47];

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

const parsePes = function(payload) {
  if (bytesMatch([0x00, 0x00, 0x01], payload)) {
    return null;
  }

  let result = {
    streamId: payload[3],
    // if set to zero it can be any length,
    // can only be zero for video.
    length: payload[4] << 8 | payload[5]
  };

  // no pes header for:
  // padding stream (0xBE)
  // private stream 2 (0xBF)
  // pes header marker bit not set, first two bits are 0b10
  if (result.streamId === 0xBE || result.streamId === 0xBF || ((payload[6] & 0b11000000) >> 6) !== 0b10) {
    return result;
  }

  result = Object.assign(result, {
    scrambling: (payload[6] & 0b00110000) >> 4,
    priority: (payload[6] & 0b00001000) >> 3,
    // pes followwwwed by video/audio syncord
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

  result.headerData = payload.subarray(offset, result.headerLength);
  result.data = payload.subarray(offset + result.headerLength);

  // http://dvd.sourceforge.net/dvdinfo/pes-hdr.html
  // 0b10 is pts only
  // 0b11 is pts followed by dts
  if (result.ptsdts === 0b10 && result.headerLength >= 5) {
    result.pts = result.dts = parsePtsdts(payload.subarray(offset));
    offset += 5;
  } else if (result.ptsdts === 0b11 && result.headerLength >= 10) {
    result.pts = parsePtsdts(payload.subarray(offset));
    result.dts = parsePtsdts(payload.subarray(offset + 5));
    offset += 10;
  }

  // TODO: do we need to parse escr, esRate, crc, or extension data?

  return result;
};

const parsePSI = function(payload) {
  // TODO: pointer
  const result = {
    pointer: payload[0],
    tableId: payload[1],
    syntax: (payload[2] & 0b10000000) >> 7,
    // reserved: (payload[2] & 0b01110000) >> 4,
    length: ((payload[2] & 0b00001111) << 8) | payload[3],
    streamId: payload[4] << 8 | payload[5],
    // reserved: payload[6] & 0b11000000 >> 6,
    version: payload[6] & 0b00111110 >> 1,
    current: payload[6] & 0b00000001,
    section: payload[7],
    lastSection: payload[8]
  };

  // length starts counting after the length bytes
  // which does not include 5 header bytes... ok then
  let headerSize = 9;

  // TODO:
  if (result.tableId === 0x42) {
    result.type = 'SDT';
  } else if (result.tableId === 0x00) {
    result.type = 'PAT';
    result.programs = [];

    for (let i = headerSize; i < result.length; i += 4) {
      result.programs.push({
        number: payload[i] << 8 | payload[i + 1],
        // reserved: (payload[i + 2] & 0b11100000) >> 5,
        pid: (payload[i + 2] & 0b00011111) << 8 | payload[i + 3]
      });
    }
  } else if (result.tableId === 0x02) {
    result.type = 'PMT';
    // 4 additional header bytes for pmt
    headerSize += 4;
    result.streams = [];

    for (let i = headerSize; i < result.length; i += 5) {
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
      }

      i += esInfoLength;

      result.streams.push(stream);
    }

    result.payload = payload.subarray(result.length);
  }

  return result;
};

const parsePacket = function(packet) {
  let headerSize = 4;

  // packet[0] is syncword
  const parsed = {
    error: !!((packet[1] & 0b10000000) >> 7),
    payloadStart: !!((packet[1] & 0b01000000) >> 6),
    priority: !!((packet[1] & 0b00100000) >> 5),
    pid: ((packet[1] & 0b00011111) << 8) | packet[2],
    scrambling: (packet[3] & 0b11000000) >> 6,
    adaptationField: (packet[3] & 0b00110000) >>> 4,
    continuity: (packet[3] & 0b00001111)
  };

  // we only have adaptation header if adaptationField is set to 2
  // or 3
  if (parsed.adaptationField === 2 || parsed.adaptationField === 3) {
    headerSize += packet[4] + 1;

    parsed.adaptation = {
      discontinuity: !!(packet[5] & 0x80),
      randomAccess: !!(packet[5] & 0x40),
      esPriority: !!(packet[5] & 0x20),
      pcrFlag: !!(packet[5] & 0x10),
      opcrFlag: !!(packet[5] & 0x08),
      splicingPoint: !!(packet[5] & 0x04),
      transportPrivate: !!(packet[5] & 0x02),
      adaptationExtension: !!(packet[5] & 0x01)
    };
  }

  // we only have payload if adaptationField is 1 or 3
  if (parsed.adaptationField === 1 || parsed.adaptationField === 3) {
    parsed.payload = packet.subarray(headerSize);
  } else {
    parsed.payload = new Uint8Array();
  }

  return parsed;
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

    // find the start and end of a packet, for the final packet
    // we will not have an end syncword
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

export const parseFrames = function(data, streamPids, pesOffset) {
  const pidFrameList = {};
  const frames = [];
  const timestamps = {};

  walk(data, function(packet, offset) {
    // skip non-pes packets
    // TODO: should we skip packets without a payload??
    // TODO: handle new streams that have been added
    if (streamPids.indexOf(packet.pid) === -1) {
      return;
    }

    timestamps[packet.pid] = timestamps[packet.pid] || 0;
    const pidFrames = pidFrameList[packet.pid] = pidFrameList[packet.pid] || [];

    // keyframe, duration, timestamp, data, trackNumber
    if (packet.payloadStart) {
      const pes = parsePes(packet.payload);

      timestamps[packet.pid] += (pes.pts / 90000);

      const frame = {
        keyframe: packet.adaptation && packet.adaptation.randomAccess,
        trackNumber: packet.pid,
        timestamp: timestamps[packet.pid],
        // pts: pes.pts,
        // dts: pes.dts,
        data: pes.data
      };

      if (pidFrames.length) {
        const prevFrame = pidFrames[pidFrames.length - 1];

        prevFrame.duration = frame.timestamp - prevFrame.timestamp;
      }

      pidFrames[packet.pid] = pidFrames[packet.pid] || [];
      pidFrames[packet.pid].push(frame);
      frames.push(frame);
    } else {
      const frame = pidFrames[pidFrames.length - 1];

      frame.data = concatTypedArrays(frame.data, packet.payload);
    }

  }, {offset: pesOffset});

  return frames;
};

export const parseTrackAndInfo = function(data) {
  const streamPids = [];
  const pmtPids = [];
  let pesOffset = 0;
  const tracks = [];

  walk(data, function(packet, offset) {
    if (streamPids.indexOf(packet.pid) !== -1) {
      pesOffset = offset;
      // we hit a pes packet, stop looking for tracks.
      return true;
    }

    // nothing to process if a packet has no payload
    if (!packet.payload.length) {
      return;
    }

    if (packet.pid <= 0x11 || pmtPids.indexOf(packet.pid) !== -1) {
      const psi = parsePSI(packet.payload);

      if (psi.type === 'PMT') {
        psi.streams.forEach(function({pid}) {
          if (streamPids.indexOf(pid) === -1) {
            streamPids.push(pid);
          }
        });
      } else if (psi.type === 'PAT') {
        psi.programs.forEach(function({pid}) {
          if (pmtPids.indexOf(pid) === -1) {
            pmtPids.push(pid);
          }
        });
      }
    }
  });

  // grab the pts of the last frame and add the duration to get the mpegts total duration.
  walk(data, function(parsedPacket) {
    // once we hit the final pes for each track
    // return true to stop

  }, {forward: false});

  return {
    streamPids,
    pmtPids,
    pesOffset,
    tracks,
    duration: 0,
    timestampScale: new TimeObject(1 / 90000, 's')
  };
};

