import EventTarget from './event-target.js';

class Stream extends EventTarget {
  push(data) {
    this.trigger('data', {data});
  }

  pipe(dest) {
    this.on('data', function(e) {
      dest.push(e.detail.data);
    });

    this.on('done', function(e) {
      dest.flush();
    });

    this.on('reset', function(e) {
      dest.reset();
    });
  }

  reset() {
    this.trigger('reset');
  }

  flush() {
    this.trigger('done');
  }
}

export default Stream;
