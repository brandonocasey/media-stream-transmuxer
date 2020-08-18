import QUnit from 'qunit';
import document from 'global/document';
import window from 'global/window';
import SourceUpdater from '../src/index.js';

const BASE_URL = window.location.origin + '/test/fixtures/formats';

QUnit.module('videojs-xhr-streamer', {
  beforeEach(assert) {
    assert.timeout(20000);
    this.fixture = document.getElementById('qunit-fixture');

    this.video = document.createElement('video');
    this.video.defaultPlaybackRate = 16;

    this.video.controls = true;
    this.video.muted = true;

    this.fixture.appendChild(this.video);
    this.fixture.style.position = 'inherit';

    this.streamer = window.streamer = new SourceUpdater(this.video);

    this.start = function(file, selectFormat) {
      const done = assert.async();

      this.video.addEventListener('ended', done);
      this.streamer.on('supported-formats', (e) => {
        this.streamer.selectFormat(selectFormat(e.detail.supportedFormats));
      });
      this.streamer.startStream(`${BASE_URL}/${file}`);
    };

    this.video.addEventListener('canplay', this.video.play);
    this.video.addEventListener('ended', () => {
      assert.equal(Math.round(this.video.duration), 60, 'video duration as expected');
      assert.equal(Math.round(this.video.currentTime), 60, 'currentTime as expected');
      assert.equal(Math.round(this.streamer.mse.duration), 60, 'mse duration as expected');

      const vBuffered = this.video.buffered;

      assert.equal(vBuffered.length, 1, '1 buffered');
      assert.equal(Math.round(vBuffered.start(0)), 0, 'buffered start as expected');
      assert.equal(Math.round(vBuffered.end(0)), 60, 'buffered end as expected');

      Object.keys(this.streamer.buffers).forEach((type) => {
        assert.notOk(this.streamer.buffers[type].updating, 'not updating');
        assert.notOk(this.streamer.queue[type].length, 'no queue');

        const sBuffered = this.streamer.buffers[type].buffered;

        assert.equal(Math.round(sBuffered.start(0)), 0, 'buffered start as expected');
        assert.equal(Math.round(sBuffered.end(0)), 60, 'buffered end as expected');
      });
    });
  },

  afterEach() {
    this.fixture.removeChild(this.video);
    this.streamer.dispose();
  }
});

const tests = [
  {output: 'fmp4 audio', file: 'mp4/aac.mp4', selectFormat: (f) => f[0]},
  {output: 'fmp4 video', file: 'mp4/avc1.42c00d.mp4', selectFormat: (f) => f[0]},
  {output: 'fmp4 muxed', file: 'mp4/avc1.42c00d,aac.mp4', selectFormat: (f) => f[0]},
  {output: 'fmp4 split', file: 'mp4/avc1.42c00d,aac.mp4', selectFormat: (f) => f[1]},
  {output: 'fmp4 remove video', file: 'mp4/avc1.42c00d,aac.mp4', selectFormat: (f) => f[2]},
  {output: 'fmp4 remove audio', file: 'mp4/avc1.42c00d,aac.mp4', selectFormat: (f) => f[3]}
];

tests.forEach(function({output, file, selectFormat}) {
  QUnit.test(`${file} -> ${output}`, function(assert) {
    this.start(file, selectFormat);
  });
});
