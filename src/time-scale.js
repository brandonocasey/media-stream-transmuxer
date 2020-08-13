const unitValue = function(unit) {
  if (unit === 'ns') {
    return 1;
  } else if (unit === 'ms') {
    return 1000;
  } else if (unit === 'us') {
    return 1000000;
  } else if (unit === 's') {
    return 1000000000;
  }
};

export const scaleTime = function(time, oldUnit, newUnit) {
  if (oldUnit === newUnit) {
    return time;
  }

  return ((+time * unitValue(oldUnit)) / unitValue(newUnit));
};

export const TimeObject = function(time, unit) {
  this.get = scaleTime.bind(null, time, unit);

  return this;
};
