#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const TransmuxController = require('../dist/transmux-controller.js');
const baseDir = path.join(__dirname, '..');
const transmuxController = new TransmuxController({
  allowPassthrough: false
});

const readStream = fs.createReadStream(path.join(baseDir, 'oceans2.mp4'));
const writeStream = fs.createWriteStream(path.join(baseDir, 'test-remux.webm'));

transmuxController.on('data', function(e) {
  writeStream.write(e.detail.data);
});

transmuxController.on('done', function() {
  writeStream.end();
});

transmuxController.on('potential-formats', function(e) {
  transmuxController.init(e.detail.formats[2]);
});

readStream.on('data', function(chunk) {
  transmuxController.push(chunk);
});

readStream.on('end', function() {
  transmuxController.flush();
});
