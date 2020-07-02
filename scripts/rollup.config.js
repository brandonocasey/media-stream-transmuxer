const generate = require('videojs-generate-rollup-config');
const worker = require('./create-worker.js');

// see https://github.com/videojs/videojs-generate-rollup-config
// for options
const options = {
  input: 'src/index.js',
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

const build = config.makeBuild('browser', {
  input: 'src/mux-worker.js',
  output: {
    format: 'iife',
    name: 'muxWorker',
    file: 'src/mux-worker.worker.js'
  },
  external: []
});

// Add additonal builds/customization here!

// export the builds to rollup
export default [build].concat(Object.values(config.builds));
