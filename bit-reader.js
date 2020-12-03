const {toUint8} = require('@videojs/vhs-utils/dist/byte-helpers');
const BitReader = function(bufferArraySize) {
  let bytePosition = 0;
  let bitPosition = 0;

  this.view = toUint8(bufferArraySize);

  this.reset = function() {
    bitPosition = 0;
    this.view = null;
  };

  this.readBits = function(bits, options) {
    this.skipBits(bits);

    return result;
  };

  this.readBit = (le) => this.readBits(1, {le});

  this.skipBits = function(v) {
    // number of full 8 bit bytes to skip
    bytePosition += v / 8 >> 0;

    // keep bitPosition as the remainer
    bitPosition %= 8;

    this.bitView = this.view[bytePosition];

    if (bitPosition) {
      this.bitView &= Math.pow(2, 8 - bitPosition);
    }
  };

  this.skipBytes = (n) => this.skipBits(8 * n);
  this.skipByte = this.skipBytes.bind(this, 1);
  this.skipBit = this.skipBits.bind(this, 1);

  [8, 16, 24, 32, 40, 48, 56, 64].forEach((n) => {
    this[`readUint${n}`] = (le) => this.readBits(n, {le});
    this[`readInt${n}`] = (le) => this.readBits(n, {le, signed: true});
  });
};

const reader = new BitReader(new Uint8Array([0xFC, 0x0C, 0xD0, 0xaa, 0xbb]));

console.log(reader.readBits(1).toString(2));

module.exports = BitReader;
