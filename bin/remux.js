#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const TransmuxController = require('../cjs/mux-worker/transmux-controller.js');
const baseDir = path.join(__dirname, '..');
const transmuxController = new TransmuxController({
  allowPassthrough: false
});
const file = path.resolve(process.cwd(), process.argv[2]);

// TODO: cli for streaming vs sync read/write
// TODO: cli for format choosing

// const readStream = fs.createReadStream(file);

transmuxController.on('input-format', function(event) {
  console.log(`Demuxing format ${JSON.stringify(event.detail.format)}`);
});

transmuxController.on('unsupported', function(event) {
  console.error(event.detail.reason);
  process.exit(1);
});

transmuxController.on('potential-formats', function(event) {
  const format = event.detail.formats[1];

  console.log(`Muxing to format ${JSON.stringify(format.mimetypes)}`);
  const fileName = path.join(baseDir, `test-remux.${format.container}`);
  const writeStream = fs.createWriteStream(fileName);

  transmuxController.on('data', function(e) {
    writeStream.write(e.detail.data);
  });

  transmuxController.on('done', function() {
    // writeStream.end();
    console.log(`Wrote ${fileName}`);
    // process.exit();
  });
  transmuxController.init(format);
});

transmuxController.push(fs.readFileSync(file));
transmuxController.flush();

/* ,
readStream.on('data', function(chunk) {
  transmuxController.push(chunk);
});

readStream.on('end', function() {
  transmuxController.flush();
});*/
