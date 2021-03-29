#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const {spawnSync} = require('child_process');
const inspectPath = path.join(__dirname, 'inspect.js');

if (!process.argv[2]) {
  console.error('./compare-ffprobe <media-file>');
  process.exit(1);
}

const spawnToJSON = function(cmd, args) {
  let stdout;

  try {
    const result = spawnSync(cmd, args, {maxBuffer: 1024 * 1024 * 1024, encoding: 'utf8'});

    stdout = result.stdout;

    return JSON.parse(stdout);
  } catch (e) {
    console.error(e);
    console.error(stdout);
    process.exit(1);
  }
};

const runFfprobe = function(file) {
  return spawnToJSON('ffprobe', [
    '-hide_banner',
    '-v', 'error',
    '-print_format', 'json',
    '-show_streams',
    '-show_frames',
    file
  ]);
};

const runInspect = function(file) {
  return spawnToJSON(inspectPath, [file]);
};

const file = path.resolve(process.cwd(), process.argv[2]);
const ffprobe = runFfprobe(file);
const inspect = runInspect(file);

const issues = [];

if (ffprobe.frames.length !== inspect.frames.length) {
  issues.push(`ffprobe has ${ffprobe.frames.length} frames, demuxer has ${inspect.frames.length}`);
} else {
  ffprobe.frames.forEach(function(f, i) {
    const keyframe = f.key_frame === 1;

    if (keyframe !== !!inspect.frames[i].keyframe) {
      issues.push(`ffprobe has frame ${i} keyframe ${keyframe} and we do not`);
    }
  });
}

if (ffprobe.streams.length !== inspect.tracks.length) {
  issues.push(`ffprobe has ${ffprobe.streams.length} tracks, demuxer has ${inspect.tracks.length}`);
} else {
  ffprobe.streams.forEach(function(stream) {
    let match;

    for (let i = 0; i < inspect.tracks.length; i++) {
      if (inspect.tracks[i].type === stream.codec_type) {
        match = inspect.tracks[i];
        break;
      }
    }

    if (!match) {
      issues.push(`no track match for type ${stream.codec_type}`);
      return;
    }

    if (match.type === 'video') {
      if (match.info.width !== stream.width) {
        issues.push(`ffprobe width ${stream.width} does not match ${match.info.width}`);
      }

      if (match.info.height !== stream.height) {
        issues.push(`ffprobe height ${stream.height} does not match ${match.info.height}`);
      }
    }

    const timescale = parseInt((stream.codec_time_base || stream.time_base).split('/')[1], 10);

    if (match.timescale !== timescale) {
      issues.push(`ffprobe timescale ${timescale} does not match ${match.timescale}`);
    }
  });
}

if (issues.length) {
  console.error('ISSUES:');

  issues.forEach((issue) => console.error(`* ${issue}`));
} else {
  console.log('no issues between ffprobe and our demuxer!');
}
