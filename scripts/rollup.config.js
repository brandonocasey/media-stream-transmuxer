const generate = require('videojs-generate-rollup-config');
const worker = require('./create-worker.js');
const path = require('path');
const fs = require('fs');
const BASE_DIR = path.join(__dirname, '..');
const FORMATS_BASE_DIR = path.join(BASE_DIR, 'src', 'formats');

const files = fs.readdirSync(FORMATS_BASE_DIR);

// see https://github.com/videojs/videojs-generate-rollup-config
// for options
const options = {
  input: 'src/index.js',
  exportName: 'XhrStreamer',
  primedPlugins(defaults) {
    defaults.worker = worker();

    return defaults;
  },
  plugins(defaults) {
    defaults.module.splice(2, 0, 'worker');
    defaults.browser.splice(2, 0, 'worker');
    defaults.test.splice(3, 0, 'worker');

    return defaults;
  }
};

const config = generate(options);
const builds = Object.values(config.builds);

// worker needs to be built before others
builds.unshift(config.makeBuild('browser', {
  input: 'src/mux-worker/index.js',
  output: {
    format: 'iife',
    name: 'muxWorker',
    file: 'dist/mux-worker.worker.js'
  },
  external: []
}));

files.forEach(function(formatDir) {
  const inputDir = path.relative(BASE_DIR, path.join(FORMATS_BASE_DIR, formatDir));
  const input = path.join(inputDir, 'index.js');

  if (!fs.statSync(inputDir).isDirectory() || !fs.statSync(input).isFile()) {
    return;
  }

  builds.push(config.makeBuild('module', {
    input,
    output: {
      format: 'cjs',
      name: formatDir,
      file: `dist/formats/${formatDir}.js`
    },
    external: (id) => (/^@videojs\/vhs-utils|@babel\/runtime/).test(id)
  }));
});

builds.push(config.makeBuild('module', {
  input: path.join(BASE_DIR, 'src', 'mux-worker', 'transmux-controller.js'),
  output: {
    format: 'cjs',
    name: 'transmuxController',
    file: 'dist/transmux-controller.js'
  },
  external: (id) => (/^@videojs\/vhs-utils|@babel\/runtime/).test(id)
}));

// export the builds to rollup
export default builds;
