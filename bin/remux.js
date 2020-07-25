#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const TransmuxController = require('../dist/transmux-controller.js');
const baseDir = path.join(__dirname, '..');
const transmuxController = new TransmuxController({
  allowPassthrough: false
});

const readStream = fs.createReadStream(path.join(baseDir, 'oceans.webm'));
const writeStream = fs.createWriteStream(path.join(baseDir, 'test-remux.webm'));

transmuxController.on('data', function(e) {
  writeStream.write(e.detail.data);
});

transmuxController.on('done', function() {
  writeStream.end();
});

transmuxController.on('format', function(e) {
  const output = Object.assign({}, e.detail.format, {
    canPlay: true,
    type: 'muxed'
  });

  // init with the same exact format
  transmuxController.init([output, {canPlay: true}]);
});

readStream.on('data', function(chunk) {
  transmuxController.push(chunk);
});

readStream.on('end', function() {
  transmuxController.flush();
});
