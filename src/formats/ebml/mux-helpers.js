import {
  concatTypedArrays,
  stringToBytes,
  numberToBytes,
  isTypedArray,
  ENDIANNESS,
  bytesMatch,
  reverseBytes
} from '@videojs/vhs-utils/dist/byte-helpers.js';

import {TAGS, TRACK_TYPE_WORD} from './constants.js';
import {set as setvint} from './vint.js';
import {codecToTrackEbml} from './codec-translator.js';

const setint16bytes = function(value) {
  const bytes = new Uint8Array(new Int16Array([value]).buffer);

  if (ENDIANNESS !== 'big') {
    return reverseBytes(bytes);
  }

  return bytes;
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

// TODO: should we support lacing?
export const encodeBlock = function(frame, clusterTimestamp) {
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

  return toEbmlBytes([TAGS.SimpleBlock, blockData]);
};

export const encodeCluster = function(clusterTimestamp) {
  const cluster = [TAGS.Cluster, [
    [TAGS.ClusterTimestamp, clusterTimestamp]
  ]];

  return toEbmlBytes(cluster, {infiniteLength: [TAGS.Cluster]});
};

export const initSegment = function({info, tracks}) {
  const ebmltracks = tracks.reduce(function(acc, track) {
    const ebmlTrack = [TAGS.Track, [
      [TAGS.TrackNumber, track.number],
      [TAGS.TrackUID, track.number],
      [TAGS.TrackType, TRACK_TYPE_WORD[track.type]]
    ].concat(codecToTrackEbml(track.codec))];

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

  return concatTypedArrays(
    EBML_HEADER,
    toEbmlBytes(segment, {infiniteLength: [TAGS.Segment]})
  );
};
