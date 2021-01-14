/* eslint-disable no-console */
const {bytesMatch} = require('@videojs/vhs-utils/es/byte-helpers.js');
const fs = require('fs');
const path = require('path');
const SYNC_BYTES = [0x47];
const isInSync = (d, offset) => bytesMatch(d, SYNC_BYTES, {offset});

// TODO: pass full pes frames to codec specific format demuxers
const data = fs.readFileSync(path.resolve(__dirname, 'test.ts'));

/*
const parsePmt = function(packet) {
  const isNotForward = packet[5] & 0x01;

  // ignore forward pmt delarations
  if (!isNotForward) {
    return;
  }
  const pmt = {};

  const sectionLength = (packet[1] & 0x0f) << 8 | packet[2];
  const tableEnd = 3 + sectionLength - 4;
  const programInfoLength = (packet[10] & 0x0f) << 8 | packet[11];
  let offset = 12 + programInfoLength;

  while (offset < tableEnd) {
    // add an entry that maps the elementary_pid to the stream_type
    const i = offset;
    const type = packet[i];
    const esPid = (packet[i + 1] & 0x1F) << 8 | packet[i + 2];
    const esLength = ((packet[i + 3] & 0x0f) << 8 | (packet[i + 4]));
    const esInfo = packet.subarray(i + 5, i + 5 + esLength);
    const stream = pmt[esPid] = {
      esInfo,
      typeNumber: type,
      type: '',
      codec: ''
    };

    if (type === 0x06 && bytesMatch(esInfo, [0x4F, 0x70, 0x75, 0x73], {offset: 2})) {
      stream.type = 'audio';
      stream.codec = 'opus';
    } else if (type === 0x1B || type === 0x20) {
      stream.type = 'video';
      stream.codec = 'avc1';
    } else if (type === 0x24) {
      stream.type = 'video';
      stream.codec = 'hev1';
    } else if (type === 0x10) {
      stream.type = 'video';
      stream.codec = 'mp4v.20';
    } else if (type === 0x0F) {
      stream.type = 'audio';
      stream.codec = 'aac';
    } else if (type === 0x81) {
      stream.type = 'audio';
      stream.codec = 'ac-3';
    } else if (type === 0x87) {
      stream.type = 'audio';
      stream.codec = 'ec-3';
    } else if (type === 0x03 || type === 0x04) {
      stream.type = 'audio';
      stream.codec = 'mp3';
    }

    offset += esLength + 5;
  }

  return pmt;
};
*/

let offset = 0;
const packets = [];

const streamPids = [];
const pmtPids = [];

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
      parsed.payload = payload;
    }
  }

  packets.push(parsed);
  offset += 188;
}

console.log(JSON.stringify(packets.map((p) => {
  if (p.payload) {
    p.payload = p.payload.byteLength;
  }
  return p;
}), null, 2));
