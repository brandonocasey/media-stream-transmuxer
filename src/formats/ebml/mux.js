import {
  concatTypedArrays,
  stringToBytes,
  numberToBytes,
  isTypedArray,
  ENDIANNESS
} from '@videojs/vhs-utils/dist/byte-helpers.js';

const setint16bytes = function(value) {
  const bytes = new Uint8Array(new Int16Array([value]).buffer);

  if (ENDIANNESS !== 'big') {
    return new Uint8Array(Array.prototype.slice.call(bytes).reverse());
  }

  return bytes;
};

const T = {
  // EBML
  EBML: [0x1a, 0x45, 0xdf, 0xa3],
  Version: [0x42, 0x86],
  EBMLReadVersion: [0x42, 0xf7],
  EBMLMaxIDLength: [0x42, 0xf2],
  EBMLMaxSizeLength: [0x42, 0xf3],
  DocType: [0x42, 0x82],
  DocTypeVersion: [0x42, 0x87],
  DocTypeReadVersion: [0x42, 0x85],

  // Segment
  Segment: [0x18, 0x53, 0x80, 0x67],
  SegmentInformation: [0x15, 0x49, 0xa9, 0x66],
  SegmentDuration: [0x44, 0x89],
  TimestampScale: [0x2a, 0xd7, 0xb1],
  MuxingApp: [0x4d, 0x80],
  WritingApp: [0x57, 0x41],

  // Tracks
  Tracks: [0x16, 0x54, 0xae, 0x6b],
  Track: [0xae],
  TrackNumber: [0xd7],
  TrackUID: [0x73, 0xc5],
  TrackType: [0x83],
  CodecID: [0x86],
  CodecDelay: [0x56, 0xAA],
  DefaultDuration: [0x23, 0xe3, 0x83],
  SeekPreRoll: [0x56, 0xBB],

  Video: [0xe0],
  PixelWidth: [0xb0],
  PixelHeigth: [0xba],

  Audio: [0xe1],
  Channels: [0x9f],
  SamplingFrequency: [0xb5],
  BitDepth: [0x62, 0x64],

  // Cluster
  Cluster: [0x1f, 0x43, 0xb6, 0x75],
  ClusterTimestamp: [0xe7],
  SimpleBlock: [0xa3]
};

const TRACK_TYPES = {
  video: 1,
  audio: 2,
  complex: 3,
  logo: 16,
  subtitle: 17,
  buttons: 18,
  control: 32,
  metadata: 33
};

const LENGTH_TABLE = [
  0b10000000,
  0b01000000,
  0b00100000,
  0b00010000,
  0b00001000,
  0b00000100,
  0b00000010,
  0b00000001
];

const setvint = function(number) {
  const length = Math.ceil(number.toString(2).length / 7);
  let vint = numberToBytes(number);

  // if we don't have enough space for the full length
  // add length as its own byte
  if (length !== vint.length) {
    vint = concatTypedArrays([LENGTH_TABLE[length - 1]], vint);
  // otherwise add length to the first byte
  } else {
    vint[0] |= 1 << (8 - length);
  }

  return vint;
};

const encodeBlocks = function(frames, clusterTimestamp) {
  return frames.reduce((acc, frame) => {
    let flagByte = 0;

    if (frame.keyframe) {
      flagByte |= 0b10000000;
    }

    if (frame.invisible) {
      flagByte |= 0b00001000;
    }

    /* TODO: should we support lacing?
    if (frame.lacing === 'xiph') {
      flagByte |= 0b00000100;
    } else if (frame.lacing === 'ebml') {
      flagByte |= 0b00000110;
    } else if (frame.lacing === 'fixed') {
      flagByte |= 0b00000010;
    }*/

    if (frame.discardable) {
      flagByte |= 0b00000001;
    }

    const blockData = concatTypedArrays(
      setvint(frame.trackNumber),
      setint16bytes(frame.timestamp - clusterTimestamp),
      [flagByte],
      frame.data
    );

    acc.push([T.SimpleBlock, blockData]);

    return acc;
  }, []);
};

const toBytes = function([tag, value]) {
  let data = value;

  if (Array.isArray(value) && !isTypedArray(value)) {
    data = value.reduce((acc, subobject) => {
      acc = concatTypedArrays(acc, toBytes(subobject));
      return acc;
    }, new Uint8Array());
  } else if (typeof value === 'string') {
    data = stringToBytes(value);
  } else if (typeof value === 'number') {
    data = numberToBytes(value);
  }

  return concatTypedArrays(
    tag,
    setvint(data.length),
    data
  );
};

const EBML_HEADER = toBytes([T.EBML, [
  [T.Version, 1],
  [T.EBMLReadVersion, 1],
  [T.EBMLMaxIDLength, 4],
  [T.EBMLMaxSizeLength, 8],
  [T.DocType, 'webm'],
  [T.DocTypeVersion, 2],
  [T.DocTypeReadVersion, 2]
]]);

const CODECS = {
  vp9: 'V_VP9',
  opus: 'A_OPUS'
};

const encodeClusters = function(frames, state, flush) {
  const clusters = [];
  const keyframes = [];

  if (state.frames) {
    frames = [].concat(state.frames).concat(frames);
  }

  // TODO: clusters should start with a keyframe for each track
  // handle that here
  for (let i = 0; i < frames.length; i++) {
    const curr = frames[i];

    if (curr.keyframe) {
      keyframes.push(i);
    }
  }

  // makes sure we always have a keyframe
  // leftover
  if (!flush) {
    if (keyframes.length <= 1) {
      state.frames = frames;
      return clusters;
    }

    const lastkey = keyframes.pop();

    state.frames = frames.slice(lastkey);
    frames = frames.slice(0, lastkey - 1);
  }
  const clusterTimestamp = frames[0].timestamp;
  const blocks = encodeBlocks(frames, clusterTimestamp);

  clusters.push([T.Cluster, [
    [T.ClusterTimestamp, clusterTimestamp]
  ].concat(blocks)]);

  return clusters;
};

const generateEBML = function({tracks, frames, cues, info}, state, flush) {
  const clusters = encodeClusters(frames, state, flush);
  const ebmltracks = tracks.reduce(function(acc, track) {
    const ebmlTrack = [T.Track, [
      [T.TrackNumber, track.number],
      [T.TrackUID, track.number],
      [T.TrackType, TRACK_TYPES[track.type]],
      [T.CodecID, CODECS[track.codec]]
    ]];

    if (track.type === 'video') {
      ebmlTrack[1].push([T.Video, [
        [T.PixelWidth, track.info.width],
        [T.PixelHeigth, track.info.heigth]
      ]]);
    } else {
      ebmlTrack[1].push([T.Audio, [
        [T.Channels, track.info.channels],
        [T.SamplingFrequency, track.info.samplingFrequency],
        [T.BitDepth, track.info.bitDepth]
      ]]);
    }

    if (track.defaultDuration) {
      ebmlTrack[1].push([T.DefaultDuration, track.defaultDuration]);
    }

    if (track.codecDelay) {
      ebmlTrack[1].push([T.CodecDelay, track.codecDelay]);
    }

    if (track.seekPreRoll) {
      ebmlTrack[1].push([T.SeekPreRoll, track.seekPreRoll]);
    }

    acc.push(ebmlTrack);
    return acc;
  }, []);

  const dv = new DataView(new ArrayBuffer(8));

  dv.setFloat64(0, info.duration);

  const segment = [T.Segment, [
    [T.SegmentInformation, [
      [T.TimestampScale, info.timestampScale],
      [T.SegmentDuration, new Uint8Array(dv.buffer)],
      [T.MuxingApp, 'transcodejs'],
      [T.WritingApp, 'transcodejs']
    ]],
    [T.Tracks, ebmltracks]
  ]];

  if (clusters && clusters.length) {
    segment[1] = segment[1].concat(clusters);
  }

  return concatTypedArrays(EBML_HEADER, toBytes(segment));

};

export default generateEBML;
