const mpegts = require('./mpegts.json');

const frames = [];
const data = {};

let last;

debugger;
mpegts.forEach(function(packet) {
  if (packet.type !== 'PES') {
    return;
  }
  data[packet.pid] = data[packet.pid] || 0;

  if (packet.payloadStart) {
    if (data[packet.pid]) {
      frames.push({type: packet.pid === 256 ? 'video' : 'audio', size: data[packet.pid]});
      data[packet.pid] = 0;
    }
  }

  data[packet.pid] += packet.payload;
  last = packet;
});

Object.keys(data).forEach((pid) => {
  if (data[pid].length) {
    frames.push(data[pid].slice());
    data[pid].length = 0;
  }
});
console.log(JSON.stringify(frames, null, 2));
console.log(frames.length);
