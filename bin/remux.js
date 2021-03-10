#!/usr/bin/env node

/* eslint-disable no-console */
const {version} = require('../package.json');
const fs = require('fs');
const path = require('path');
const TransmuxController = require('../cjs/mux-worker/transmux-controller.js');
const {concatTypedArrays} = require('@videojs/vhs-utils/cjs/byte-helpers');

const showHelp = function() {
  console.log(`
  remux media-file -f 0 > foo.mp4
  remux media-file -f 0 -o foo.mp4
  curl -s 'some-media-ulr' | remux.js -f 0 -o foo
  wget -O - -o /dev/null 'some-media-url' | remux -f 0 -o foo

  transmux a supported segment (ts or adts) info an fmp4

  -h, --help                 print help
  -v, --version              print the version
  -o, --output    <string>   write to a file instead of stdout
  -s, --sync                 synchrnous read
  -f, --format    <number>   Format to transmux to. defaults to 0
  -l, --list                 List potential remux formats and exit
  -p, --passthrough          Allow passthrough remux as a target
  -V, --verbose              Verbose output during remuxing
`);
};

const parseArgs = function(args) {
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((/^--version|-v$/).test(arg)) {
      console.log(`remux v${version}`);
      process.exit(0);
    } else if ((/^--help|-h$/).test(arg)) {
      showHelp();
      process.exit(0);
    } else if ((/^--sync|-s$/).test(arg)) {
      options.sync = true;
    } else if ((/^--list|-l$/).test(arg)) {
      options.list = true;
    } else if ((/^--list|-l$/).test(arg)) {
      options.passthrough = true;
    } else if ((/^--verbose|-V$/).test(arg)) {
      options.verbose = true;
    } else if ((/^--output|-o$/).test(arg)) {
      i++;
      options.output = args[i];
    } else if ((/^--format|-f$/).test(arg)) {
      i++;
      options.format = parseInt(args[i], 10);
    } else {
      options.file = arg;
    }
  }

  return options;
};

const cli = function(stdin) {
  const options = Object.assign({
    passthrough: false,
    list: false,
    sync: false,
    format: 0,
    verbose: false
  }, parseArgs(process.argv.slice(2)));
  let inputStream;
  let outputStream;

  const verbose = (...args) => {
    if (options.verbose) {
      return console.log.apply(null, args);
    }
  };

  // if stdin was provided
  if (stdin && options.file) {
    console.error(`You cannot pass in a file ${options.file} and pipe from stdin!`);
    process.exit(1);
  }

  if (stdin) {
    inputStream = process.stdin;
  } else if (options.file) {
    inputStream = fs.createReadStream(path.resolve(options.file));
  }

  if (!inputStream) {
    console.error('A file or stdin must be passed in as an argument or via pipeing to this script!');
    process.exit(1);
  }

  if (options.output) {
    outputStream = fs.createWriteStream(path.resolve(options.output), {
      encoding: null
    });
  } else {
    outputStream = process.stdout;
  }

  process.exit();

  return new Promise(function(resolve, reject) {

    const transmuxController = new TransmuxController({
      allowPassthrough: options.passthrough
    });

    transmuxController.on('input-format', function(event) {
      verbose(`Demuxing format ${JSON.stringify(event.detail.format)}`);
    });

    transmuxController.on('unsupported', function(event) {
      console.error(event.detail.reason);
      process.exit(1);
    });

    transmuxController.on('potential-formats', function(event) {
      if (options.list) {
        console.log('Potentail formats: ');
        event.detail.formats.forEach(function(f, index) {
          console.log(`${index} - ${JSON.stringify(f.mimetypes)}`);
        });
        process.exit();
      }
      const format = event.detail.formats[options.format];

      verbose(`Muxing to format ${JSON.stringify(format.mimetypes)}`);

      transmuxController.on('data', function(e) {
        outputStream.write(e.detail.data);
      });

      transmuxController.on('done', function(e) {
        verbose('emitted:', e.detail.data);
        outputStream.end();
      });
      transmuxController.init(format);
    });

    let allData;

    inputStream.on('data', (chunk) => {
      if (options.sync) {
        allData = concatTypedArrays(allData, chunk);
      } else {
        transmuxController.push(chunk);
      }
    });
    inputStream.on('error', reject);

    inputStream.on('close', () => {
      if (options.sync) {
        transmuxController.push(allData);
      }
      transmuxController.flush();
    });

  }).catch(function(e) {
    console.error(e);
    process.exit(1);
  });
};

// no stdin if isTTY is set
cli(!process.stdin.isTTY ? process.stdin : null);
