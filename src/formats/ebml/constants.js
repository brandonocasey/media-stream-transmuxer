export const TRACK_TYPE_NUMBER = {
  1: 'video',
  2: 'audio',
  3: 'complex',
  16: 'logo',
  17: 'subtitle',
  18: 'buttons',
  32: 'control',
  33: 'metadata'
};

export const TRACK_TYPE_WORD = Object.keys(TRACK_TYPE_NUMBER).reduce(function(acc, number) {
  acc[TRACK_TYPE_NUMBER[number]] = Number(number);

  return acc;
}, {});

export const TAGS = {
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
