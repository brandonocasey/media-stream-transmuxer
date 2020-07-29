/* eslint-disable no-console */
import requestStream from './request-stream.js';
import MuxWorker from 'worker!../dist/mux-worker.worker.js';
import EventTarget from './event-target.js';

class XhrStreamer extends EventTarget {
  constructor() {
    super();
    this.worker_ = null;
    this.handleMessage = this.handleMessage.bind(this);
  }

  createWorker_() {
    if (this.worker_) {
      return;
    }

    this.worker_ = new MuxWorker();
    this.worker_.addEventListener('message', this.handleMessage);
    this.worker_.postMessage({type: 'init', options: {allowPassthrough: false}});
  }

  streamRequest(uri) {
    this.createWorker_();

    const dataFn = (data) => {
      this.worker_.postMessage({type: 'push', data: data.buffer}, [data.buffer]);
    };
    const doneFn = () => {
      this.abort_ = null;
      this.worker_.postMessage({type: 'flush'});
    };

    this.abort_ = requestStream(uri, dataFn, doneFn);
  }

  selectOutput(format) {
    if (this.worker_) {
      this.worker_.postMessage({type: 'output', output: format});
    }
  }

  abort() {
    if (this.abort_) {
      this.abort_();
    }

    if (this.worker_) {
      this.worker_.postMessage({type: 'abort'});
    }
  }

  handleMessage(e) {
    const message = e.data;

    this.trigger(message.type, message);
  }

  dispose() {
    this.worker_.removeEventListener('message', this.handleMessage);
    this.worker_.terminate();
  }

}

export default XhrStreamer;
