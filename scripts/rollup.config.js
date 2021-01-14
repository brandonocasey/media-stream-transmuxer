const generate = require('videojs-generate-rollup-config');
const worker = require('./create-worker.js');

// see https://github.com/videojs/videojs-generate-rollup-config
// for options
const options = {
  input: 'src/index.js',
  exportName: 'MediaStreamTransmuxer',
  primedPlugins(defaults) {
    defaults.worker = worker();

    return defaults;
  },
  plugins(defaults) {
    defaults.module.splice(2, 0, 'worker');
    defaults.browser.splice(2, 0, 'worker');
    defaults.test.splice(3, 0, 'worker');

    // istanbul is only in the list for regular builds and not watch
    if (defaults.test.indexOf('istanbul') !== -1) {
      defaults.test.splice(defaults.test.indexOf('istanbul'), 1);
    }

    return defaults;
  }
};

const config = generate(options);

if (config.builds.module) {
  delete config.builds.module;
}

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

// export the builds to rollup
export default builds;
