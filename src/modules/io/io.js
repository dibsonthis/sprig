const fs = require("fs");

const readFile = (filePath) => {
  try {
    return fs.readFileSync(filePath).toString();
  } catch (e) {
    return { __type__: "error", message: e };
  }
};

const writeFile = (filePath, content) => {
  try {
    return fs.writeFileSync(filePath, content);
  } catch (e) {
    return { __type__: "error", message: e };
  }
};

exports.readFile = readFile;
exports.writeFile = writeFile;
