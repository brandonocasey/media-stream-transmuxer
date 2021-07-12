#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const helpers = require('../cjs/formats/m2ts/demux-helpers.js');
const {toHexString, isTypedArray} = require('@videojs/vhs-utils/cjs/byte-helpers.js');

const file = path.resolve(process.cwd(), process.argv[2]);
const data = fs.readFileSync(file);

const formatLines = (str) =>
  str.split('\n').map((s) => `  ${s}`).join('\n');

const hrHex = function(array) {
  let str = '';

  array.forEach(function(byte, i) {
    if (str && !(/\n$/).test(str)) {
      str += ' ';
    }

    str += `0x${toHexString(byte).toUpperCase()}`;

    if (((i + 1) % 15) === 0 && array.length - 1 !== i) {
      str += '\n';
    }
  });

  return str;
};

const hrObject = function(object) {
  let str = '';
  const keys = Object.keys(object);

  keys.forEach(function(key, i) {
    if (str && !(/\n$/).test(str)) {
      str += ' ';
    }
    let value = object[key];

    if (isTypedArray(value)) {
      value = `${value.byteLength} bytes`;
    } else if (typeof value === 'object') {
      value = hrObject(value);
    }

    str += `${key.toUpperCase()}: ${value}`;

    if (((i + 1) % 4) === 0 && keys.length - 1 !== i) {
      str += '\n';
    }

  });

  return str;
};

let i = 1;

helpers.walk(data, function(packet) {
  const payload = packet.payload;
  const adaptation = packet.adaptation;

  delete packet.payload;
  delete packet.adaptation;

  console.log(`* Packet ${i}`);
  console.log('  --- Packet Header ---');
  console.log(formatLines(hrObject(packet)));

  if (adaptation) {
    console.log(' --- Adapatation ---');
    console.log(formatLines(hrObject(adaptation)));
  }

  packet.adaptation = adaptation;
  packet.payload = payload;

  if (i <= 2) {
    const psi = helpers.parsePSI(packet);

    console.log('  --- PSI Header ----');
    const programs = psi.programs;
    const streams = psi.streams;

    delete psi.programs;
    delete psi.streams;

    console.log(formatLines(hrObject(psi)));
    if (programs) {
      console.log('  --- Programs ---');
      programs.forEach((p) => {
        console.log(formatLines(hrObject(p)));
      });
    } else if (streams) {
      console.log('  --- Streams ---');
      streams.forEach((s) => {
        console.log(formatLines(hrObject(s)));
      });
    }

  } else if (packet.payloadStart) {
    const pes = helpers.parsePES(packet);
    const pesData = pes.data;

    delete pes.data;

    console.log('  --- PES Header ----');
    console.log(formatLines(hrObject(pes)));

    console.log(`  ---- PES Data (${pesData.length})----`);
    console.log(formatLines(hrHex(pesData)));
  } else if (payload) {
    console.log(`  ---- Packet Payload (${payload.length}) ----`);
    console.log(formatLines(hrHex(payload)));
  }

  console.log('\n');

  i++;
});
