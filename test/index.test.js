import QUnit from 'qunit';
import document from 'global/document';
import window from 'global/window';
import SourceUpdater from '../src/index.js';

const BASE_URL = window.location.origin + '/test/fixtures/formats';

QUnit.module('MediaStreamTransmuxer', {
  beforeEach(assert) {
    assert.timeout(10000);
    this.fixture = document.getElementById('qunit-fixture');

    this.video = document.createElement('video');
    this.video.defaultPlaybackRate = 16;

    this.video.controls = true;
    this.video.muted = true;

    this.fixture.appendChild(this.video);
    this.fixture.style.position = 'inherit';

    this.streamer = window.streamer = new SourceUpdater(this.video);

    this.start = function(file, format) {
      const done = assert.async();

      this.video.addEventListener('ended', done);
      this.streamer.on('supported-formats', (e) => {
        let select;
        const filterKeys = Object.keys(format);

        for (let i = 0; i < e.detail.supportedFormats.length; i++) {
          const supportedFormat = e.detail.supportedFormats[i];

          if (filterKeys.every((k) => supportedFormat[k] === format[k])) {
            select = supportedFormat;
            continue;
          }
        }

        if (!select) {
          assert.notOk(true, 'could not select a format with supported formats and filter');
        }
        this.streamer.selectFormat(select);
      });
      this.streamer.startStream(`${BASE_URL}/${file}`);
    };

    this.video.addEventListener('canplay', this.video.play);
    this.video.addEventListener('ended', () => {
      assert.equal(Math.round(this.video.duration), 20, 'video duration as expected');
      assert.equal(Math.round(this.video.currentTime), 20, 'currentTime as expected');
      assert.equal(Math.round(this.streamer.mse.duration), 20, 'mse duration as expected');

      const vBuffered = this.video.buffered;

      assert.equal(vBuffered.length, 1, '1 buffered');
      assert.equal(Math.round(vBuffered.start(0)), 0, 'buffered start as expected');
      assert.equal(Math.round(vBuffered.end(0)), 20, 'buffered end as expected');

      Object.keys(this.streamer.buffers).forEach((type) => {
        assert.notOk(this.streamer.buffers[type].updating, 'not updating');
        assert.notOk(this.streamer.queue[type].length, 'no queue');

        const sBuffered = this.streamer.buffers[type].buffered;

        assert.equal(Math.round(sBuffered.start(0)), 0, 'buffered start as expected');
        assert.equal(Math.round(sBuffered.end(0)), 20, 'buffered end as expected');
      });
    });
  },

  afterEach() {
    this.fixture.removeChild(this.video);
    this.streamer.dispose();
  }
});

const tests = [
  // same format tests
  {output: 'fmp4 audio', file: 'mp4/aac.mp4', format: {type: 'audio', container: 'mp4'}},
  {output: 'fmp4 video', file: 'mp4/avc1.42c00d.mp4', format: {type: 'video', container: 'mp4'}},
  {output: 'fmp4 muxed', file: 'mp4/avc1.42c00d,aac.mp4', format: {type: 'muxed', container: 'mp4'}},
  {output: 'fmp4 split', file: 'mp4/avc1.42c00d,aac.mp4', format: {type: 'split', container: 'mp4'}},
  {output: 'fmp4 remove video', file: 'mp4/avc1.42c00d,aac.mp4', format: {type: 'video', container: 'mp4'}},
  {output: 'fmp4 remove audio', file: 'mp4/avc1.42c00d,aac.mp4', format: {type: 'audio', container: 'mp4'}},

  {output: 'webm audio', file: 'webm/opus.webm', format: {type: 'audio', container: 'webm'}},
  {output: 'webm video', file: 'webm/vp9.webm', format: {type: 'video', container: 'webm'}},
  {output: 'webm muxed', file: 'webm/vp9,opus.webm', format: {type: 'muxed', container: 'webm'}},
  {output: 'webm split', file: 'webm/vp9,opus.webm', format: {type: 'split', container: 'webm'}},
  {output: 'webm remove video', file: 'webm/vp9,opus.webm', format: {type: 'video', container: 'webm'}},
  {output: 'webm remove audio', file: 'webm/vp9,opus.webm', format: {type: 'audio', container: 'webm'}},

  // cross format tests
  // TODO: get this working by having the ebml demuxer spit out duration for frames
  {skip: true, output: 'fmp4 audio', file: 'webm/opus.webm', format: {type: 'audio', container: 'mp4'}},

  {output: 'webm audio', file: 'mp4/opus.mp4', format: {type: 'audio', container: 'webm'}},
  {output: 'mp4 audio', file: 'adts/aac.aac', format: {type: 'audio', container: 'mp4'}}
];

tests.forEach(function({output, file, format, skip}) {
  let fn = 'test';

  if (skip) {
    fn = 'skip';
  }
  QUnit[fn](`${file} -> ${output}`, function(assert) {
    this.start(file, format);
  });
});
