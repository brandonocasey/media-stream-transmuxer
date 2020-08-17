import {
  concatTypedArrays,
  stringToBytes,
  numberToBytes,
  isTypedArray,
  bytesMatch
} from '@videojs/vhs-utils/dist/byte-helpers.js';
import {TAGS, TRACK_TYPE_WORD} from './constants.js';
import {set as setvint} from './vint.js';
import {trackCodecEbml} from './codec-translator.js';
import {transcodejs} from '../../byte-constants';

const setint16bytes = function(value) {
  const dv = new DataView(new ArrayBuffer(2));

  dv.setInt16(0, value);

  return new Uint8Array(dv.buffer);
};

const setFloat64 = function(value) {
  const dv = new DataView(new ArrayBuffer(8));

  dv.setFloat64(0, value);

  return new Uint8Array(dv.buffer);
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
    data = numberToBytes(Math.floor(value));
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
    ].concat(trackCodecEbml(track))];

    if (track.type === 'video') {
      ebmlTrack[1].push([TAGS.Video, [
        [TAGS.PixelWidth, track.info.width],
        [TAGS.PixelHeigth, track.info.heigth]
      ]]);
    } else {
      ebmlTrack[1].push([TAGS.Audio, [
        [TAGS.Channels, track.info.channels || 2],
        [TAGS.SamplingFrequency, setFloat64(track.info.sampleRate)],
        [TAGS.BitDepth, track.info.bitDepth || 32]
      ]]);
    }

    if (track.defaultDuration) {
      ebmlTrack[1].push([TAGS.DefaultDuration, track.defaultDuration]);
    }

    if (track.info.codecDelay) {
      ebmlTrack[1].push([TAGS.CodecDelay, track.info.codecDelay]);
    }

    if (track.seekPreRoll) {
      ebmlTrack[1].push([TAGS.SeekPreRoll, track.seekPreRoll]);
    }

    acc.push(ebmlTrack);
    return acc;
  }, []);

  const segment = [TAGS.Segment, [
    [TAGS.SegmentInformation, [
      [TAGS.TimestampScale, info.timestampScale.get('ns')],
      [TAGS.SegmentDuration, setFloat64(info.duration)],
      [TAGS.MuxingApp, new Uint8Array(transcodejs)],
      [TAGS.WritingApp, new Uint8Array(transcodejs)]
    ]],
    [TAGS.Tracks, ebmltracks]
  ]];

  return concatTypedArrays(
    EBML_HEADER,
    toEbmlBytes(segment, {infiniteLength: [TAGS.Segment]})
  );
};
