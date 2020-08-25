import {toUint8, bytesToNumber, bytesMatch} from '@videojs/vhs-utils/dist/byte-helpers';
import {TAGS, TRACK_TYPE_NUMBER} from './constants';
import {get as getvint} from './vint.js';
import {codecInfoFromTrack} from './codec-translator.js';
import {findEbml, findFinalEbml} from './find-ebml.js';

// relevant specs for this parser:
// https://matroska-org.github.io/libebml/specs.html
// https://www.matroska.org/technical/elements.html
// https://www.webmproject.org/docs/container/

// see https://www.matroska.org/technical/basics.html#block-structure
export const decodeBlock = function(block, clusterTimestamp = 0) {
  let duration;
  let type = 'block';

  if (block.tag[0] === TAGS.BlockGroup[0]) {
    duration = findEbml(block, [TAGS.BlockDuration])[0];
    if (duration) {
      duration = new DataView(duration.buffer, duration.byteOffset, duration.byteLength).getFloat64();
    }
    block = findEbml(block, [TAGS.Block])[0];
    // treat data as a block after this point
  } else if (block.tag[0] === TAGS.SimpleBlock[0]) {
    type = 'simple';
  }
  const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const trackNumber = getvint(block, 0);
  const relativeTimestamp = dv.getInt16(trackNumber.length, false);
  const flags = block[trackNumber.length + 2];
  const data = block.subarray(trackNumber.length + 3);
  const timestamp = clusterTimestamp + relativeTimestamp;

  // return the frame
  const parsed = {
    raw: block,
    duration,
    trackNumber: trackNumber.value,
    keyframe: type === 'simple' && (flags >> 7) === 1,
    invisible: ((flags & 0x08) >> 3) === 1,
    lacing: ((flags & 0x06) >> 1),
    discardable: type === 'simple' && (flags & 0x01) === 1,
    frames: [],
    timestamp
  };

  if (!parsed.lacing) {
    parsed.frames.push(data);
    return parsed;
  }

  const numberOfFrames = data[0] + 1;

  const frameSizes = [];
  let offset = 1;

  // Fixed
  if (parsed.lacing === 2) {
    const sizeOfFrame = (data.length - offset) / numberOfFrames;

    for (let i = 0; i < numberOfFrames; i++) {
      frameSizes.push(sizeOfFrame);
    }
  }

  // xiph
  if (parsed.lacing === 1) {
    for (let i = 0; i < numberOfFrames - 1; i++) {
      let size = 0;

      do {
        size += data[offset];
        offset++;
      } while (data[offset - 1] === 0xFF);

      frameSizes.push(size);
    }
  }

  // ebml
  if (parsed.lacing === 3) {
    // first vint is unsinged
    // after that vints are singed and
    // based on a compounding size
    let size = 0;

    for (let i = 0; i < numberOfFrames - 1; i++) {
      const vint = i === 0 ? getvint(data, offset) : getvint(data, offset, true, true);

      size += vint.value;
      frameSizes.push(size);
      offset += vint.length;
    }
  }

  frameSizes.forEach(function(size) {
    parsed.frames.push(data.subarray(offset, offset + size));
    offset += size;
  });

  return parsed;
};

export const parseTracks = function(bytes) {
  bytes = toUint8(bytes);
  const decodedTracks = [];
  const tracks = findFinalEbml(bytes, [TAGS.Segment, TAGS.Tracks, TAGS.Track], true);

  if (!tracks.length) {
    return decodedTracks;
  }

  tracks.forEach(function(track) {
    let trackType = findEbml(track, TAGS.TrackType)[0];

    trackType = TRACK_TYPE_NUMBER[trackType[0]];

    // TODO: parse language
    const decodedTrack = {
      raw: track,
      type: trackType,
      number: bytesToNumber(findEbml(track, [TAGS.TrackNumber])[0]),
      default: findEbml(track, [TAGS.FlagDefault])[0]
    };

    const defaultDuration = findEbml(track, [TAGS.DefaultDuration])[0];
    const codecDelay = findEbml(track, [TAGS.CodecDelay])[0];
    const seekPreRoll = findEbml(track, [TAGS.SeekPreRoll])[0];

    if (trackType === 'video') {
      const video = findEbml(track, [TAGS.Video])[0];

      decodedTrack.info = {
        width: bytesToNumber(findEbml(video, [TAGS.PixelWidth])[0]),
        heigth: bytesToNumber(findEbml(video, [TAGS.PixelHeigth])[0])
      };
    } else {
      const audio = findEbml(track, [TAGS.Audio])[0];

      let samplingFrequency = findEbml(audio, [TAGS.SamplingFrequency])[0];

      if (samplingFrequency && samplingFrequency.length) {
        samplingFrequency = new DataView(samplingFrequency.buffer, samplingFrequency.byteOffset, samplingFrequency.byteLength).getFloat64();
      } else {
        samplingFrequency = 48000;
      }

      decodedTrack.info = {
        channels: bytesToNumber(findEbml(audio, [TAGS.Channels])[0]),
        sampleRate: samplingFrequency,
        bitDepth: bytesToNumber(findEbml(audio, [TAGS.BitDepth])[0])
      };
    }

    if (defaultDuration && defaultDuration.length) {
      decodedTrack.defaultDuration = bytesToNumber(defaultDuration);
    }

    if (codecDelay && codecDelay.length) {
      decodedTrack.info.codecDelay = bytesToNumber(codecDelay);
    }

    if (seekPreRoll && seekPreRoll.length) {
      decodedTrack.seekPreRoll = bytesToNumber(seekPreRoll);
    }

    const {info, codec} = codecInfoFromTrack(track);

    decodedTrack.codec = codec;
    if (info) {
      decodedTrack.info[codec] = info;
    }

    decodedTracks.push(decodedTrack);
  });

  return decodedTracks.sort((a, b) => a.number - b.number);
};

const blockPath = [(tag) => bytesMatch(tag, TAGS.SimpleBlock) || bytesMatch(tag, TAGS.BlockGroup)];

export const parseBlocks = function(data, clusterTimestamp) {
  const blocks = findEbml(data, blockPath, true);

  return blocks.map((block) => decodeBlock(block, clusterTimestamp));
};

export const parseSegmentInfo = function(data) {
  const segmentInfo = findFinalEbml(data, [TAGS.Segment, TAGS.SegmentInformation], true)[0];

  if (!segmentInfo) {
    return {};
  }

  const info = {raw: segmentInfo};

  const timestampScale = findEbml(segmentInfo, [TAGS.TimestampScale])[0];
  const duration = findEbml(segmentInfo, [TAGS.SegmentDuration])[0];

  // in nanoseconds, defaults to 1ms
  if (timestampScale && timestampScale.length) {
    info.timestampScale = bytesToNumber(timestampScale);
  } else {
    info.timestampScale = 1000000;
  }

  if (duration && duration.length) {
    info.duration = new DataView(duration.buffer, duration.byteOffset, duration.byteLength).getFloat64();
  }

  return info;
};

export const parseClusters = function(data, timestampScale) {
  const clustersDatas = findFinalEbml(data, [TAGS.Segment, TAGS.Cluster]);
  const clusters = [];

  clustersDatas.forEach(function(clusterData, ci) {
    let timestamp = findEbml(clusterData, [TAGS.ClusterTimestamp])[0] || 0;

    if (timestamp && timestamp.length) {
      timestamp = bytesToNumber(timestamp) * (timestampScale / 1000000);
    }

    clusters.push({
      raw: clusterData,
      timestamp,
      blocks: parseBlocks(clusterData, timestamp)
    });
  });

  return clusters;
};

export const parseCues = function(data) {
  const cueDatas = findFinalEbml(data, [TAGS.Segment, TAGS.Cues], true);
  const cues = [];

  cueDatas.forEach(function(cueData) {
    const cuePointDatas = findEbml(cueData, [TAGS.CuePoint]);

    cuePointDatas.forEach(function(cuePointData) {
      const cuePositionDatas = findEbml(cuePointData, [TAGS.CueTrackPosition]);
      const time = findEbml(cuePointData, [TAGS.CueTime]);

      cuePositionDatas.forEach(function(cuePositionData) {
        cues.push({
          raw: cuePositionData,
          time,
          trackNumber: findEbml(cuePositionData, [TAGS.CueTrack]),
          clusterPosition: findEbml(cuePositionData, [TAGS.CueClusterPosition]),
          relativePosition: findEbml(cuePositionData, [TAGS.CueRelativePosition])
        });
      });
    });
  });

  return cues;
};
