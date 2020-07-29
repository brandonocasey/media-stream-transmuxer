import {padStart, bytesToString} from '@videojs/vhs-utils/dist/byte-helpers';
import {getAvcCodec, getHvcCodec, getAv1Codec} from '@videojs/vhs-utils/dist/codec-helpers';
import {findEbml} from './find-ebml.js';
import {TAGS} from './constants.js';

// VP9 Codec Feature Metadata (CodecPrivate)
// https://www.webmproject.org/docs/container/
const parseVp9Private = (codecPrivate, track) => {
  let i = 0;
  const params = {};

  while (i < codecPrivate.length) {
    const id = codecPrivate[i] & 0x7f;
    const len = codecPrivate[i + 1];
    let val;

    if (len === 1) {
      val = codecPrivate[i + 2];
    } else {
      val = codecPrivate.subarray(i + 2, i + 2 + len);
    }

    if (id === 1) {
      params.profile = val;
    } else if (id === 2) {
      params.level = val;
    } else if (id === 3) {
      params.bitDepth = val;
    } else if (id === 4) {
      params.chromaSubsampling = val;
    } else {
      params[id] = val;
    }

    i += 2 + len;
  }

  const {profile, level, bitDepth, chromaSubsampling} = params;

  let codec = 'vp09.';

  codec += `${padStart(profile, 2, '0')}.`;
  codec += `${padStart(level, 2, '0')}.`;
  codec += `${padStart(bitDepth, 2, '0')}.`;
  codec += `${padStart(chromaSubsampling, 2, '0')}`;

  // Video -> Colour -> Ebml name
  const matrixCoefficients = findEbml(track, [0xE0, [0x55, 0xB0], [0x55, 0xB1]])[0] || [];
  const videoFullRangeFlag = findEbml(track, [0xE0, [0x55, 0xB0], [0x55, 0xB9]])[0] || [];
  const transferCharacteristics = findEbml(track, [0xE0, [0x55, 0xB0], [0x55, 0xBA]])[0] || [];
  const colourPrimaries = findEbml(track, [0xE0, [0x55, 0xB0], [0x55, 0xBB]])[0] || [];

  // if we find any optional codec parameter specify them all.
  if (matrixCoefficients.length ||
    videoFullRangeFlag.length ||
    transferCharacteristics.length ||
    colourPrimaries.length) {
    codec += `.${padStart(colourPrimaries[0], 2, '0')}`;
    codec += `.${padStart(transferCharacteristics[0], 2, '0')}`;
    codec += `.${padStart(matrixCoefficients[0], 2, '0')}`;
    codec += `.${padStart(videoFullRangeFlag[0], 2, '0')}`;
  }

  return codec;
};

const OPUS_PRIVATE = new Uint8Array([
  // O, p, u, s
  0x4f, 0x70, 0x75, 0x73,
  // H, e, a, d
  0x48, 0x65, 0x61, 0x64,
  // version, channels, pre skip,
  0x01, 0x02, 0x38,
  // input sample rate
  0x01, 0x80, 0xbb, 0x00,
  // output gain, mapping family, stream count, coupled count
  0x00, 0x00, 0x00, 0x00
]);

const CODECS = [
  // video
  {mime: 'vp09', raw: 'V_VP9', get: (cp, t) => cp && `vp09.${parseVp9Private(cp, t)}` || 'vp9'},
  {mime: 'vp9', raw: 'V_VP9', get: (cp, t) => cp && `vp09.${parseVp9Private(cp, t)}` || 'vp9'},
  {mime: 'av01', raw: 'V_AV1', get: (cp) => cp && `av01.${getAv1Codec(cp)}` || 'av01'},
  {mime: 'mp4v.20.9', raw: 'V_MPEG4/ISO/ASP', get: (cp) => cp.length >= 5 && `mp4v.20.${cp[4].toString()}` || 'mp4v.20.9'},
  {mime: 'vp8', raw: 'V_VP8'},
  {mime: 'theora', raw: 'V_THEORA'},
  {mime: 'hev1', raw: 'V_MPEGH/ISO/HEVC', get: (cp) => cp && `hev1.${getHvcCodec(cp)}` || 'hev1'},
  {mime: 'avc1', raw: 'V_MPEG4/ISO/AVC', get: (cp) => cp && `avc1.${getAvcCodec(cp)}` || 'avc1'},

  // audio
  {mime: 'alac', raw: 'A_ALAC'},
  // TODO: use track data for OpusHead
  {mime: 'opus', raw: 'A_OPUS', set: (d) => OPUS_PRIVATE},
  {mime: 'mp3', raw: 'A_MPEG/L3'},
  {mime: 'aac', regex: /^A_AAC/, raw: 'A_AAC', get: (cp) => cp && 'mp4a.40.' + (cp[0] >>> 3).toString() || 'mp4a.40.2'},
  {mime: 'vorbis', raw: 'A_VORBIS'},
  {mime: 'ec-3', raw: 'A_EAC3'},
  {mime: 'flac', raw: 'A_FLAC'},
  {mime: 'speex', raw: 'A_MS/ACM'}
];

export const trackEbmlToCodec = (track) => {
  const rawCodec = bytesToString(findEbml(track, [TAGS.CodecID])[0]);
  const codecPrivate = findEbml(track, [TAGS.CodecPrivate])[0];

  for (let i = 0; i < CODECS.length; i++) {
    const {mime, raw, get, regex} = CODECS[i];

    if ((regex && regex.test(rawCodec)) || raw === rawCodec) {
      if (get) {
        return get(codecPrivate, track);
      }

      return mime;
    }
  }

  return rawCodec;
};

export const codecToTrackEbml = (codec) => {
  for (let i = 0; i < CODECS.length; i++) {
    const {mime, raw, set} = CODECS[i];
    const match = RegExp(`^(${mime})`).exec(codec.toLowerCase());

    if ((match && match.length > 1) || codec === raw) {
      const codecData = [
        [TAGS.CodecID, raw]
      ];

      if (set) {
        const type = codec.substring(0, match[1].length);
        const details = codec.replace(type, '');

        codecData.push([TAGS.CodecPrivate, set(details)]);
      }

      return codecData;
    }
  }

  return [
    [TAGS.CodecID, codec]
  ];
};
