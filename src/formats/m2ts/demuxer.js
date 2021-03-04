/* eslint-disable no-console */
const {bytesMatch, concatTypedArrays} = require('@videojs/vhs-utils/cjs/byte-helpers.js');
const fs = require('fs');
const path = require('path');
const SYNC_BYTES = [0x47];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset});

// TODO: pass full pes frames to codec specific format demuxers
const data = fs.readFileSync(path.resolve(__dirname, 'test-video.ts'));

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
    psi: {
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
    }
  };

  // length starts counting after the length bytes
  // which does not include 5 header bytes... ok then
  let headerSize = 9;

  // TODO:
  // debugger;
  if (result.psi.tableId === 0x42) {
    result.type = 'SDT';
  } else if (result.psi.tableId === 0x00) {
    result.type = 'PAT';
    result.programs = [];

    for (let i = headerSize; i < result.psi.length; i += 4) {
      result.programs.push({
        number: payload[i] << 8 | payload[i + 1],
        // reserved: (payload[i + 2] & 0b11100000) >> 5,
        pid: (payload[i + 2] & 0b00011111) << 8 | payload[i + 3]
      });
    }
  } else if (result.psi.tableId === 0x02) {
    result.type = 'PMT';
    // 4 additional header bytes for pmt
    headerSize += 4;
    result.streams = [];

    for (let i = headerSize; i < result.psi.length; i += 5) {
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

    result.payload = payload.subarray(result.psi.length);
  }

  return result;
};

let offset = 0;
const packets = [];

const streamPids = [];
const pmtPids = [];
const frames = {};

while (offset < data.byteLength) {
  // Look for a pair of start and end sync bytes in the data..
  if (!isInSync(data, offset)) {
    offset += 1;
    continue;
  }

  if (!isInSync(data[offset + 188])) {
    break;
  }

  const packet = data.subarray(offset, offset + 188);
  let headerSize = 4;

  const parsed = {
    error: !!((packet[1] & 0b10000000) >> 7),
    payloadStart: !!((packet[1] & 0b01000000) >> 6),
    priority: !!((packet[1] & 0b00100000) >> 5),
    pid: ((packet[1] & 0b00011111) << 8) | packet[2],
    scrambling: (packet[3] & 0b11000000) >> 6,
    adaptationField: (packet[3] & 0b00110000) >>> 4,
    continuity: (packet[3] & 0b00001111)
  };

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

  if (parsed.adaptationField === 1 || parsed.adaptationField === 3) {
    const payload = packet.subarray(headerSize);

    if (parsed.pid <= 0x11 || pmtPids.indexOf(parsed.pid) !== -1) {
      Object.assign(parsed, parsePSI(payload));

      if (parsed.type === 'PMT') {
        parsed.streams.forEach(function({pid}) {
          if (streamPids.indexOf(pid) === -1) {
            streamPids.push(pid);
          }
        });
      } else if (parsed.type === 'PAT') {
        parsed.programs.forEach(function({pid}) {
          if (pmtPids.indexOf(pid) === -1) {
            pmtPids.push(pid);
          }
        });
      }
    } else if (streamPids.indexOf(parsed.pid) !== -1) {
      parsed.type = 'PES';
      const pidFrames = frames[parsed.pid] = frames[parsed.pid] || [];

      // keyframe, duration, timestamp, data, trackNumber
      if (parsed.payloadStart) {
        const frame = parsePes(payload);

        frame.dtsSeconds = (frame.dts / 90000);
        frame.timestamp = (frame.pts / 90000);
        frame.offset = frame.data.byteOffset;

        pidFrames.push(frame);
      } else {
        const frame = pidFrames[pidFrames.length - 1];

        frame.data = concatTypedArrays(frame.data, payload);
      }

    }
  }

  packets.push(parsed);
  offset += 188;
}

const jframes = frames[256].map((f) => {
  f.data = f.data.length;

  return f;
});

console.log(JSON.stringify(jframes, null, 2));
// console.log(`There are ${frames.length} frames`);
