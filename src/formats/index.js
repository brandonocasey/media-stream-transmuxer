import Ebml from './ebml/index.js';
import Bmff from './bmff/index.js';
import Adts from './adts/index.js';
import M2ts from './m2ts/index.js';
import H264 from './h264/index.js';
import H265 from './h265/index.js';
import Ogg from './ogg/index.js';
import Mpeg from './mpeg/index.js';

const Formats = [
  Ebml,
  Bmff,
  Adts,
  M2ts,
  H264,
  Ogg,
  Mpeg,
  H265
];

export default Formats;
