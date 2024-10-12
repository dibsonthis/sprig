const newNode = (type = "Undefined", value = undefined, col = 0, line = 0) => ({
  col: col,
  line: line,
  type,
  value,
  evaluated: true,
});

exports.newNode = newNode;
