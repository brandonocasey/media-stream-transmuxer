/* eslint-disable no-console */
const ffprobe = require('./ffprobe.json').frames;
const demuxer = require('./demuxer.json');

const issues = [];

if (ffprobe.length !== demuxer.length) {
  issues.push('cannot compare ffprobe to demuxer, number of frames differ');
} else {
  ffprobe.forEach(function(f, i) {
    if (f.key_frame === 1 && !demuxer[i].keyframe) {
      issues.push(`ffprobe has frame ${i} as keyframe and we do not`);
    }
  });
}

if (issues.length) {
  issues.forEach(console.error);
} else {
  console.log('no issues between ffprobe and our demuxer!');
}
