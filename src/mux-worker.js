/* eslint-disable no-console */
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import {parseFormatForBytes} from '@videojs/vhs-utils/dist/format-parser';
import EbmlTransmuxer from './formats/ebml/index.js';

const muxableContainers = ['mp4', 'webm'];

const mimetypePermutations = function(format, mimetypes) {
  // from mp4/webm/mkv
  return Object.keys(mimetypes).reduce((acc, type) => {
    const mimetype = mimetypes[type];

    acc.push({type, mimetype});

    // TODO: transmuxers should provide their mimetype
    muxableContainers.forEach((container) => {
      if (mimetype.indexOf(container) === -1) {
        acc.push({type, mimetype: mimetype.replace(format.container, container)});
      }
    });

    return acc;
  }, []);
};

class TransmuxController {
  constructor(self) {
    this.reset();
    this.worker = self;
  }

  //
  init(inputFormat, outputFormat) {
    if ((/mkv|webm/).test(inputFormat.video)) {
      this.demuxer = EbmlTransmuxer.demux;
    }

    if ((/mkv|webm/).test(outputFormat.video)) {
      this.muxer = EbmlTransmuxer.mux;
    }

    this.worker.postMessage({
      type: 'trackinfo',
      trackinfo: outputFormat
    });
  }

  push(bytes) {
    const demuxed = this.demux(bytes);

    if (!demuxed.frames.length) {
      return;
    }

    this.mux(demuxed);
  }

  demux(bytes) {
    bytes = concatTypedArrays(this.demuxState.leftover, bytes);

    return this.demuxer(bytes, this.demuxState);
  }

  mux(demuxed, flush) {
    demuxed.tracks.forEach((track) => {
      const frames = demuxed.frames.filter((frame) => frame.trackNumber === track.number);

      const options = Object.assign({}, demuxed, {
        tracks: [track],
        frames
      });

      this.muxState[track.number] = this.muxState[track.number] || {};
      const remuxed = this.muxer(options, this.muxState[track.number], flush);

      this.worker.postMessage({
        datatype: track.type,
        type: 'data',
        data: remuxed.buffer
      }, [remuxed.buffer]);
    });
  }

  reset() {
    this.inputTracks = void 0;
    this.outputTracks = void 0;
    this.demuxState = {};
    this.muxState = {};
  }

  flush() {
    const demuxed = this.demux(new Uint8Array());

    this.mux(demuxed, true);
    this.reset();
    this.worker.postMessage({type: 'done'});
  }
}

const MuxWorker = function(self) {
  let format = void 0;
  let data = void 0;
  let inputMimetypes = void 0;
  let outputMimeTypes = void 0;
  const transmuxController = self.transmuxController = new TransmuxController(self);

  self.onmessage = function(event) {
    const message = event.data;

    switch (message.type) {
    case 'push':
      if (outputMimeTypes) {
        transmuxController.push(message.data);
        break;
      }

      data = concatTypedArrays(data, message.data);
      if (format && Object.keys(format.codecs).length) {
        return;
      }

      format = parseFormatForBytes(data);

      if (!format || !Object.keys(format.codecs).length) {
        return;
      }

      inputMimetypes = Object.keys(format.codecs).reduce((acc, type) => {
        const mimetype = format.mimetype
          .replace('video', type)
          .replace(/codecs=".+"/, `codecs="${format.codecs[type]}"`);

        acc[type] = mimetype;

        return acc;
      }, {});

      self.postMessage({type: 'canPlay', types: mimetypePermutations(format, inputMimetypes)});
      break;
    case 'canPlayResponse':
      outputMimeTypes = {};

      message.types.forEach(({type, mimetype, canPlay}) => {
        if (!canPlay) {
          return;
        }

        // select the first supported mimetype by
        // default unless...
        if (!outputMimeTypes[type]) {
          outputMimeTypes[type] = mimetype;
        }

        // always select supported mimetypes
        // that match original mimetype
        if (inputMimetypes[type] === mimetype) {
          outputMimeTypes[type] = mimetype;
        }
      });

      transmuxController.init(inputMimetypes, outputMimeTypes);
      transmuxController.push(data);
      data = void 0;

      break;
    case 'flush':
      transmuxController.flush();
      break;
    }
  };
};

// eslint-disable-next-line
export default MuxWorker(self);
