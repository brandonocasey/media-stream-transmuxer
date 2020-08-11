import {stringToBytes, concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
const UINT32_MAX = Math.pow(2, 32) - 1;

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
  0x00, // version 0
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // pre_defined
  0x76, 0x69, 0x64, 0x65, // handler_type: 'vide'
  0x00, 0x00, 0x00, 0x00, // reserved
  0x00, 0x00, 0x00, 0x00, // reserved
  0x00, 0x00, 0x00, 0x00, // reserved
  0x56, 0x69, 0x64, 0x65,
  0x6f, 0x48, 0x61, 0x6e,
  0x64, 0x6c, 0x65, 0x72, 0x00 // name: 'VideoHandler'
]);
const AUDIO_HDLR = new Uint8Array([
  0x00, // version 0
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // pre_defined
  0x73, 0x6f, 0x75, 0x6e, // handler_type: 'soun'
  0x00, 0x00, 0x00, 0x00, // reserved
  0x00, 0x00, 0x00, 0x00, // reserved
  0x00, 0x00, 0x00, 0x00, // reserved
  0x53, 0x6f, 0x75, 0x6e,
  0x64, 0x48, 0x61, 0x6e,
  0x64, 0x6c, 0x65, 0x72, 0x00 // name: 'SoundHandler'
]);
const HDLR_TYPES = {
  video: VIDEO_HDLR,
  audio: AUDIO_HDLR
};
const DREF = new Uint8Array([
  0x00, // version 0
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x01, // entry_count
  0x00, 0x00, 0x00, 0x0c, // entry_size
  0x75, 0x72, 0x6c, 0x20, // 'url' type
  0x00, // version 0
  0x00, 0x00, 0x01 // entry_flags
]);
const SMHD = new Uint8Array([
  0x00,             // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00,       // balance, 0 means centered
  0x00, 0x00        // reserved
]);
const STCO = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00 // entry_count
]);
const STSC = STCO;
const STTS = STCO;
const STSZ = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x00, // flags
  0x00, 0x00, 0x00, 0x00, // sample_size
  0x00, 0x00, 0x00, 0x00 // sample_count
]);
const VMHD = new Uint8Array([
  0x00, // version
  0x00, 0x00, 0x01, // flags
  0x00, 0x00, // graphicsmode
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00 // opcolor
]);

const box = function(type) {
  var
  payload = [],
    size = 0,
    i,
    result,
    view;

  for (i = 1; i < arguments.length; i++) {
    payload.push(arguments[i]);
  }

  i = payload.length;

  // calculate the total size we need to allocate
  while (i--) {
    size += payload[i].byteLength;
  }
  result = new Uint8Array(size + 8);
  view = new DataView(result.buffer, result.byteOffset, result.byteLength);
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
  return box(strBytes('esds'), new Uint8Array([
    0x00, // version
    0x00, 0x00, 0x00, // flags

    // ES_Descriptor
    0x03, // tag, ES_DescrTag
    0x19, // length
    0x00, 0x00, // ES_ID
    0x00, // streamDependenceFlag, URL_flag, reserved, streamPriority

    // DecoderConfigDescriptor
    0x04, // tag, DecoderConfigDescrTag
    0x11, // length
    0x40, // object type
    0x15,  // streamType
    0x00, 0x06, 0x00, // bufferSizeDB
    0x00, 0x00, 0xda, 0xc0, // maxBitrate
    0x00, 0x00, 0xda, 0xc0, // avgBitrate

    // DecoderSpecificInfo
    0x05, // tag, DecoderSpecificInfoTag
    0x02, // length
    // ISO/IEC 14496-3, AudioSpecificConfig
    // for samplingFrequencyIndex see ISO/IEC 13818-7:2006, 8.1.3.2.2, Table 35
    (track.info.audioobjecttype << 3) | (track.info.samplingfrequencyindex >>> 1),
    (track.info.samplingfrequencyindex << 7) | (track.info.channelcount << 3),
    0x06, 0x01, 0x02 // GASpecificConfig
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
  const duration = track.duration || 0;
  const timescale = track.timescale;

  var result = new Uint8Array([
    0x00,                   // version 0
    0x00, 0x00, 0x00,       // flags
    0x00, 0x00, 0x00, 0x02, // creation_time
    0x00, 0x00, 0x00, 0x03, // modification_time
    (timescale & 0xFF000000) >> 24,
    (timescale & 0xFF0000) >> 16,
    (timescale & 0xFF00) >> 8,
    timescale & 0xFF, // timescale

    (duration >>> 24) & 0xFF,
    (duration >>> 16) & 0xFF,
    (duration >>>  8) & 0xFF,
    duration & 0xFF,  // duration
    0x55, 0xc4,             // 'und' language (undetermined)
    0x00, 0x00
  ]);

  // Use the sample rate from the track metadata, when it is
  // defined. The sample rate can be parsed out of an ADTS header, for
  // instance.
  if (track.info.samplerate) {
    result[12] = (track.info.samplerate >>> 24) & 0xFF;
    result[13] = (track.info.samplerate >>> 16) & 0xFF;
    result[14] = (track.info.samplerate >>>  8) & 0xFF;
    result[15] = (track.info.samplerate)        & 0xFF;
  }

  return box(strBytes('mdhd'), result);
};
const mdia = function(track) {
  return box(strBytes('mdia'), mdhd(track), hdlr(track.type), minf(track));
};
const mfhd = function(sequenceNumber) {
  return box(strBytes('mfhd'), new Uint8Array([
    0x00,
    0x00, 0x00, 0x00, // flags
    (sequenceNumber & 0xFF000000) >> 24,
    (sequenceNumber & 0xFF0000) >> 16,
    (sequenceNumber & 0xFF00) >> 8,
    sequenceNumber & 0xFF // sequence_number
  ]));
};
const minf = function(track) {
  return box(strBytes('minf'),
    track.type === 'video' ? box(strBytes('vmhd'), VMHD) : box(strBytes('smhd'), SMHD),
    dinf(),
    stbl(track));
};
const moof = function(sequenceNumber, tracks) {
  var
  trackFragments = [],
    i = tracks.length;
  // build traf boxes for each track fragment
  while (i--) {
    trackFragments[i] = traf(tracks[i]);
  }
  return box.apply(null, [
    strBytes('moof'),
    mfhd(sequenceNumber)
  ].concat(trackFragments));
};
const moov = function({tracks, info}) {
  var
  i = tracks.length,
    boxes = [];

  while (i--) {
    boxes[i] = trak(tracks[i]);
  }

  return box.apply(null, [strBytes('moov'), mvhd(tracks, info)].concat(boxes).concat(mvex(tracks)));
};
const mvex = function(tracks) {
  var
  i = tracks.length,
    boxes = [];

  while (i--) {
    boxes[i] = trex(tracks[i]);
  }
  return box.apply(null, [strBytes('mvex')].concat(boxes));
};
const mvhd = function(tracks, info) {
  // TODO: should we use info.duration here??
  const duration = info.duration;
  const timescale = 1000;
  const nextTrack = tracks.length + 1;
  var
  bytes = new Uint8Array([
    0x00, // version 0
    0x00, 0x00, 0x00, // flags
    0x00, 0x00, 0x00, 0x01, // creation_time
    0x00, 0x00, 0x00, 0x02, // modification_time

    (timescale & 0xFF000000) >> 24,
    (timescale & 0xFF0000) >> 16,
    (timescale & 0xFF00) >> 8,
    timescale & 0xFF, // duration
    (duration & 0xFF000000) >> 24,
    (duration & 0xFF0000) >> 16,
    (duration & 0xFF00) >> 8,
    duration & 0xFF, // duration
    0x00, 0x01, 0x00, 0x00, // 1.0 rate
    0x01, 0x00, // 1.0 volume
    0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00, // transformation: unity matrix
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // pre_defined
    (nextTrack & 0xFF000000) >> 24,
    (nextTrack & 0xFF0000) >> 16,
    (nextTrack & 0xFF00) >> 8,
    nextTrack & 0xFF, // next_track_id
  ]);
  return box(strBytes('mvhd'), bytes);
};

const sdtp = function(track) {
  var
  samples = track.samples || [],
    bytes = new Uint8Array(4 + samples.length),
    flags,
    i;

  // leave the full box header (4 bytes) all zero

  // write the sample table
  for (i = 0; i < samples.length; i++) {
    flags = samples[i].flags;

    bytes[i + 4] = (flags.dependsOn << 4) |
      (flags.isDependedOn << 2) |
      (flags.hasRedundancy);
  }

  return box(strBytes('sdtp'),
    bytes);
};

const stbl = function(track) {
  return box(strBytes('stbl'),
    stsd(track),
    box(strBytes('stts'), STTS),
    box(strBytes('stsc'), STSC),
    box(strBytes('stsz'), STSZ),
    box(strBytes('stco'), STCO));
};

const stsd = function(track) {
  return box(strBytes('stsd'), new Uint8Array([
    0x00, // version 0
    0x00, 0x00, 0x00, // flags
    0x00, 0x00, 0x00, 0x01
  ]), track.type === 'video' ? videoSample(track) : audioSample(track));
};

const videoSample = function(track) {
  var
  sps = track.sps || [],
    pps = track.pps || [],
    sequenceParameterSets = [],
    pictureParameterSets = [],
    i,
    avc1Box;

  // assemble the SPSs
  for (i = 0; i < sps.length; i++) {
    sequenceParameterSets.push((sps[i].byteLength & 0xFF00) >>> 8);
    sequenceParameterSets.push((sps[i].byteLength & 0xFF)); // sequenceParameterSetLength
    sequenceParameterSets = sequenceParameterSets.concat(Array.prototype.slice.call(sps[i])); // SPS
  }

  // assemble the PPSs
  for (i = 0; i < pps.length; i++) {
    pictureParameterSets.push((pps[i].byteLength & 0xFF00) >>> 8);
    pictureParameterSets.push((pps[i].byteLength & 0xFF));
    pictureParameterSets = pictureParameterSets.concat(Array.prototype.slice.call(pps[i]));
  }

  avc1Box = [
    strBytes('avc1'), new Uint8Array([
      0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // data_reference_index
      0x00, 0x00, // pre_defined
      0x00, 0x00, // reserved
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // pre_defined
      (track.width & 0xff00) >> 8,
      track.width & 0xff, // width
      (track.height & 0xff00) >> 8,
      track.height & 0xff, // height
      0x00, 0x48, 0x00, 0x00, // horizresolution
      0x00, 0x48, 0x00, 0x00, // vertresolution
      0x00, 0x00, 0x00, 0x00, // reserved
      0x00, 0x01, // frame_count
      0x13,
      0x76, 0x69, 0x64, 0x65,
      0x6f, 0x6a, 0x73, 0x2d,
      0x63, 0x6f, 0x6e, 0x74,
      0x72, 0x69, 0x62, 0x2d,
      0x68, 0x6c, 0x73, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, // compressorname
      0x00, 0x18, // depth = 24
      0x11, 0x11 // pre_defined = -1
    ]),
    box(strBytes('avcC'), new Uint8Array([
      0x01, // configurationVersion
      track.profileIdc, // AVCProfileIndication
      track.profileCompatibility, // profile_compatibility
      track.levelIdc, // AVCLevelIndication
      0xff // lengthSizeMinusOne, hard-coded to 4 bytes
    ].concat(
      [sps.length], // numOfSequenceParameterSets
      sequenceParameterSets, // "SPS"
      [pps.length], // numOfPictureParameterSets
      pictureParameterSets // "PPS"
    ))),
    box(strBytes('btrt'), new Uint8Array([
      0x00, 0x1c, 0x9c, 0x80, // bufferSizeDB
      0x00, 0x2d, 0xc6, 0xc0, // maxBitrate
      0x00, 0x2d, 0xc6, 0xc0 // avgBitrate
    ]))
  ];

  if (track.sarRatio) {
    var
    hSpacing = track.sarRatio[0],
      vSpacing = track.sarRatio[1];

    avc1Box.push(
      box(strBytes('pasp'), new Uint8Array([
        (hSpacing & 0xFF000000) >> 24,
        (hSpacing & 0xFF0000) >> 16,
        (hSpacing & 0xFF00) >> 8,
        hSpacing & 0xFF,
        (vSpacing & 0xFF000000) >> 24,
        (vSpacing & 0xFF0000) >> 16,
        (vSpacing & 0xFF00) >> 8,
        vSpacing & 0xFF
      ]))
    );
  }

  return box.apply(null, avc1Box);
};

const audioSample = function(track) {
  return box(strBytes('mp4a'), new Uint8Array([

    // SampleEntry, ISO/IEC 14496-12
    0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, // reserved
    0x00, 0x01, // data_reference_index

    // AudioSampleEntry, ISO/IEC 14496-12
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    (track.info.channelcount & 0xff00) >> 8,
    (track.info.channelcount & 0xff), // channelcount

    (track.info.samplesize & 0xff00) >> 8,
    (track.info.samplesize & 0xff), // samplesize
    0x00, 0x00, // pre_defined
    0x00, 0x00, // reserved

    (track.info.samplerate & 0xff00) >> 8,
    (track.info.samplerate & 0xff),
    0x00, 0x00 // samplerate, 16.16

    // MP4AudioSampleEntry, ISO/IEC 14496-14
  ]), esds(track));
};

const tkhd = function(track) {
  const duration = track.duration || 0;
  const width = track.info && track.info.width || 0;
  const height = track.info && track.info.height || 0;

  var result = new Uint8Array([
    0x00, // version 0
    0x00, 0x00, 0x07, // flags
    0x00, 0x00, 0x00, 0x00, // creation_time
    0x00, 0x00, 0x00, 0x00, // modification_time
    (track.number & 0xFF000000) >> 24,
    (track.number & 0xFF0000) >> 16,
    (track.number & 0xFF00) >> 8,
    track.number & 0xFF, // track_ID
    0x00, 0x00, 0x00, 0x00, // reserved
    (duration & 0xFF000000) >> 24,
    (duration & 0xFF0000) >> 16,
    (duration & 0xFF00) >> 8,
    duration & 0xFF, // duration
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, // layer
    0x00, 0x00, // alternate_group
    0x01, 0x00, // non-audio track volume
    0x00, 0x00, // reserved
    0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00, // transformation: unity matrix
    (width & 0xFF00) >> 8,
    width & 0xFF,
    0x00, 0x00, // width
    (height & 0xFF00) >> 8,
    height & 0xFF,
    0x00, 0x00 // height
  ]);

  return box(strBytes('tkhd'), result);
};

const traf = function(track) {
  var trackFragmentHeader, trackFragmentDecodeTime, trackFragmentRun,
    sampleDependencyTable, dataOffset,
    upperWordBaseMediaDecodeTime, lowerWordBaseMediaDecodeTime;

  trackFragmentHeader = box(strBytes('tfhd'), new Uint8Array([
    0x00, // version 0
    0x00, 0x00, 0x3a, // flags
    (track.number & 0xFF000000) >> 24,
    (track.number & 0xFF0000) >> 16,
    (track.number & 0xFF00) >> 8,
    (track.number & 0xFF), // track_ID
    0x00, 0x00, 0x00, 0x01, // sample_description_index
    0x00, 0x00, 0x00, 0x00, // default_sample_duration
    0x00, 0x00, 0x00, 0x00, // default_sample_size
    0x00, 0x00, 0x00, 0x00  // default_sample_flags
  ]));

  // TODO: based on video or some shit??
  upperWordBaseMediaDecodeTime = Math.floor(track.baseMediaDecodeTime / (UINT32_MAX + 1));
  lowerWordBaseMediaDecodeTime = Math.floor(track.baseMediaDecodeTime % (UINT32_MAX + 1));

  trackFragmentDecodeTime = box(strBytes('tfdt'), new Uint8Array([
    0x01, // version 1
    0x00, 0x00, 0x00, // flags
    // baseMediaDecodeTime
    (upperWordBaseMediaDecodeTime >>> 24) & 0xFF,
    (upperWordBaseMediaDecodeTime >>> 16) & 0xFF,
    (upperWordBaseMediaDecodeTime >>>  8) & 0xFF,
    upperWordBaseMediaDecodeTime & 0xFF,
    (lowerWordBaseMediaDecodeTime >>> 24) & 0xFF,
    (lowerWordBaseMediaDecodeTime >>> 16) & 0xFF,
    (lowerWordBaseMediaDecodeTime >>>  8) & 0xFF,
    lowerWordBaseMediaDecodeTime & 0xFF
  ]));

  // the data offset specifies the number of bytes from the start of
  // the containing moof to the first payload byte of the associated
  // mdat
  dataOffset = (32 + // tfhd
    20 + // tfdt
    8 +  // traf header
    16 + // mfhd
    8 +  // moof header
    8);  // mdat header

  // audio tracks require less metadata
  if (track.type === 'audio') {
    trackFragmentRun = trun(track, dataOffset);
    return box(strBytes('traf'),
      trackFragmentHeader,
      trackFragmentDecodeTime,
      trackFragmentRun);
  }

  // video tracks should contain an independent and disposable samples
  // box (sdtp)
  // generate one and adjust offsets to match
  sampleDependencyTable = sdtp(track);
  trackFragmentRun = trun(track,
    sampleDependencyTable.length + dataOffset);
  return box(strBytes('traf'),
    trackFragmentHeader,
    trackFragmentDecodeTime,
    trackFragmentRun,
    sampleDependencyTable);
};

const trak = function(track) {
  return box(strBytes('trak'),
    tkhd(track),
    mdia(track));
};

const trex = function(track) {
  var result = new Uint8Array([
    0x00, // version 0
    0x00, 0x00, 0x00, // flags
    (track.number & 0xFF000000) >> 24,
    (track.number & 0xFF0000) >> 16,
    (track.number & 0xFF00) >> 8,
    (track.number & 0xFF), // track_ID
    0x00, 0x00, 0x00, 0x01, // default_sample_description_index
    0x00, 0x00, 0x00, 0x00, // default_sample_duration
    0x00, 0x00, 0x00, 0x00, // default_sample_size
    0x00, 0x01, 0x00, 0x01 // default_sample_flags
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
const trunHeader = function(samples, offset) {
  var durationPresent = 0, sizePresent = 0,
    flagsPresent = 0, compositionTimeOffset = 0;

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
    0x00, // version 0
    0x00,
    durationPresent | sizePresent | flagsPresent | compositionTimeOffset,
    0x01, // flags
    (samples.length & 0xFF000000) >>> 24,
    (samples.length & 0xFF0000) >>> 16,
    (samples.length & 0xFF00) >>> 8,
    samples.length & 0xFF, // sample_count
    (offset & 0xFF000000) >>> 24,
    (offset & 0xFF0000) >>> 16,
    (offset & 0xFF00) >>> 8,
    offset & 0xFF // data_offset
  ];
};

const videoTrun = function(track, offset) {
  var bytesOffest, bytes, header, samples, sample, i;

  samples = track.samples || [];
  offset += 8 + 12 + (16 * samples.length);
  header = trunHeader(samples, offset);
  bytes = new Uint8Array(header.length + samples.length * 16);
  bytes.set(header);
  bytesOffest = header.length;

  for (i = 0; i < samples.length; i++) {
    sample = samples[i];

    bytes[bytesOffest++] = (sample.duration & 0xFF000000) >>> 24;
    bytes[bytesOffest++] = (sample.duration & 0xFF0000) >>> 16;
    bytes[bytesOffest++] = (sample.duration & 0xFF00) >>> 8;
    bytes[bytesOffest++] = sample.duration & 0xFF; // sample_duration
    bytes[bytesOffest++] = (sample.size & 0xFF000000) >>> 24;
    bytes[bytesOffest++] = (sample.size & 0xFF0000) >>> 16;
    bytes[bytesOffest++] = (sample.size & 0xFF00) >>> 8;
    bytes[bytesOffest++] = sample.size & 0xFF; // sample_size
    bytes[bytesOffest++] = (sample.flags.isLeading << 2) | sample.flags.dependsOn;
    bytes[bytesOffest++] = (sample.flags.isDependedOn << 6) |
      (sample.flags.hasRedundancy << 4) |
      (sample.flags.paddingValue << 1) |
      sample.flags.isNonSyncSample;
    bytes[bytesOffest++] = sample.flags.degradationPriority & 0xF0 << 8;
    bytes[bytesOffest++] = sample.flags.degradationPriority & 0x0F; // sample_flags
    bytes[bytesOffest++] = (sample.compositionTimeOffset & 0xFF000000) >>> 24;
    bytes[bytesOffest++] = (sample.compositionTimeOffset & 0xFF0000) >>> 16;
    bytes[bytesOffest++] = (sample.compositionTimeOffset & 0xFF00) >>> 8;
    bytes[bytesOffest++] = sample.compositionTimeOffset & 0xFF; // sample_composition_time_offset
  }
  return box(strBytes('trun'), bytes);
};

const audioTrun = function(track, offset) {
  var bytes, bytesOffest, header, samples, sample, i;

  samples = track.samples || [];
  let sampleSize = 0;
  let has = {};

  ['duration', 'size', 'flags,', 'compositionTimeOffset'].forEach(function(key) {
    if (samples[0] && samples[0].hasOwnProperty(key)) {
      sampleSize += 4;
      has[key] = true;
    } else {
      has[key] = false;
    }
  });

  offset += 8 + 12 + (sampleSize * samples.length);

  header = trunHeader(samples, offset);
  bytes = new Uint8Array(header.length + (samples.length * sampleSize));
  bytes.set(header);
  bytesOffest = header.length;

  for (i = 0; i < samples.length; i++) {
    sample = samples[i];
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

const trun = function(track, offset) {
  if (track.type === 'audio') {
    return audioTrun(track, offset);
  }

  return videoTrun(track, offset);
};

export const initSegment = function({tracks, info}) {
  var
  fileType = ftyp(),
    movie = moov({tracks, info}),
    result;

  result = new Uint8Array(fileType.byteLength + movie.byteLength);
  result.set(fileType);
  result.set(movie, fileType.byteLength);
  return result;
};

var createDefaultSample = function() {
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

var sampleForFrame = function(trackTimescale, frame, dataOffset) {
  var sample = createDefaultSample();

  sample.dataOffset = dataOffset;
  sample.compositionTimeOffset = 0;
  sample.duration = 1024;

  sample.size = frame.data.length;

  if (frame.keyframe) {
    sample.flags.dependsOn = 2;
    sample.flags.isNonSyncSample = 0;
  }

  delete sample.flags;

  return sample;
};

export const dataSegment = function({sequenceNumber, tracks, frames, info}) {

  let test = 0;
  tracks.forEach(function(track) {
    // TODO: loop through frames not tracks
    // and increment offset for every frame.
    let offset = 0;

    track.samples = frames.reduce((acc, f) => {
      if (f.trackNumber !== track.number) {
        return acc;
      }
      test += f.data.length;
      const sample = sampleForFrame(track.timescale, f, offset);

      offset += sample.size;
      acc.push(sample);

      return acc;
    }, []);
  });
  const frameData = concatTypedArrays.apply(null, frames.map((f) => f.data));
  const result = concatTypedArrays(
    moof(sequenceNumber, tracks),
    mdat(frameData)
  );

  return result;
};
