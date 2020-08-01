import {findBox} from './demux-helpers.js';
import Stream from '../../stream.js';
import {bytesToNumber} from '@videojs/vhs-utils/dist/byte-helpers';

class Mp4Demuxer extends Stream {
  constructor({tracks}) {
    super();
    this.reset();
    this.tracks = tracks;
    this.savedData = null;
  }

  push(data) {
    const frameTable = {};

    const mvhd = findBox(data, ['moov', 'mvhd'])[0];
    const info = {};

    // ms to ns
    // mvhd v1 has 8 byte duration and other fields too
    if (mvhd[0] === 1) {
      info.timestampScale = bytesToNumber(mvhd.subarray(20, 24)) * 1000;
      info.duration = bytesToNumber(mvhd.subarray(24, 32));
    } else {
      info.timestampScale = bytesToNumber(mvhd.subarray(12, 16)) * 1000;
      info.duration = bytesToNumber(mvhd.subarray(16, 20));
    }

    this.tracks.forEach(function(track) {
      const frames = frameTable[track.number] = [];

      for (let chunkIndex = 0; chunkIndex < track.chunkOffsets.length; chunkIndex++) {
        let samplesInChunk;

        for (let i = 0; i < track.samplesToChunks.length; i++) {
          const sampleToChunk = track.samplesToChunks[i];
          const isThisOne = (chunkIndex + 1) >= sampleToChunk.firstChunk &&
            (i + 1 >= track.samplesToChunks.length || (chunkIndex + 1) < track.samplesToChunks[i + 1].firstChunk);

          if (isThisOne) {
            samplesInChunk = sampleToChunk.samplesPerChunk;
            break;
          }
        }

        let chunkOffset = track.chunkOffsets[chunkIndex];

        for (let i = 0; i < samplesInChunk; i++) {
          const frameEnd = track.sampleSizes[frames.length];

          // TODO: store this state
          if ((chunkOffset + frameEnd) > data.length) {
            return;
          }

          // if we don't have key samples every frame is a keyframe
          let keyframe = !track.keySamples.length;

          if (track.keySamples.length && track.keySamples.indexOf(frames.length + 1) !== -1) {
            keyframe = true;
          }

          let timestamp = 0;

          if (frames.length) {
            for (let k = 0; k < track.timeToSamples.length; k++) {
              const {sampleCount, sampleDelta} = track.timeToSamples[k];

              if ((frames.length) <= sampleCount) {
                // ms to ns
                timestamp = frames[frames.length - 1].timestamp + ((sampleDelta / track.timescale) * 1000);
                break;
              }
            }
          }

          frames.push({
            trackNumber: track.number,
            timestamp,
            keyframe,
            data: data.subarray(chunkOffset, chunkOffset + frameEnd)
          });

          chunkOffset += frameEnd;
        }
      }
    });

    // TODO:
    this.tracks[1].info = {channels: 2, samplingFrequency: this.tracks[1].timescale, bitDepth: 32};

    super.push({info});
    super.push({tracks: this.tracks});
    super.push({frames: frameTable[2]});
  }

  reset() {
    this.state = {};
  }

  flush() {
    super.flush();
  }
}

export default Mp4Demuxer;
