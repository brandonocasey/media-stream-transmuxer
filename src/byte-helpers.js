export const repeatByte = (size, byte) => {
  const view = new Array(size);

  for (let i = 0; i < size; i++) {
    view[i] = byte;
  }

  return view;
};

export const zeroFill = (size) => repeatByte(size, 0x00);
