#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const TransmuxController = require('../dist/transmux-controller.js');
const baseDir = path.join(__dirname, '..');
const transmuxController = new TransmuxController({
  allowPassthrough: false
});

const readStream = fs.createReadStream(path.join(baseDir, 'oceans.mp4'));

transmuxController.on('potential-formats', function(event) {
  console.log(event.detail.formats);
  const format = event.detail.formats[6];
  console.log(format);
  const fileName = path.join(baseDir, `test-remux.${format.container}`);
  const writeStream = fs.createWriteStream(fileName);

  transmuxController.on('data', function(e) {
    writeStream.write(e.detail.data);
  });

  transmuxController.on('done', function() {
    writeStream.end();
    console.log(`Wrote ${fileName}`);
  });
  transmuxController.init(format);
});

readStream.on('data', function(chunk) {
  transmuxController.push(chunk);
});

readStream.on('end', function() {
  transmuxController.flush();
});
