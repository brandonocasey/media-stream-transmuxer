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

//const readStream = fs.createReadStream(file);

transmuxController.on('potential-formats', function(event) {
  const format = event.detail.formats[2];

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

transmuxController.push(fs.readFileSync(file))

/*,
readStream.on('data', function(chunk) {
  transmuxController.push(chunk);
});

readStream.on('end', function() {
  transmuxController.flush();
});*/
