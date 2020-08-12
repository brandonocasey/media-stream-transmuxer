import Stream from '../stream.js';
import ExpGolomb from './exp-golomb.js';
import {discardEmulationPreventionBytes} from '@videojs/vhs-utils/dist/nal-helpers';
import {concatTypedArrays} from '@videojs/vhs-utils/dist/byte-helpers';

// values of profile_idc that indicate additional fields are included in the SPS
// see Recommendation ITU-T H.264 (4/2013),
// 7.3.2.1.1 Sequence parameter set data syntax
const PROFILES_WITH_OPTIONAL_SPS_DATA = {
  100: true,
  110: true,
  122: true,
  244: true,
  44: true,
  83: true,
  86: true,
  118: true,
  128: true,
  138: true,
  139: true,
  134: true
};

/**
 * Advance the ExpGolomb decoder past a scaling list. The scaling
 * list is optionally transmitted as part of a sequence parameter
 * set and is not relevant to transmuxing.
 *
 * @param count {number} the number of entries in this scaling list
 * @param expGolombDecoder {object} an ExpGolomb pointed to the
 * start of a scaling list
 * @see Recommendation ITU-T H.264, Section 7.3.2.1.1.1
 */
const skipScalingList = function(count, expGolombDecoder) {
  let lastScale = 8;
  let nextScale = 8;
  let j;
  let deltaScale;

  for (j = 0; j < count; j++) {
    if (nextScale !== 0) {
      deltaScale = expGolombDecoder.readExpGolomb();
      nextScale = (lastScale + deltaScale + 256) % 256;
    }

    lastScale = (nextScale === 0) ? lastScale : nextScale;
  }
};

/**
 * Read a sequence parameter set and return some interesting video
 * properties. A sequence parameter set is the H264 metadata that
 * describes the properties of upcoming video frames.
 *
 * @param data {Uint8Array} the bytes of a sequence parameter set
 * @return {Object} an object with configuration parsed from the
 * sequence parameter set, including the dimensions of the
 * associated video frames.
 */
const readSequenceParameterSet = function(data) {
  let
    frameCropLeftOffset = 0;
  let frameCropRightOffset = 0;
  let frameCropTopOffset = 0;
  let frameCropBottomOffset = 0;
  let sarScale = 1;
  let chromaFormatIdc;
  let numRefFramesInPicOrderCntCycle;
  let scalingListCount;
  let sarRatio;
  let aspectRatioIdc;
  let i;

  const expGolombDecoder = new ExpGolomb(data);
  const profileIdc = expGolombDecoder.readUnsignedByte();
  const profileCompatibility = expGolombDecoder.readUnsignedByte();
  const levelIdc = expGolombDecoder.readUnsignedByte();

  expGolombDecoder.skipUnsignedExpGolomb();

  // some profiles have more optional data we don't need
  if (PROFILES_WITH_OPTIONAL_SPS_DATA[profileIdc]) {
    chromaFormatIdc = expGolombDecoder.readUnsignedExpGolomb();
    if (chromaFormatIdc === 3) {
      expGolombDecoder.skipBits(1);
    }
    expGolombDecoder.skipUnsignedExpGolomb();
    expGolombDecoder.skipUnsignedExpGolomb();
    expGolombDecoder.skipBits(1);
    if (expGolombDecoder.readBoolean()) {
      scalingListCount = (chromaFormatIdc !== 3) ? 8 : 12;
      for (i = 0; i < scalingListCount; i++) {
        if (expGolombDecoder.readBoolean()) {
          if (i < 6) {
            skipScalingList(16, expGolombDecoder);
          } else {
            skipScalingList(64, expGolombDecoder);
          }
        }
      }
    }
  }

  expGolombDecoder.skipUnsignedExpGolomb();
  const picOrderCntType = expGolombDecoder.readUnsignedExpGolomb();

  if (picOrderCntType === 0) {
    expGolombDecoder.readUnsignedExpGolomb();
  } else if (picOrderCntType === 1) {
    expGolombDecoder.skipBits(1);
    expGolombDecoder.skipExpGolomb();
    expGolombDecoder.skipExpGolomb();
    numRefFramesInPicOrderCntCycle = expGolombDecoder.readUnsignedExpGolomb();
    for (i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
      expGolombDecoder.skipExpGolomb();
    }
  }

  expGolombDecoder.skipUnsignedExpGolomb();
  expGolombDecoder.skipBits(1);

  const picWidthInMbsMinus1 = expGolombDecoder.readUnsignedExpGolomb();
  const picHeightInMapUnitsMinus1 = expGolombDecoder.readUnsignedExpGolomb();

  const frameMbsOnlyFlag = expGolombDecoder.readBits(1);

  if (frameMbsOnlyFlag === 0) {
    expGolombDecoder.skipBits(1);
  }

  expGolombDecoder.skipBits(1);
  if (expGolombDecoder.readBoolean()) {
    frameCropLeftOffset = expGolombDecoder.readUnsignedExpGolomb();
    frameCropRightOffset = expGolombDecoder.readUnsignedExpGolomb();
    frameCropTopOffset = expGolombDecoder.readUnsignedExpGolomb();
    frameCropBottomOffset = expGolombDecoder.readUnsignedExpGolomb();
  }
  if (expGolombDecoder.readBoolean()) {
    // vui_parameters_present_flag
    if (expGolombDecoder.readBoolean()) {
      // aspect_ratio_info_present_flag
      aspectRatioIdc = expGolombDecoder.readUnsignedByte();
      switch (aspectRatioIdc) {
      case 1: sarRatio = [1, 1]; break;
      case 2: sarRatio = [12, 11]; break;
      case 3: sarRatio = [10, 11]; break;
      case 4: sarRatio = [16, 11]; break;
      case 5: sarRatio = [40, 33]; break;
      case 6: sarRatio = [24, 11]; break;
      case 7: sarRatio = [20, 11]; break;
      case 8: sarRatio = [32, 11]; break;
      case 9: sarRatio = [80, 33]; break;
      case 10: sarRatio = [18, 11]; break;
      case 11: sarRatio = [15, 11]; break;
      case 12: sarRatio = [64, 33]; break;
      case 13: sarRatio = [160, 99]; break;
      case 14: sarRatio = [4, 3]; break;
      case 15: sarRatio = [3, 2]; break;
      case 16: sarRatio = [2, 1]; break;
      case 255: {
        sarRatio = [expGolombDecoder.readUnsignedByte() << 8 |
                      expGolombDecoder.readUnsignedByte(),
        expGolombDecoder.readUnsignedByte() << 8 |
                      expGolombDecoder.readUnsignedByte() ];
        break;
      }
      }
      if (sarRatio) {
        sarScale = sarRatio[0] / sarRatio[1];
      }
    }
  }
  return {
    profileIdc,
    levelIdc,
    profileCompatibility,
    width: Math.ceil((((picWidthInMbsMinus1 + 1) * 16) - frameCropLeftOffset * 2 - frameCropRightOffset * 2) * sarScale),
    height: ((2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16) - (frameCropTopOffset * 2) - (frameCropBottomOffset * 2),
    sarRatio
  };
};

/**
 * Accepts a NAL unit byte stream and unpacks the embedded NAL units.
 */
export class NalByteStream extends Stream {
  constructor() {
    super();
    this.reset();
  }

  /*
   * Scans a byte stream and triggers a data event with the NAL units found.
   * @param {Object} data Event received from H264Stream
   * @param {Uint8Array} data.data The h264 byte stream to be scanned
   *
   * @see H264Stream.push
   */
  push(data) {
    this.buffer = concatTypedArrays(this.buffer, data);
    const len = this.buffer.byteLength;
    // TODO: does i have to be on "this"
    let i = this.i;

    // Rec. ITU-T H.264, Annex B
    // scan for NAL unit boundaries

    // a match looks like this:
    // 0 0 1 .. NAL .. 0 0 1
    // ^ sync point        ^ i
    // or this:
    // 0 0 1 .. NAL .. 0 0 0
    // ^ sync point        ^ i

    // advance the sync point to a NAL start, if necessary
    for (; this.syncPoint < len - 3; this.syncPoint++) {
      if (this.buffer[this.syncPoint + 2] === 1) {
        // the sync point is properly aligned
        i = this.syncPoint + 5;
        break;
      }
    }

    while (i < len) {
      // look at the current byte to determine if we've hit the end of
      // a NAL unit boundary
      switch (this.buffer[i]) {
      case 0:
        // skip past non-sync sequences
        if (this.buffer[i - 1] !== 0) {
          i += 2;
          break;
        } else if (this.buffer[i - 2] !== 0) {
          i++;
          break;
        }

        // deliver the NAL unit if it isn't empty
        if (this.syncPoint + 3 !== i - 2) {
          super.push(this.buffer.subarray(this.syncPoint + 3, i - 2));
        }

        // drop trailing zeroes
        do {
          i++;
        } while (this.buffer[i] !== 1 && i < len);
        this.syncPoint = i - 2;
        i += 3;
        break;
      case 1:
        // skip past non-sync sequences
        if (this.buffer[i - 1] !== 0 ||
            this.buffer[i - 2] !== 0) {
          i += 3;
          break;
        }

        // deliver the NAL unit
        super.push(this.buffer.subarray(this.syncPoint + 3, i - 2));
        this.syncPoint = i - 2;
        i += 3;
        break;
      default:
        // the current byte isn't a one or zero, so it cannot be part
        // of a sync sequence
        i += 3;
        break;
      }
    }

    // filter out the NAL units that were delivered
    this.buffer = this.buffer.subarray(this.syncPoint);
    this.i = i - this.syncPoint;
    this.syncPoint = 0;
  }

  reset() {
    this.syncPoint = 0;
    this.buffer = null;
  }

  flush() {
    // deliver the last buffered NAL unit
    if (this.buffer && this.buffer.byteLength > 3) {
      super.push(this.buffer.subarray(this.syncPoint + 3));
    }
    // reset the stream state
    this.reset();
    super.flush();
  }

  endTimeline() {
    this.flush();
    this.trigger('endedtimeline');
  }
}

/**
 * Accepts input from a ElementaryStream and produces H.264 NAL unit data
 * events.
 */
export class H264Stream extends Stream {
  constructor() {
    super();
    this.nalByteStream = new NalByteStream();
    this.trackId = null;
    this.currentPts = null;
    this.currentDts = null;

    /*
     * Identify NAL unit types and pass on the NALU, trackId, presentation and decode timestamps
     * for the NALUs to the next stream component.
     * Also, preprocess caption and sequence parameter NALUs.
     *
     * @param {Uint8Array} data - A NAL unit identified by `NalByteStream.push`
     * @see NalByteStream.push
     */
    this.nalByteStream.on('data', (e) => {
      const data = e.detail.data;
      const event = {
        trackId: this.trackId,
        pts: this.currentPts,
        dts: this.currentDts,
        data
      };

      switch (data[0] & 0x1f) {
      case 0x05:
        event.nalUnitType = 'slice_layer_without_partitioning_rbsp_idr';
        break;
      case 0x06:
        event.nalUnitType = 'sei_rbsp';
        event.escapedRBSP = discardEmulationPreventionBytes(data.subarray(1));
        break;
      case 0x07:
        event.nalUnitType = 'seq_parameter_set_rbsp';
        event.escapedRBSP = discardEmulationPreventionBytes(data.subarray(1));
        event.config = readSequenceParameterSet(event.escapedRBSP);
        break;
      case 0x08:
        event.nalUnitType = 'pic_parameter_set_rbsp';
        break;
      case 0x09:
        event.nalUnitType = 'access_unit_delimiter_rbsp';
        break;

      default:
        break;
      }
      // This triggers data on the H264Stream
      super.push(event);
    });

    this.nalByteStream.on('done', () => {
      this.trigger('done');
    });
    this.nalByteStream.on('partialdone', () => {
      this.trigger('partialdone');
    });
    this.nalByteStream.on('reset', () => {
      this.trigger('reset');
    });
    this.nalByteStream.on('endedtimeline', () => {
      this.trigger('endedtimeline');
    });
  }

  /*
   * Pushes a packet from a stream onto the NalByteStream
   *
   * @param {Object} packet - A packet received from a stream
   * @param {Uint8Array} packet.data - The raw bytes of the packet
   * @param {Number} packet.dts - Decode timestamp of the packet
   * @param {Number} packet.pts - Presentation timestamp of the packet
   * @param {Number} packet.trackId - The id of the h264 track this packet came from
   * @param {('video'|'audio')} packet.type - The type of packet
   *
   */
  push(packet) {
    if (packet.type !== 'video') {
      return;
    }
    this.trackId = packet.trackId;
    this.currentPts = packet.pts;
    this.currentDts = packet.dts;

    this.nalByteStream.push(packet.data);
  }

  flush() {
    this.nalByteStream.flush();
  }

  partialFlush() {
    this.nalByteStream.partialFlush();
  }

  reset() {
    this.nalByteStream.reset();
  }

  endTimeline() {
    this.nalByteStream.endTimeline();
  }
}
