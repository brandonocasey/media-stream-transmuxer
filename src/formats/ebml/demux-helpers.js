import {toUint8, bytesToNumber} from '@videojs/vhs-utils/dist/byte-helpers';
import {TAGS, TRACK_TYPE_NUMBER} from './constants';
import {get as getvint} from './vint.js';
import {trackEbmlToCodec} from './codec-translator.js';
import {findEbml, findFinalEbml} from './find-ebml.js';

// relevant specs for this parser:
// https://matroska-org.github.io/libebml/specs.html
// https://www.matroska.org/technical/elements.html
// https://www.webmproject.org/docs/container/

const EMPTY_UINT8 = new Uint8Array();

// see https://www.matroska.org/technical/basics.html#block-structure
export const decodeBlock = function(block, type, timestampScale, clusterTimestamp = 0) {
  let duration;

  if (type === 'group') {
    duration = findEbml(block, [TAGS.BlockDuration])[0];
    if (duration) {
      duration = new DataView(duration.buffer, duration.byteOffset, duration.byteLength).getFloat64();
    }
    block = findEbml(block, [TAGS.Block])[0];
    type = 'block';
    // treat data as a block after this point
  }
  const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const trackNumber = getvint(block, 0);
  const relativeTimestamp = dv.getInt16(trackNumber.length, false);
  const flags = block[trackNumber.length + 2];
  const data = block.subarray(trackNumber.length + 3);
  const timestamp = clusterTimestamp + relativeTimestamp;
  // pts/dts in seconds
  const ptsdts = (((1 / timestampScale) * timestamp) * timestampScale) / 1000;

  // return the frame
  const parsed = {
    duration,
    trackNumber: trackNumber.value,
    keyframe: type === 'simple' && (flags >> 7) === 1,
    invisible: ((flags & 0x08) >> 3) === 1,
    lacing: ((flags & 0x06) >> 1),
    discardable: type === 'simple' && (flags & 0x01) === 1,
    frames: [],
    pts: ptsdts,
    dts: ptsdts,
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

    trackType = TRACK_TYPE_NUMBER[trackType];

    // TODO: parse language
    const decodedTrack = {
      type: trackType,
      number: bytesToNumber(findEbml(track, [TAGS.TrackNumber])[0]),
      default: findEbml(track, [TAGS.FlagDefault])[0]
    };

    const defaultDuration = findEbml(track, [TAGS.DefaultDuration])[0];
    const codecDelay = findEbml(track, [TAGS.CodecDelay])[0];
    const seekPreRoll = findEbml(track, [TAGS.SeekPreRoll])[0];

    if (defaultDuration && defaultDuration.length) {
      decodedTrack.defaultDuration = bytesToNumber(defaultDuration);
    }

    if (codecDelay && codecDelay.length) {
      decodedTrack.codecDelay = bytesToNumber(codecDelay);
    }

    if (seekPreRoll && seekPreRoll.length) {
      decodedTrack.seekPreRoll = bytesToNumber(seekPreRoll);
    }

    if (trackType === 'video') {
      const video = findEbml(track, [TAGS.Video])[0];

      decodedTrack.info = {
        width: bytesToNumber(findEbml(video, [TAGS.PixelWidth])[0]),
        heigth: bytesToNumber(findEbml(video, [TAGS.PixelHeigth])[0])
      };
    } else {
      const audio = findEbml(track, [TAGS.Audio])[0];

      decodedTrack.info = {
        channels: bytesToNumber(findEbml(audio, [TAGS.Channels])[0]),
        samplingFrequency: bytesToNumber(findEbml(audio, [TAGS.SamplingFrequency])[0]),
        bitDepth: bytesToNumber(findEbml(audio, [TAGS.BitDepth])[0])
      };

    }

    decodedTrack.codec = trackEbmlToCodec(track);
    decodedTracks.push(decodedTrack);
  });

  return decodedTracks.sort((a, b) => a.number - b.number);
};

export const parseBlocks = function(data, timestampScale, clusterTimestamp) {
  const simpleBlocks = findEbml(data, [TAGS.SimpleBlock], true)
    .map((b) => ({type: 'simple', data: b, clusterTimestamp}));
  const blockGroups = findEbml(data, [TAGS.BlockGroup], true)
    .map((b) => ({type: 'group', data: b, clusterTimestamp}));

  // get all blocks and simple blocks then sort them into the correct order
  const blocks = simpleBlocks
    .concat(blockGroups)
    .sort((a, b) => a.data.byteOffset - b.data.byteOffset);

  return blocks.map(function(block, bi) {
    return decodeBlock(block.data, block.type, timestampScale, clusterTimestamp);
  });
};

export const parseData = function(data, {tracks, info, lastClusterTimestamp} = {}) {
  const segmentInfo = findEbml(data, [TAGS.Segment, TAGS.SegmentInformation], true)[0];

  if (!info && segmentInfo) {
    info = {};

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
  }

  if (!tracks) {
    tracks = parseTracks(data);
  }

  const clustersDatas = findFinalEbml(data, [TAGS.Segment, TAGS.Cluster]);
  const clusters = [];

  if (info) {
    const leftoverBlocks = parseBlocks(data, info.timestampScale, lastClusterTimestamp);

    if (leftoverBlocks.length) {
      clusters.push({timestamp: lastClusterTimestamp, blocks: leftoverBlocks});
    }
  }

  clustersDatas.forEach(function(clusterData, ci) {
    let timestamp = findEbml(clusterData, [TAGS.ClusterTimestamp])[0] || 0;

    if (timestamp && timestamp.length) {
      timestamp = bytesToNumber(timestamp);
    }
    clusters.push({
      timestamp,
      blocks: parseBlocks(clusterData, info.timestampScale, timestamp)
    });
  });

  const allCues = [];
  const cues = findFinalEbml(data, [TAGS.Segment, TAGS.Cues], true);

  cues.forEach(function(cue) {
    const cuePoints = findEbml(cue, [TAGS.CuePoint]);

    cuePoints.forEach(function(cuePoint) {
      const positions = findEbml(cuePoint, [TAGS.CueTrackPosition]);
      const time = findEbml(cuePoint, [TAGS.CueTime]);

      positions.forEach(function(cuePosition) {
        allCues.push({
          time,
          trackNumber: findEbml(cuePosition, [TAGS.CueTrack]),
          clusterPosition: findEbml(cuePosition, [TAGS.CueClusterPosition]),
          relativePosition: findEbml(cuePosition, [TAGS.CueRelativePosition])
        });
      });
    });
  });

  const lastCue = cues.length && cues[cues.length - 1] || EMPTY_UINT8;
  const lastCluster = clusters.length && clusters[clusters.length - 1] || EMPTY_UINT8;
  const lastBlock = lastCluster.blocks &&
    lastCluster.blocks.length &&
    lastCluster.blocks[lastCluster.blocks.length - 1] || EMPTY_UINT8;
  const lastFrame = lastBlock.frames && lastBlock.frames[lastBlock.frames.length - 1] || EMPTY_UINT8;
  const cueEnd = lastCue.byteOffset + lastCue.byteLength;
  const frameEnd = lastFrame.byteOffset + lastFrame.byteLength;
  let leftover;

  if (frameEnd === 0 && cueEnd === 0) {
    leftover = data;
  } else if (frameEnd === data.length || cueEnd === data.length) {
    leftover = new Uint8Array();
  } else if (frameEnd > cueEnd) {
    leftover = data.subarray(frameEnd);
  } else if (cueEnd > frameEnd) {
    leftover = data.subarray(cueEnd);
  }

  return {
    tracks,
    clusters,
    cues: allCues,
    info,
    leftover
  };
};
