import {stringToBytes, concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
const UINT32_MAX = Math.pow(2, 32) - 1;

const samplingFrequencyIndexes = [
  96000,
  88200,
  64000,
  48000,
  44100,
  32000,
  24000,
  22050,
  16000,
  12000,
  11025,
  8000,
  7350
];

const stringCache = {};
const strBytes = function(name) {
  if (stringCache[name]) {
    return stringCache[name];
  }
  const bytes = stringToBytes(name);

  stringCache[name] = bytes;

  return bytes;
};

const MINOR_VERSION = new Uint8Array([0, 0, 0, 1]);

const VIDEO_HDLR = new Uint8Array([
  // version 0
  0x00,
  // flags
  0x00, 0x00, 0x00,
  // pre_defined
  0x00, 0x00, 0x00, 0x00,
  // handler_type: 'vide'
  0x76, 0x69, 0x64, 0x65,
  // reserved
  0x00, 0x00, 0x00, 0x00,
  // reserved
  0x00, 0x00, 0x00, 0x00,
  // reserved
  0x00, 0x00, 0x00, 0x00,
  0x56, 0x69, 0x64, 0x65,
  0x6f, 0x48, 0x61, 0x6e,

  // name: 'VideoHandler'
  0x64, 0x6c, 0x65, 0x72, 0x00
]);
const AUDIO_HDLR = new Uint8Array([
  // version 0
  0x00,
  // flags
  0x00, 0x00, 0x00,
  // pre_defined
  0x00, 0x00, 0x00, 0x00,
  // handler_type: 'soun'
  0x73, 0x6f, 0x75, 0x6e,
  // reserved
  0x00, 0x00, 0x00, 0x00,
  // reserved
  0x00, 0x00, 0x00, 0x00,
  // reserved
  0x00, 0x00, 0x00, 0x00,
  0x53, 0x6f, 0x75, 0x6e,
  0x64, 0x48, 0x61, 0x6e,
  // name: 'SoundHandler'
  0x64, 0x6c, 0x65, 0x72, 0x00
]);
const HDLR_TYPES = {
  video: VIDEO_HDLR,
  audio: AUDIO_HDLR
};
const DREF = new Uint8Array([
  // version 0
  0x00,
  // flags
  0x00, 0x00, 0x00,
  // entry_count
  0x00, 0x00, 0x00, 0x01,
  // entry_size
  0x00, 0x00, 0x00, 0x0c,
  // 'url' type
  0x75, 0x72, 0x6c, 0x20,
  // version 0
  0x00,
  // entry_flags
  // entry_flags
  0x00, 0x00, 0x01
]);
const SMHD = new Uint8Array([
  // version
  0x00,
  // flags
  0x00, 0x00, 0x00,
  // balance, 0 means centered
  0x00, 0x00,
  // reserved
  0x00, 0x00
]);
const STCO = new Uint8Array([
  // version
  0x00,
  // flags
  0x00, 0x00, 0x00,
  // entry_count
  0x00, 0x00, 0x00, 0x00
]);
const STSC = STCO;
const STTS = STCO;
const STSZ = new Uint8Array([
  // version
  0x00,
  // flags
  0x00, 0x00, 0x00,
  // sample_size
  0x00, 0x00, 0x00, 0x00,
  // sample_count
  0x00, 0x00, 0x00, 0x00
]);
const VMHD = new Uint8Array([
  // version
  0x00,
  // flags
  0x00, 0x00, 0x01,
  // graphicsmode
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  // opcolor
  0x00, 0x00
]);

const box = function(type) {
  const
    payload = [];
  let size = 0;
  let i;

  for (i = 1; i < arguments.length; i++) {
    payload.push(arguments[i]);
  }

  i = payload.length;

  // calculate the total size we need to allocate
  while (i--) {
    size += payload[i].byteLength;
  }
  const result = new Uint8Array(size + 8);
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);

  view.setUint32(0, result.byteLength);
  result.set(type, 4);

  // copy the payload into the result
  for (i = 0, size = 8; i < payload.length; i++) {
    result.set(payload[i], size);
    size += payload[i].byteLength;
  }
  return result;
};

const dinf = function() {
  return box(strBytes('dinf'), box(strBytes('dref'), DREF));
};

const esds = function(track) {
  // TODO: parse in demuxer
  const objecttype = parseInt(track.codec.split('.').pop(), 10);
  // default to 2
  const audioobjecttype = typeof objecttype === 'number' && objecttype === objecttype ? objecttype : 2;
  let samplingFrequencyIndex = samplingFrequencyIndexes.indexOf(track.info.sampleRate);

  // default to 48000
  if (samplingFrequencyIndex === -1) {
    samplingFrequencyIndex = 3;
  }

  return box(strBytes('esds'), new Uint8Array([
    // version
    0x00,
    // flags
    0x00, 0x00, 0x00,

    // ES_Descriptor
    // tag, ES_DescrTag
    0x03,
    // length
    0x19,
    // ES_ID
    0x00, 0x01,
    // streamDependenceFlag, URL_flag, reserved, streamPriority
    0x00,

    // DecoderConfigDescriptor
    // tag, DecoderConfigDescrTag
    0x04,
    // length
    0x11,
    // object type
    0x40,
    // streamType
    0x15,
    // bufferSizeDB
    0x00, 0x06, 0x00,
    // maxBitrate
    0x00, 0x00, 0xda, 0xc0,
    // avgBitrate
    0x00, 0x00, 0xda, 0xc0,

    // DecoderSpecificInfo
    // tag, DecoderSpecificInfoTag
    0x05,
    // length
    0x02,
    // ISO/IEC 14496-3, AudioSpecificConfig
    // for samplingFrequencyIndex see ISO/IEC 13818-7:2006, 8.1.3.2.2, Table 35
    (audioobjecttype << 3) | (samplingFrequencyIndex >>> 1),
    (samplingFrequencyIndex << 7) | (track.info.channels << 3),
    // SLConfigDescriptor
    0x06, 0x01, 0x02
  ]));
};

const ftyp = function() {
  return box(strBytes('ftyp'), strBytes('isom'), MINOR_VERSION, strBytes('isom'), strBytes('avc1'));
};

const hdlr = function(type) {
  return box(strBytes('hdlr'), HDLR_TYPES[type]);
};
const mdat = function(data) {
  return box(strBytes('mdat'), data);
};
const mdhd = function(track) {
  const duration = track.duration && track.duration.get('ms') || 0;
  const timescale = track.timescale;

  const result = new Uint8Array([
    // version 0
    0x00,
    // flags
    0x00, 0x00, 0x00,
    // creation_time
    0x00, 0x00, 0x00, 0x02,
    // modification_time
    0x00, 0x00, 0x00, 0x03,
    (timescale & 0xFF000000) >> 24,
    (timescale & 0xFF0000) >> 16,
    (timescale & 0xFF00) >> 8,
    // timescale
    timescale & 0xFF,

    (duration >>> 24) & 0xFF,
    (duration >>> 16) & 0xFF,
    (duration >>> 8) & 0xFF,
    // duration
    duration & 0xFF,
    // 'und' language (undetermined)
    0x55, 0xc4,
    0x00, 0x00
  ]);

  // Use the sample rate from the track metadata, when it is
  // defined. The sample rate can be parsed out of an ADTS header, for
  // instance.
  if (track.info.sampleRate) {
    result[12] = (track.info.sampleRate >>> 24) & 0xFF;
    result[13] = (track.info.sampleRate >>> 16) & 0xFF;
    result[14] = (track.info.sampleRate >>> 8) & 0xFF;
    result[15] = (track.info.sampleRate) & 0xFF;
  }

  return box(strBytes('mdhd'), result);
};

const tkhd = function(track) {
  const duration = track.duration || 0;
  const width = track.info && track.info.width || 0;
  const height = track.info && track.info.height || 0;

  const result = new Uint8Array([
    // version 0
    0x00,
    // flags
    0x00, 0x00, 0x07,
    // creation_time
    0x00, 0x00, 0x00, 0x00,
    // modification_time
    0x00, 0x00, 0x00, 0x00,
    (track.number & 0xFF000000) >> 24,
    (track.number & 0xFF0000) >> 16,
    (track.number & 0xFF00) >> 8,
    // track_ID
    track.number & 0xFF,
    // reserved
    0x00, 0x00, 0x00, 0x00,
    (duration & 0xFF000000) >> 24,
    (duration & 0xFF0000) >> 16,
    (duration & 0xFF00) >> 8,
    // duration
    duration & 0xFF,
    0x00, 0x00, 0x00, 0x00,
    // reserved
    0x00, 0x00, 0x00, 0x00,
    // layer
    0x00, 0x00,
    // alternate_group
    0x00, 0x00,
    // non-audio track volume
    0x01, 0x00,
    // reserved
    0x00, 0x00,
    0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    // transformation: unity matrix
    0x40, 0x00, 0x00, 0x00,
    (width & 0xFF00) >> 8,
    width & 0xFF,
    // width
    0x00, 0x00,
    (height & 0xFF00) >> 8,
    height & 0xFF,
    // height
    0x00, 0x00
  ]);

  return box(strBytes('tkhd'), result);
};

const videoSample = function(track) {

  const avc1Box = [
    strBytes('avc1'), new Uint8Array([
      0x00, 0x00, 0x00,
      // reserved
      0x00, 0x00, 0x00,
      // data_reference_index
      0x00, 0x01,
      // pre_defined
      0x00, 0x00,
      // reserved
      0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      // pre_defined
      0x00, 0x00, 0x00, 0x00,
      (track.info.width & 0xff00) >> 8,
      // width
      track.info.width & 0xff,
      (track.info.height & 0xff00) >> 8,
      // height
      track.info.height & 0xff,
      // horizresolution
      0x00, 0x48, 0x00, 0x00,
      // vertresolution
      0x00, 0x48, 0x00, 0x00,
      // reserved
      0x00, 0x00, 0x00, 0x00,
      // frame_count
      0x00, 0x01,
      // compressorname length
      0x0b,

      // transcodejs bytes aka compressorname
      0x74, 0x72, 0x61, 0x6e,
      0x73, 0x63, 0x6f, 0x64,
      0x65, 0x6a, 0x73,

      // padding as compressorname is 31 length at minimum
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,

      // depth = 24
      0x00, 0x18,
      // pre_defined = -1
      0x11, 0x11
    ]),
    box(strBytes('avcC'), track.info.avcC),
    box(strBytes('btrt'), new Uint8Array([
      // bufferSizeDB
      0x00, 0x1c, 0x9c, 0x80,
      // maxBitrate
      0x00, 0x2d, 0xc6, 0xc0,
      // avgBitrate
      0x00, 0x2d, 0xc6, 0xc0
    ]))
  ];

  if (track.sarRatio) {
    const
      hSpacing = track.sarRatio[0];
    const vSpacing = track.sarRatio[1];

    avc1Box.push(box(strBytes('pasp'), new Uint8Array([
      (hSpacing & 0xFF000000) >> 24,
      (hSpacing & 0xFF0000) >> 16,
      (hSpacing & 0xFF00) >> 8,
      hSpacing & 0xFF,
      (vSpacing & 0xFF000000) >> 24,
      (vSpacing & 0xFF0000) >> 16,
      (vSpacing & 0xFF00) >> 8,
      vSpacing & 0xFF
    ])));
  }

  return box.apply(null, avc1Box);
};

const audioSample = function(track) {
  return box(strBytes('mp4a'), new Uint8Array([

    // SampleEntry, ISO/IEC 14496-12
    0x00, 0x00, 0x00,
    // reserved
    0x00, 0x00, 0x00,
    // data_reference_index
    0x00, 0x01,

    // AudioSampleEntry, ISO/IEC 14496-12
    // reserved
    0x00, 0x00, 0x00, 0x00,
    // reserved
    0x00, 0x00, 0x00, 0x00,
    // channelcount
    (track.info.channels & 0xff00) >> 8,
    (track.info.channels & 0xff),

    // bitDepth
    (track.info.bitDepth & 0xff00) >> 8,
    (track.info.bitDepth & 0xff),
    // pre_defined
    0x00, 0x00,
    // reserved
    0x00, 0x00,

    // sampleRate, 16.16
    (track.info.sampleRate & 0xff00) >> 8,
    (track.info.sampleRate & 0xff),
    0x00, 0x00

    // MP4AudioSampleEntry, ISO/IEC 14496-14
  ]), esds(track));
};

const stsd = function(track) {
  return box(strBytes('stsd'), new Uint8Array([
    // version 0
    0x00,
    // flags
    0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x01
  ]), track.type === 'video' ? videoSample(track) : audioSample(track));
};

const stbl = function(track) {
  return box(
    strBytes('stbl'),
    stsd(track),
    box(strBytes('stts'), STTS),
    box(strBytes('stsc'), STSC),
    box(strBytes('stsz'), STSZ),
    box(strBytes('stco'), STCO)
  );
};

const minf = function(track) {
  return box(
    strBytes('minf'),
    track.type === 'video' ? box(strBytes('vmhd'), VMHD) : box(strBytes('smhd'), SMHD),
    dinf(),
    stbl(track)
  );
};

const mdia = function(track) {
  return box(strBytes('mdia'), mdhd(track), hdlr(track.type), minf(track));
};

const trak = function(track) {
  return box(
    strBytes('trak'),
    tkhd(track),
    mdia(track)
  );
};

const trex = function(track) {
  const result = new Uint8Array([
    // version 0
    0x00,
    // flags
    0x00, 0x00, 0x00,
    // track_ID
    (track.number & 0xFF000000) >> 24,
    (track.number & 0xFF0000) >> 16,
    (track.number & 0xFF00) >> 8,
    (track.number & 0xFF),
    // default_sample_description_index
    0x00, 0x00, 0x00, 0x01,
    // default_sample_duration
    0x00, 0x00, 0x00, 0x00,
    // default_sample_size
    0x00, 0x00, 0x00, 0x00,
    // default_sample_flags
    0x00, 0x01, 0x00, 0x01
  ]);
  // the last two bytes of default_sample_flags is the sample
  // degradation priority, a hint about the importance of this sample
  // relative to others. Lower the degradation priority for all sample
  // types other than video.

  if (track.type !== 'video') {
    result[result.length - 1] = 0x00;
  }

  return box(strBytes('trex'), result);
};

// This method assumes all samples are uniform. That is, if a
// duration is present for the first sample, it will be present for
// all subsequent samples.
// see ISO/IEC 14496-12:2012, Section 8.8.8.1
const trunHeader = function(samples, firstSampleOffset) {
  let durationPresent = 0; let sizePresent = 0;
  let flagsPresent = 0; let compositionTimeOffset = 0;

  // trun flag constants
  if (samples.length) {
    if (samples[0].duration !== undefined) {
      durationPresent = 0x1;
    }
    if (samples[0].size !== undefined) {
      sizePresent = 0x2;
    }
    if (samples[0].flags !== undefined) {
      flagsPresent = 0x4;
    }
    if (samples[0].compositionTimeOffset !== undefined) {
      compositionTimeOffset = 0x8;
    }
  }

  return [
    // version 0
    0x00,
    0x00,
    durationPresent | sizePresent | flagsPresent | compositionTimeOffset,
    // flags
    0x01,
    (samples.length & 0xFF000000) >>> 24,
    (samples.length & 0xFF0000) >>> 16,
    (samples.length & 0xFF00) >>> 8,
    // sample_count
    samples.length & 0xFF,
    (firstSampleOffset & 0xFF000000) >>> 24,
    (firstSampleOffset & 0xFF0000) >>> 16,
    (firstSampleOffset & 0xFF00) >>> 8,
    // data_offset
    firstSampleOffset & 0xFF
  ];
};

const trun = function(track, mdatOffset) {
  const samples = track.samples || [];
  let sampleSize = 0;
  const has = {};

  ['duration', 'size', 'flags', 'compositionTimeOffset'].forEach(function(key) {
    if (samples[0] && samples[0].hasOwnProperty(key)) {
      sampleSize += 4;
      has[key] = true;
    } else {
      has[key] = false;
    }
  });

  const header = trunHeader(samples, mdatOffset + samples[0].dataOffset);
  const bytes = new Uint8Array(header.length + (samples.length * sampleSize));

  bytes.set(header);
  let bytesOffest = header.length;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];

    if (has.duration) {
      bytes[bytesOffest++] = (sample.duration & 0xFF000000) >>> 24;
      bytes[bytesOffest++] = (sample.duration & 0xFF0000) >>> 16;
      bytes[bytesOffest++] = (sample.duration & 0xFF00) >>> 8;
      bytes[bytesOffest++] = sample.duration & 0xFF;
    }
    if (has.size) {
      bytes[bytesOffest++] = (sample.size & 0xFF000000) >>> 24;
      bytes[bytesOffest++] = (sample.size & 0xFF0000) >>> 16;
      bytes[bytesOffest++] = (sample.size & 0xFF00) >>> 8;
      bytes[bytesOffest++] = sample.size & 0xFF;
    }

    if (has.flags) {
      bytes[bytesOffest++] = (sample.flags.isLeading << 2) | sample.flags.dependsOn;
      bytes[bytesOffest++] = (sample.flags.isDependedOn << 6) |
        (sample.flags.hasRedundancy << 4) |
        (sample.flags.paddingValue << 1) |
        sample.flags.isNonSyncSample;
      bytes[bytesOffest++] = sample.flags.degradationPriority & 0xF0 << 8;
      bytes[bytesOffest++] = sample.flags.degradationPriority & 0x0F;
    }

    if (has.compositionTimeOffset) {
      bytes[bytesOffest++] = (sample.compositionTimeOffset & 0xFF000000) >>> 24;
      bytes[bytesOffest++] = (sample.compositionTimeOffset & 0xFF0000) >>> 16;
      bytes[bytesOffest++] = (sample.compositionTimeOffset & 0xFF00) >>> 8;
      bytes[bytesOffest++] = sample.compositionTimeOffset & 0xFF;
    }
  }

  return box(strBytes('trun'), bytes);
};

const mfhd = function(sequenceNumber) {
  return box(strBytes('mfhd'), new Uint8Array([
    0x00,
    // flags
    0x00, 0x00, 0x00,
    (sequenceNumber & 0xFF000000) >> 24,
    (sequenceNumber & 0xFF0000) >> 16,
    (sequenceNumber & 0xFF00) >> 8,
    // sequence_number
    sequenceNumber & 0xFF
  ]));
};

const sdtp = function(track) {
  const
    samples = track.samples || [];
  const bytes = new Uint8Array(4 + samples.length);
  let flags;
  let i;

  // leave the full box header (4 bytes) all zero

  // write the sample table
  for (i = 0; i < samples.length; i++) {
    flags = samples[i].flags;

    bytes[i + 4] = (flags.dependsOn << 4) |
      (flags.isDependedOn << 2) |
      (flags.hasRedundancy);
  }

  return box(
    strBytes('sdtp'),
    bytes
  );
};

const sampleSize = (samples) => ['duration', 'size', 'flags', 'compositionTimeOffset'].reduce(function(acc, key) {
  if (samples[0] && samples[0].hasOwnProperty(key)) {
    acc += 4;
  }

  return acc;
}, 0);

const trafSize = function(track) {
  // traf tag/length + tfhd  + tfdt + trun header + trun data + sdtp for video
  return 8 + 32 + 20 + 20 +
    (sampleSize(track.samples) * track.samples.length) +
    (track.type === 'video' ? (12 + track.samples.length) : 0);
};

const traf = function(track, mdatOffset) {
  const baseMediaDecodeTime = track.samples[0].timestamp;
  const upperWordBaseMediaDecodeTime = Math.floor(baseMediaDecodeTime / (UINT32_MAX + 1));
  const lowerWordBaseMediaDecodeTime = Math.floor(baseMediaDecodeTime % (UINT32_MAX + 1));

  const boxDatas = [
    strBytes('traf'),
    box(strBytes('tfhd'), new Uint8Array([
      // version 0
      0x00,
      // flags
      0x00, 0x00, 0x3a,
      (track.number & 0xFF000000) >> 24,
      (track.number & 0xFF0000) >> 16,
      (track.number & 0xFF00) >> 8,
      // track_ID
      (track.number & 0xFF),
      // sample_description_index
      0x00, 0x00, 0x00, 0x01,
      // default_sample_duration
      0x00, 0x00, 0x00, 0x00,
      // default_sample_size
      0x00, 0x00, 0x00, 0x00,
      // default_sample_flags
      0x00, 0x00, 0x00, 0x00
    ])),
    box(strBytes('tfdt'), new Uint8Array([
      // version 1
      0x01,
      // flags
      0x00, 0x00, 0x00,
      // baseMediaDecodeTime
      (upperWordBaseMediaDecodeTime >>> 24) & 0xFF,
      (upperWordBaseMediaDecodeTime >>> 16) & 0xFF,
      (upperWordBaseMediaDecodeTime >>> 8) & 0xFF,
      upperWordBaseMediaDecodeTime & 0xFF,
      (lowerWordBaseMediaDecodeTime >>> 24) & 0xFF,
      (lowerWordBaseMediaDecodeTime >>> 16) & 0xFF,
      (lowerWordBaseMediaDecodeTime >>> 8) & 0xFF,
      lowerWordBaseMediaDecodeTime & 0xFF
    ])),
    trun(track, mdatOffset)
  ];

  // video tracks should contain an independent and disposable samples
  // box (sdtp)
  if (track.type === 'video') {
    boxDatas.push(sdtp(track));
  }

  return box.apply(null, boxDatas);
};

const mvex = function(tracks) {
  let
    i = tracks.length;
  const boxes = [];

  while (i--) {
    boxes[i] = trex(tracks[i]);
  }
  return box.apply(null, [strBytes('mvex')].concat(boxes));
};
const mvhd = function(tracks, info) {
  const duration = info.duration.get('ms');
  const timescale = info.timestampScale.get('ms');
  const nextTrack = tracks.length + 1;

  const
    bytes = new Uint8Array([
      // version 0
      0x00,
      // flags
      0x00, 0x00, 0x00,
      // creation_time
      0x00, 0x00, 0x00, 0x01,
      // modification_time
      0x00, 0x00, 0x00, 0x02,

      // timescale
      (timescale & 0xFF000000) >> 24,
      (timescale & 0xFF0000) >> 16,
      (timescale & 0xFF00) >> 8,
      timescale & 0xFF,
      // duration
      (duration & 0xFF000000) >> 24,
      (duration & 0xFF0000) >> 16,
      (duration & 0xFF00) >> 8,
      // duration
      duration & 0xFF,
      // 1.0 rate
      0x00, 0x01, 0x00, 0x00,
      // 1.0 volume
      0x01, 0x00,
      // reserved
      0x00, 0x00,
      // reserved
      0x00, 0x00, 0x00, 0x00,
      // reserved
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      // transformation: unity matrix
      0x40, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      // pre_defined
      0x00, 0x00, 0x00, 0x00,
      // next_track_id
      (nextTrack & 0xFF000000) >> 24,
      (nextTrack & 0xFF0000) >> 16,
      (nextTrack & 0xFF00) >> 8,
      nextTrack & 0xFF
    ]);

  return box(strBytes('mvhd'), bytes);
};

const moof = function(sequenceNumber, tracks) {
  const
    trackFragments = [];
  let i = tracks.length;
  // build traf boxes for each track fragment
  const mfhd_ = mfhd(sequenceNumber);

  // start with mfhd + 8 byte moof tag & length
  // + 8 byte mdat tag and length
  let mdatOffset = mfhd_.length + 8 + 8;

  // pre calculate traf sizes so we have
  // an mdatOffset for trun
  while (i--) {
    mdatOffset += trafSize(tracks[i], 0);
  }

  i = tracks.length;

  while (i--) {
    trackFragments.push(traf(tracks[i], mdatOffset));
  }

  return box.apply(null, [
    strBytes('moof'),
    mfhd_
  ].concat(trackFragments));
};
const moov = function({tracks, info}) {
  let
    i = tracks.length;
  const boxes = [];

  while (i--) {
    boxes[i] = trak(tracks[i]);
  }

  return box.apply(null, [strBytes('moov'), mvhd(tracks, info)].concat(boxes).concat(mvex(tracks)));
};

export const initSegment = function({tracks, info}) {
  const
    fileType = ftyp();
  const movie = moov({tracks, info});

  const result = new Uint8Array(fileType.byteLength + movie.byteLength);

  result.set(fileType);
  result.set(movie, fileType.byteLength);
  return result;
};

const createDefaultSample = function() {
  return {
    size: 0,
    flags: {
      isLeading: 0,
      dependsOn: 1,
      isDependedOn: 0,
      hasRedundancy: 0,
      degradationPriority: 0,
      isNonSyncSample: 1
    }
  };
};

const sampleForFrame = function(trackTimescale, frame, dataOffset) {
  const sample = createDefaultSample();

  sample.dataOffset = dataOffset;
  sample.compositionTimeOffset = 0;
  sample.duration = frame.duration.get('ms');
  sample.timestamp = frame.timestamp.get('ms');

  sample.size = frame.data.length;

  if (frame.keyframe) {
    sample.flags.dependsOn = 2;
    sample.flags.isNonSyncSample = 0;
  }

  return sample;
};

export const dataSegment = function({sequenceNumber, tracks, frames, info}) {
  const trackTable = {};
  // set track defaults

  tracks.forEach(function(track) {
    track.samples = track.samples || [];
    track.samples.length = 0;
    trackTable[track.number] = track;
  });
  let offset = 0;

  frames.forEach(function(frame) {
    const track = trackTable[frame.trackNumber];
    const sample = sampleForFrame(track.timescale, frame, offset);

    track.samples.push(sample);

    offset += sample.size;
  });

  if (!tracks.every((t) => t.samples.length)) {
    return;
  }
  const frameData = concatTypedArrays.apply(null, frames.map((f) => f.data));
  const result = concatTypedArrays(
    moof(sequenceNumber, tracks),
    mdat(frameData)
  );

  return result;
};
