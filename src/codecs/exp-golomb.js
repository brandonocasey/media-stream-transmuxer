/**
 * Parser for exponential Golomb codes, a variable-bitwidth number encoding
 * scheme used by h264.
 */
export default class ExpGolomb {
  constructor(workingData) {
    this.workingData = workingData;
    // the number of bytes left to examine in workingData
    this.workingBytesAvailable = workingData.byteLength;
    // the current word being examined
    this.workingWord = 0;
    // the number of bits left to examine in the current word
    this.workingBytesAvailable = 0;

    this.loadWord();
  }

  // ():uint
  length() {
    return (8 * this.workingBytesAvailable);
  }

  // ():uint
  bitsAvailable() {
    return (8 * this.workingBytesAvailable) + this.workingBitsAvailable;
  }

  // ():void
  loadWord() {
    const position = this.workingData.byteLength - this.workingBytesAvailable;

    this.workingBytes = new Uint8Array(4);

    const availableBytes = Math.min(4, this.workingBytesAvailable);

    if (availableBytes === 0) {
      throw new Error('no bytes available');
    }

    this.workingBytes.set(this.workingData.subarray(position, position + availableBytes));
    this.workingWord = new DataView(this.workingBytes.buffer).getUint32(0);

    // track the amount of workingData that has been processed
    this.workingBitsAvailable = availableBytes * 8;
    this.workingBytesAvailable -= availableBytes;
  }

  // (count:int):void
  skipBits(count) {
    let skipBytes;

    if (this.workingBitsAvailable > count) {
      this.workingWord <<= count;
      this.workingBitsAvailable -= count;
    } else {
      count -= this.workingBitsAvailable;
      skipBytes = Math.floor(count / 8);

      count -= (skipBytes * 8);
      this.workingBytesAvailable -= skipBytes;

      this.loadWord();

      this.workingWord <<= count;
      this.workingBitsAvailable -= count;
    }
  }

  // (size:int):uint
  readBits(size) {
    let bits = Math.min(this.workingBitsAvailable, size);
    const valu = this.workingWord >>> (32 - bits);
    // if size > 31, handle error

    this.workingBitsAvailable -= bits;
    if (this.workingBitsAvailable > 0) {
      this.workingWord <<= bits;
    } else if (this.workingBytesAvailable > 0) {
      this.loadWord();
    }

    bits = size - bits;
    if (bits > 0) {
      return valu << bits | this.readBits(bits);
    }
    return valu;
  }

  // ():uint
  skipLeadingZeros() {
    let leadingZeroCount;

    for (leadingZeroCount = 0; leadingZeroCount < this.workingBitsAvailable; ++leadingZeroCount) {
      if ((this.workingWord & (0x80000000 >>> leadingZeroCount)) !== 0) {
        // the first bit of working word is 1
        this.workingWord <<= leadingZeroCount;
        this.workingBitsAvailable -= leadingZeroCount;
        return leadingZeroCount;
      }
    }

    // we exhausted workingWord and still have not found a 1
    this.loadWord();
    return leadingZeroCount + this.skipLeadingZeros();
  }

  // ():void
  skipUnsignedExpGolomb() {
    this.skipBits(1 + this.skipLeadingZeros());
  }

  // ():void
  skipExpGolomb() {
    this.skipBits(1 + this.skipLeadingZeros());
  }

  // ():uint
  readUnsignedExpGolomb() {
    const clz = this.skipLeadingZeros();

    return this.readBits(clz + 1) - 1;
  }

  // ():int
  readExpGolomb() {
    const valu = this.readUnsignedExpGolomb();

    if (0x01 & valu) {
      // the number is odd if the low order bit is set
      // add 1 to make it even, and divide by 2
      return (1 + valu) >>> 1;
    }
    // divide by two then make it negative
    return -1 * (valu >>> 1);
  }

  // Some convenience functions
  // :Boolean
  readBoolean() {
    return this.readBits(1) === 1;
  }

  // ():int
  readUnsignedByte() {
    return this.readBits(8);
  }

}
