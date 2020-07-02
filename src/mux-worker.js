/* eslint-disable no-console */
import {concatTypedArrays} from '../../vhs-utils/dist/byte-helpers.js';
import {parseFormatForBytes} from '../../vhs-utils/dist/format-parser.js';
const testContainers = ['mp4', 'webm'];

const containerPermutations = function(format) {
  if (!format.codecs) {
    return;
  }

  // TODO: test with different mimetype containers too
  return Object.keys(format.codecs)
    .map((type) => format.mimetype
      .replace('video', type)
      .replace(/codecs=".+"/, `codecs="${format.codecs[type]}"`))
    .reduce((acc, mimetype) => {
      acc.push(mimetype);

      testContainers.forEach((testContainer) => {
        if (mimetype.indexOf(testContainer) === -1) {
          acc.push(mimetype.replace(format.container, testContainer));
        }
      });

      return acc;
    }, []);
};

const MuxWorker = function(self) {
  let data;
  let format;

  self.onmessage = function(event) {
    const message = event.data;

    switch (message.type) {
    case 'push':
      data = concatTypedArrays(data, message.data);
      if (format && format.codecs) {
        return;
      }

      // TODO: should this parse tracks and containers only??
      format = parseFormatForBytes(data);
      if (format.codecs) {
        const types = containerPermutations(format);

        self.postMessage({type: 'canPlay', types});
      }
      break;
    case 'canPlayResponse':
      message.types.forEach(({type, canPlay}) => {
        console.log(type, canPlay);

      });
      break;
    }
  };
};

// eslint-disable-next-line
export default MuxWorker(self);
