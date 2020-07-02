import window from 'global/window';

const Worker = window.Worker;
const URL = window.URL;
const Blob = window.Blob;

/**
 * Returns a wrapper around Web Worker code that is constructible.
 *
 * @function shimWorker
 *
 * @param { Function }  fn      Function wrapping the code of the worker
 */
const shimWorker = (fn) => (function() {

  // Convert the function's inner code to a string to construct the worker
  const source = fn.toString().replace(/^function.+?{/, '').slice(0, -1);
  const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript'}));

  const worker = new Worker(url);
  const t = worker.terminate;

  worker.terminate = function() {
    URL.revokeObjectURL(url);
    t.call(worker);
  };

  return worker;
});

export default shimWorker;
