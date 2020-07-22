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
  input: 'src/mux-worker.js',
  output: {
    format: 'iife',
    name: 'muxWorker',
    file: 'src/mux-worker.worker.js'
  },
  external: []
}));

files.forEach(function(formatDir) {
  builds.push(config.makeBuild('module', {
    input: path.relative(BASE_DIR, path.join(FORMATS_BASE_DIR, formatDir, 'index.js')),
    output: {
      format: 'cjs',
      name: formatDir,
      file: `dist/formats/${formatDir}.js`
    },
    external: (id) => (/^@videojs\/vhs-utils/).test(id)
  }));
});

// export the builds to rollup
export default builds;
