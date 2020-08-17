/* eslint-disable no-console */
import TransmuxController from './transmux-controller.js';

const MuxWorker = function(self) {
  let transmuxController;

  self.onmessage = function(event) {
    const message = event.data;

    // TODO: more dynamic code here
    switch (message.type) {
    case 'init':
      transmuxController = self.transmuxController = new TransmuxController(message.options);

      transmuxController.on('input-format', function(e) {
        self.postMessage({type: 'input-format', format: e.detail.format});
      });
      transmuxController.on('potential-formats', function(e) {
        self.postMessage({type: 'potential-formats', formats: e.detail.formats});
      });

      transmuxController.on('unsupported', function(e) {
        self.postMessage({type: 'unsupported', reason: e.detail.reason});
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
    case 'abort':
      transmuxController.reset();
      break;
    case 'output':
      transmuxController.init(message.output);
      break;
    case 'flush':
      transmuxController.flush();
      break;
    }
  };
};

// eslint-disable-next-line
export default MuxWorker(self);
