import {padStart, bytesToString, concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';
import {getAvcCodec, getHvcCodec, getAv1Codec} from '@videojs/vhs-utils/dist/codec-helpers';
import {findEbml} from './find-ebml.js';
import {TAGS} from './constants.js';
import {setOpusHead, parseOpusHead, OPUS_HEAD} from '../../codecs/opus.js';

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

// TODO: don't hardcode this...
const AAC_PRIVATE = new Uint8Array([
  0x11, 0x90, 0x56, 0xe5, 0x00
]);

const CODECS = [
  // video
  {mime: 'vp09', raw: 'V_VP9', get: (cp, t) => ({codec: cp && `vp09.${parseVp9Private(cp, t)}` || 'vp9'})},
  {mime: 'vp9', raw: 'V_VP9', get: (cp, t) => ({codec: cp && `vp09.${parseVp9Private(cp, t)}` || 'vp9'})},
  {mime: 'av01', raw: 'V_AV1', get: (cp) => ({codec: cp && `av01.${getAv1Codec(cp)}` || 'av01'})},
  {mime: 'mp4v.20.9', raw: 'V_MPEG4/ISO/ASP', get: (cp) => ({codec: cp.length >= 5 && `mp4v.20.${cp[4].toString()}` || 'mp4v.20.9'})},
  {mime: 'vp8', raw: 'V_VP8'},
  {mime: 'theora', raw: 'V_THEORA'},
  {mime: 'hev1', raw: 'V_MPEGH/ISO/HEVC', get: (cp) => ({codec: cp && `hev1.${getHvcCodec(cp)}` || 'hev1'})},
  {mime: 'avc1', raw: 'V_MPEG4/ISO/AVC', get: (cp) => ({codec: cp && `avc1.${getAvcCodec(cp)}` || 'avc1'})},

  // audio
  {mime: 'alac', raw: 'A_ALAC'},
  {
    mime: 'opus', raw: 'A_OPUS',
    set: (track) => [[TAGS.CodecPrivate, concatTypedArrays(OPUS_HEAD, setOpusHead(track.info.opus))]],
    get: (cp) => ({codec: 'opus', info: parseOpusHead(cp.subarray(OPUS_HEAD.length))})
  },
  {mime: 'mp3', raw: 'A_MPEG/L3'},
  {
    mime: 'aac', regex: /^A_AAC/, raw: 'A_AAC',
    set: (track) => [[TAGS.CodecPrivate, AAC_PRIVATE]],
    get: (cp) => ({codec: cp && 'mp4a.40.' + (cp[0] >>> 3).toString() || 'mp4a.40.2'})
  },
  {mime: 'vorbis', raw: 'A_VORBIS'},
  {mime: 'ec-3', raw: 'A_EAC3'},
  {mime: 'flac', raw: 'A_FLAC'},
  {mime: 'speex', raw: 'A_MS/ACM'}
];

export const codecInfoFromTrack = (trackBytes) => {
  const rawCodec = bytesToString(findEbml(trackBytes, [TAGS.CodecID])[0]);
  const codecPrivate = findEbml(trackBytes, [TAGS.CodecPrivate])[0];

  for (let i = 0; i < CODECS.length; i++) {
    const {mime, raw, get, regex} = CODECS[i];

    if ((regex && regex.test(rawCodec)) || raw === rawCodec) {
      if (get) {
        return get(codecPrivate);
      }

      return {codec: mime};
    }
  }

  return {codec: rawCodec};
};

export const trackCodecEbml = (track) => {
  let codec = track.codec;

  // TODO: we can do better then this... some kind of helpers to alias codec names
  if ((/^mp4a/).test(codec)) {
    codec = 'aac';
  }
  for (let i = 0; i < CODECS.length; i++) {
    const {mime, raw, set} = CODECS[i];
    const match = RegExp(`^(${mime})`).exec(codec.toLowerCase());

    if ((match && match.length > 1) || codec === raw) {
      let codecData = [
        [TAGS.CodecID, raw]
      ];

      if (set) {
        codecData = codecData.concat(set(track));
      }

      return codecData;
    }
  }

  return [
    [TAGS.CodecID, codec]
  ];
};
