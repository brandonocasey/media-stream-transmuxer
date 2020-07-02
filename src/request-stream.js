/* eslint-disable no-console */
import window from 'global/window';

const AbortController = window.AbortController;
const fetch = window.fetch;
const XMLHttpRequest = window.XMLHttpRequest;

const stringToBytes = (string, offset) => {
  const view = new Uint8Array(string.length - offset);

  for (let i = offset; i < string.length; i++) {
    view[i] = string.charCodeAt(i);
  }
  return view;
};

const xhrStream = (uri, datacb, donecb) => {
  let dataOffset = 0;
  const req = new XMLHttpRequest();

  req.addEventListener('progress', (e) => {
    const data = stringToBytes(e.target.responseText, dataOffset);

    if (data.length) {
      datacb(data);
    }

    dataOffset = req.responseText.length;
  });
  req.addEventListener('load', donecb);
  req.overrideMimeType('text\/plain; charset=x-user-defined');
  req.open('GET', uri);

  req.send();

  return () => req.abort();
};

const fetchStream = (uri, datacb, donecb) => {
  const controller = new AbortController();
  const signal = controller.signal;

  fetch(uri, {signal}).then(function(response) {
    const reader = response.body.getReader();

    const readMore = function(result) {

      if (result && result.done) {
        donecb();
        return Promise.resolve();
      }
      if (result && result.value) {
        datacb(result.value);
      }

      return reader.read().then(readMore);
    };

    return readMore();
  }).catch(function(err) {
    if (err.code === 20 || err.code === err.ABORT_ERR) {
      // not a real error, just an abort
      return;
    }
    console.log(err);
  });

  return () => controller.abort();
};

let reqStream = xhrStream;

if (fetch) {
  reqStream = fetchStream;
}

export default reqStream;
