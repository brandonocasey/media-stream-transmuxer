/* eslint-disable no-console */
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import {parseFormatForBytes} from '@videojs/vhs-utils/dist/format-parser';
import TransmuxController from './transmux-controller.js';
import mimetypePermutations from './mimetype-permutations.js';

const MuxWorker = function(self) {
  let inputFormat = void 0;
  let data = void 0;
  const transmuxController = self.transmuxController = new TransmuxController(self);
  let flush = false;

  self.onmessage = function(event) {
    const message = event.data;

    switch (message.type) {
    case 'push':
      if (transmuxController.initialized()) {
        transmuxController.push(message.data);
        break;
      }

      data = concatTypedArrays(data, message.data);
      if (inputFormat && Object.keys(inputFormat.codecs).length) {
        return;
      }

      // TODO: use format probes
      inputFormat = parseFormatForBytes(data);

      if (!inputFormat || !Object.keys(inputFormat.codecs).length) {
        return;
      }

      self.postMessage({type: 'canPlay', formats: mimetypePermutations(inputFormat)});
      break;
    case 'canPlayResponse':
      let outputFormat;

      for (let i = 0; i < message.formats.length; i++) {
        const format = message.formats[i];

        if (!format.canPlay) {
          continue;
        }

        // always select supported mimetypes
        // that match original mimetype
        if (inputFormat.mimetype === format.mimetype) {
          outputFormat = inputFormat;
        }
      }

      if (!outputFormat) {
        self.postMessage({type: 'error', message: 'Cannot transmux data'});
        return;
      }
      transmuxController.init(inputFormat, outputFormat, {allowPassthrough: false});
      transmuxController.push(data, flush);
      data = void 0;

      break;
    case 'flush':
      if (transmuxController.initialized()) {
        transmuxController.flush();
      } else {
        flush = true;
      }
      break;
    }
  };
};

// eslint-disable-next-line
export default MuxWorker(self);
