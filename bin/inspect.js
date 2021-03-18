#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const Formats = require('../cjs/formats/index.js');
const {detectContainerForBytes} = require('@videojs/vhs-utils/cjs/containers');

// TODO: read streams??
const file = path.resolve(process.cwd(), process.argv[2]);

const data = fs.readFileSync(file);
const container = detectContainerForBytes(data);

if (!container) {
  console.error(`cannot demux and inspect ${file}`);
  process.exit(1);
}

let format;

for (let i = 0; i < Formats.length; i++) {
  format = Formats[i];

  if (format.containerMatch(container)) {
    break;
  }
}

if (!format) {
  console.error(`container ${container} is currently not demux-able`);
  process.exit(1);
}

const initData = format.Demuxer.probe(data);

if (!initData || !initData.tracks || !initData.tracks.length) {
  console.error(`container ${container} contains no tracks to inspect!`);
  process.exit(1);
}

const demuxer = new format.Demuxer(initData);

const parsed = {};

demuxer.on('data', function(event) {
  const eData = event.detail.data;

  if (eData.tracks) {
    parsed.tracks = eData.tracks;
  }
  if (eData.info) {
    parsed.info = eData.info;
  }

  if (eData.frames) {
    const fixedFrames = eData.frames.map((f) => {
      return Object.assign({}, f, {
        data: {offset: f.data.byteOffset, length: f.data.byteLength}
      });
    });

    parsed.frames = (parsed.frames || []).concat(fixedFrames);
  }

});

demuxer.on('done', function() {

  parsed.tracks.forEach(function(track) {
    if (track.frameTable) {
      delete track.frameTable;
    }

    if (track.bytes) {
      delete track.bytes;
    }
  });
  console.log(JSON.stringify(parsed, null, 2));
  process.exit();
});

demuxer.push(data);
demuxer.flush();
