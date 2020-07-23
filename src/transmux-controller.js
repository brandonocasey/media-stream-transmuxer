import shallowEqual from './shallow-equal.js';
import Stream from './stream';
import Formats from './formats/index.js';

// TODO: change this to a stream and remove worker messaging
class TransmuxController {
  constructor(self) {
    this.worker = self;
  }

  initialized() {
    return !!(this.demuxer && this.muxer);
  }

  init(inputFormat, outputFormat, options) {
    // pass through
    if (shallowEqual(inputFormat, outputFormat)) {
      this.demuxer = new Stream();
      this.muxer = new Stream();
    } else {
      Formats.forEach(function(format) {
        if (!this.demuxer && format.containerMatch(inputFormat.container)) {
          this.demuxer = new format.Demuxer();
        }

        if (!this.muxer && format.containerMatch(outputFormat.container)) {
          this.muxer = new format.Muxer();
        }
      });
    }

    this.worker.postMessage({
      type: 'trackinfo',
      trackinfo: {video: outputFormat.mimetype}
    });

    this.demuxer.pipe(this.muxer);

    this.muxer.on('data', (e) => {
      const data = e.detail.data;

      this.worker.postMessage({
        datatype: 'video',
        type: 'data',
        data: data.buffer || data
      }, [data.buffer || data]);
    });
  }

  push(bytes, flush) {
    this.demuxer.push(bytes);
    if (flush) {
      this.flush();
    }
  }

  flush() {
    this.demuxer.flush();

    if (this.demuxer && this.muxer) {
      this.worker.postMessage({type: 'done'});
    }
  }
}

export default TransmuxController;
