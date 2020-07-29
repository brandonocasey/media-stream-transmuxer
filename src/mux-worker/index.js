/* eslint-disable no-console */
import TransmuxController from './transmux-controller.js';
import mimetypePermutations from './mimetype-permutations.js';

const MuxWorker = function(self) {
  let transmuxController;

  self.onmessage = function(event) {
    const message = event.data;

    switch (message.type) {
    case 'init':
      transmuxController = self.transmuxController = new TransmuxController(message.options);
      transmuxController.on('format', function(e) {
        self.postMessage({type: 'canPlay', formats: mimetypePermutations(e.detail.format)});
      });

      transmuxController.on('unsupported', function(e) {
        self.postMessage({type: 'unsupported', reason: e.detail.reason});
      });

      transmuxController.on('trackinfo', function(e) {
        self.postMessage({type: 'trackinfo', trackinfo: e.detail.trackinfo});
      });
      transmuxController.on('done', function(e) {
        self.postMessage({type: 'done'});
      });

      transmuxController.on('data', function(e) {
        const buffer = e.detail.data.buffer || e.detail.data;

        self.postMessage({
          type: 'data',
          data: buffer,
          datatype: e.detail.datatype
        }, [buffer]);
      });
      break;
    case 'push':
      transmuxController.push(message.data);
      break;
    case 'canPlayResponse':
      transmuxController.init(message.formats);
      break;
    case 'flush':
      transmuxController.flush();
      break;
    }
  };
};

// eslint-disable-next-line
export default MuxWorker(self);
