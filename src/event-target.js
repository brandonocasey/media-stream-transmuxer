class EventTarget {
  constructor() {
    this.listeners = {};
  }

  on(type, listener) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  off(type, listener) {
    if (!this.listeners[type]) {
      return false;
    }

    const index = this.listeners[type].indexOf(listener);

    // TODO: which is better?
    // In Video.js we slice listener functions
    // on trigger so that it does not mess up the order
    // while we loop through.
    //
    // Here we slice on off so that the loop in trigger
    // can continue using it's old reference to loop without
    // messing up the order.
    this.listeners[type] = this.listeners[type].slice(0);
    this.listeners[type].splice(index, 1);
    return index > -1;
  }

  trigger(type, detail = {}) {
    const callbacks = this.listeners[type];

    if (!callbacks) {
      return;
    }

    for (let i = 0; i < callbacks.length; ++i) {
      callbacks[i].call(this, {type, detail});
    }
  }
}

EventTarget.prototype.addEventListener = EventTarget.prototype.on;
EventTarget.prototype.removeEventListener = EventTarget.prototype.off;
EventTarget.prototype.dispatchEvent = EventTarget.prototype.trigger;

export default EventTarget;
