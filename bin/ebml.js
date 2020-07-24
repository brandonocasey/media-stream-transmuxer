#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ebml = require('../dist/formats/ebml.js');
const {concatTypedArrays} = require('@videojs/vhs-utils/dist/byte-helpers.js');
const baseDir = path.join(__dirname, '..');

const remux = function(bytes, distfile) {
  const demuxer = new ebml.Demuxer();
  const muxer = new ebml.Muxer();
  let allData;

  demuxer.pipe(muxer);

  muxer.on('data', function(e) {
    allData = concatTypedArrays(allData, e.detail.data);
  });

  muxer.on('done', function(e) {
    fs.writeFileSync(distfile, allData);
  });

  demuxer.push(bytes);
  demuxer.flush();
};

// TODO: do it with streaming data
remux(
  fs.readFileSync(path.join(baseDir, 'oceans.webm')),
  path.join(baseDir, 'test-remux.webm')
);

