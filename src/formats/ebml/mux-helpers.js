import {
  concatTypedArrays,
  stringToBytes,
  numberToBytes,
  isTypedArray,
  ENDIANNESS,
  bytesMatch
} from '@videojs/vhs-utils/dist/byte-helpers.js';

import {TAGS, TRACK_TYPE_WORD} from './constants.js';
import {set as setvint} from './vint.js';

// TODO: use DataView
const setint16bytes = function(value) {
  const bytes = new Uint8Array(new Int16Array([value]).buffer);

  if (ENDIANNESS !== 'big') {
    return new Uint8Array(Array.prototype.slice.call(bytes).reverse());
  }

  return bytes;
};

// TODO: should we support lacing?
export const encodeBlocks = function(frames, clusterTimestamp) {
  return frames.reduce((acc, frame) => {
    let flagByte = 0;

    if (frame.keyframe) {
      flagByte |= 0b10000000;
    }

    if (frame.invisible) {
      flagByte |= 0b00001000;
    }

    if (frame.discardable) {
      flagByte |= 0b00000001;
    }

    const blockData = concatTypedArrays(
      setvint(frame.trackNumber),
      setint16bytes(frame.timestamp - clusterTimestamp),
      [flagByte],
      frame.data
    );

    acc.push([TAGS.SimpleBlock, blockData]);

    return acc;
  }, []);
};

export const toEbmlBytes = function([tag, value], options = {}) {
  let data = value;

  if (Array.isArray(value) && !isTypedArray(value)) {
    data = value.reduce((acc, subobject) => {
      acc = concatTypedArrays(acc, toEbmlBytes(subobject), options);
      return acc;
    }, new Uint8Array());
  } else if (typeof value === 'string') {
    data = stringToBytes(value);
  } else if (typeof value === 'number') {
    data = numberToBytes(value);
  }

  let lengthBytes;

  if (options.infiniteLength) {
    options.infiniteLength.forEach(function(_tag) {
      if (bytesMatch(tag, _tag)) {
        lengthBytes = new Uint8Array([0xFF]);
      }
    });
  }

  if (!lengthBytes) {
    lengthBytes = setvint(data.length);
  }

  return concatTypedArrays(
    tag,
    lengthBytes,
    data
  );
};

const EBML_HEADER = toEbmlBytes([TAGS.EBML, [
  [TAGS.Version, 1],
  [TAGS.EBMLReadVersion, 1],
  [TAGS.EBMLMaxIDLength, 4],
  [TAGS.EBMLMaxSizeLength, 8],
  [TAGS.DocType, 'webm'],
  [TAGS.DocTypeVersion, 2],
  [TAGS.DocTypeReadVersion, 2]
]]);

const CODECS = {
  vp9: 'V_VP9',
  opus: 'A_OPUS'
};

export const encodeClusters = function(frames, tracks, state, flush) {
  const clusters = [];
  const keyframes = {};

  if (state.frames) {
    frames = [].concat(state.frames).concat(frames);
  }

  // only worry about keyframes if this isn't a flush
  // on flush we spit out all remaining frames
  if (!flush) {
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];

      keyframes[track.number] = [];

      // handle that here
      frames.forEach(function(frame, fi) {
        if (frame.keyframe && frame.trackNumber === track.number) {
          keyframes[track.number].push(fi);
        }
      });

      // makes sure we always have a keyframe
      // leftover, so we can always start clusters with a keyframe
      if (keyframes[track.number].length <= 1) {
        state.frames = frames;
        return clusters;
      }
    }

    let last;

    Object.keys(keyframes).forEach(function(number) {
      const kf = keyframes[number];

      // choose the second to last keyframe by index
      if (!last || last > kf[kf.length - 1]) {
        last = kf[kf.length - 1];
      }
    });

    state.frames = frames.slice(last);
    frames = frames.slice(0, last - 1);
  }

  let start = 0;

  // clusters cannot be too big
  // break them up into 100 frame chunks
  while (start < frames.length) {
    const end = start + 100 > frames.length ? frames.length : start + 100;
    const clusterTimestamp = frames[start].timestamp;
    const blocks = encodeBlocks(frames.slice(start, end), clusterTimestamp);

    clusters.push([TAGS.Cluster, [
      [TAGS.ClusterTimestamp, clusterTimestamp]
    ].concat(blocks)]);

    start = end;
  }

  return clusters;
};

export const generateEbml = function({tracks, frames, cues, info}, state, {clustersOnly, flush}) {
  const clusters = encodeClusters(frames, tracks, state, flush);

  if (!clusters.length) {
    return;
  }

  if (clustersOnly) {
    return concatTypedArrays.apply(null, clusters.map((cluster) => toEbmlBytes(cluster, {infiniteLength: [TAGS.Cluster]})));
  }

  const ebmltracks = tracks.reduce(function(acc, track) {
    const ebmlTrack = [TAGS.Track, [
      [TAGS.TrackNumber, track.number],
      [TAGS.TrackUID, track.number],
      [TAGS.TrackType, TRACK_TYPE_WORD[track.type]],
      [TAGS.CodecID, CODECS[track.codec]]
    ]];

    if (track.type === 'video') {
      ebmlTrack[1].push([TAGS.Video, [
        [TAGS.PixelWidth, track.info.width],
        [TAGS.PixelHeigth, track.info.heigth]
      ]]);
    } else {
      ebmlTrack[1].push([TAGS.Audio, [
        [TAGS.Channels, track.info.channels],
        [TAGS.SamplingFrequency, track.info.samplingFrequency],
        [TAGS.BitDepth, track.info.bitDepth]
      ]]);
    }

    if (track.defaultDuration) {
      ebmlTrack[1].push([TAGS.DefaultDuration, track.defaultDuration]);
    }

    if (track.codecDelay) {
      ebmlTrack[1].push([TAGS.CodecDelay, track.codecDelay]);
    }

    if (track.seekPreRoll) {
      ebmlTrack[1].push([TAGS.SeekPreRoll, track.seekPreRoll]);
    }

    acc.push(ebmlTrack);
    return acc;
  }, []);

  const dv = new DataView(new ArrayBuffer(8));

  dv.setFloat64(0, info.duration);

  const segment = [TAGS.Segment, [
    [TAGS.SegmentInformation, [
      [TAGS.TimestampScale, info.timestampScale],
      [TAGS.SegmentDuration, new Uint8Array(dv.buffer)],
      [TAGS.MuxingApp, 'transcodejs'],
      [TAGS.WritingApp, 'transcodejs']
    ]],
    [TAGS.Tracks, ebmltracks]
  ]];

  segment[1] = segment[1].concat(clusters);

  return concatTypedArrays(EBML_HEADER, toEbmlBytes(segment, {infiniteLength: [TAGS.Segment, TAGS.Cluster]}));

};
