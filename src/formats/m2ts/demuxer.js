/* eslint-disable no-console */
const {bytesMatch, concatTypedArrays} = require('@videojs/vhs-utils/cjs/byte-helpers.js');
const fs = require('fs');
const path = require('path');
const SYNC_BYTES = [0x47];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset});

// TODO: pass full pes frames to codec specific format demuxers
const data = fs.readFileSync(path.resolve(__dirname, 'test-video.ts'));

let offset = 0;
const packets = [];

const streamPids = [];
const pmtPids = [];
const frames = {};

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
        const frame = {
          trackNumber: parsed.pid,
          timestamp: 0,
          duration: 0,
          // dataAlignmentInicator
          keyframe: Boolean(payload[6] & 0x04)
        };

        // TODO: parse pts/dts using flags
        // if (payload[7] & 0xC0) {

        // }

        frame.data = payload.subarray(9 + payload[8]);
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
