/* eslint-disable no-console */
const ffprobe = require('../ffprobe.json').frames;
const inspect = require('../inspect.json').frames;

const issues = [];

if (ffprobe.length !== inspect.length) {
  issues.push('cannot compare ffprobe to demuxer, number of frames differ');
} else {
  ffprobe.forEach(function(f, i) {
    if (f.key_frame === 1 && !inspect[i].keyframe) {
      issues.push(`ffprobe has frame ${i} as keyframe and we do not`);
    }
  });
}

if (issues.length) {
  issues.forEach(console.error);
} else {
  console.log('no issues between ffprobe and our demuxer!');
}
