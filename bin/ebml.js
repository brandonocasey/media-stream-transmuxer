#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ebml = require('../dist/formats/ebml.js');

const remux = function(bytes) {
  const demuxed = ebml.demux(bytes);
  const remuxed = ebml.mux(demuxed);

  return remuxed;
};

// TODO: do it with streaming data
const newdata = remux(fs.readFileSync(path.join(__dirname, '..', 'oceans.webm')));

fs.writeFileSync(path.join(__dirname, '..', 'test-ebml-remux.webm'), newdata);
