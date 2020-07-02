/* eslint-disable no-console */
import requestStream from './request-stream.js';
import MuxWorker from 'worker!./mux-worker.worker.js';
import window from 'global/window';

const MediaSource = window.MediaSource;
const performance = window.performance;

const xhrStreamer = () => {
  const worker = new MuxWorker();
  const handleMessage = function(e) {
    const message = e.data;

    switch (message.type) {
    case 'canPlay':
      worker.postMessage({
        type: 'canPlayResponse',
        types: message.types.map((type) => ({type, canPlay: MediaSource.isTypeSupported(type)}))
      });
      break;
    }
  };

  worker.addEventListener('message', handleMessage);

  const uri = window.location.origin + '/oceans.mp4';
  const start = performance.now();
  const dataFn = (data) => {
    worker.postMessage({type: 'push', data: data.buffer}, [data.buffer]);
  };
  const doneFn = () => {
    console.log(performance.now() - start);
  };

  const abort = requestStream(uri, dataFn, doneFn);

  return abort;
};

export default xhrStreamer;
