const findIndex = function(arr, fn) {
  if (arr.findIndex) {
    return arr.findIndex(fn);
  }

  for (let i = 0; i < arr.length; i++) {
    if (fn(arr[i])) {
      return i;
    }
  }

  return -1;
};

class EventTarget {
  constructor() {
    this.listeners = {};
    this.wrappers = {};
  }

  on(type, listener) {
    if (!this.listeners[type]) {
      this.listeners[type] = new Set();
    }
    this.listeners[type].add(listener);
  }

  off(type, listener) {
    if (!this.listeners[type]) {
      return false;
    }

    const wIndex = findIndex(this.wrappers, (w) => w.listener === listener);

    // if this listener is wrapped remove it's wrapper too

    if (wIndex !== -1) {
      this.off(type, this.wrappers[type].splice(wIndex, 1)[0].listener);
    }

    // TODO: which is better?
    // In Video.js we slice listener functions
    // on trigger so that it does not mess up the order
    // while we loop through.
    //
    // Here we slice on off so that the loop in trigger
    // can continue using it's old reference to loop without
    // messing up the order.
    this.listeners[type] = new Set(this.listeners[type]);
    return this.listeners[type].delete(listener);
  }

  one(type, listener) {
    this.wrappers[type] = this.wrappers[type] || [];
    const wIndex = findIndex(this.wrappers[type], (w) => w.listener === listener);

    if (wIndex !== -1) {
      return;
    }
    const wrapper = function(...args) {
      listener.off(type, listener);
      listener.call(this, args);
    };

    wrapper.listener = listener;

    this.wrappers[type].push(wrapper);

    return this.on(type, wrapper);
  }

  trigger(type, detail = {}) {
    const callbacks = this.listeners[type];

    if (!callbacks) {
      return;
    }

    callbacks.forEach((callback) => {
      callback.call(this, {type, detail});
    });
  }
}

EventTarget.prototype.addEventListener = EventTarget.prototype.addListener = EventTarget.prototype.on;
EventTarget.prototype.once = EventTarget.prototype.one;
EventTarget.prototype.removeEventListener = EventTarget.prototype.off;
EventTarget.prototype.dispatchEvent = EventTarget.prototype.emit = EventTarget.prototype.trigger;

export default EventTarget;
