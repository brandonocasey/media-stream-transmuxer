const fs = require('fs');
const path = require('path');
const {parseTracksAndInfo, parseFrames} = require('./cjs/formats/m2ts/demux-helpers.js');

const data = fs.readFileSync(path.resolve(__dirname, 'src', 'formats', 'm2ts', 'test-video.ts'));

const options = parseTracksAndInfo(data);
const frames = parseFrames(data, options);

console.log(JSON.stringify(frames.map((f) => {
  f.data = f.data.byteLength;
  return f;
}), null, 2));
