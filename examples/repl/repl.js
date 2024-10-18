const repl = require("repl");

const color = "\x1b[33m";
const reset = "\x1b[0m";

const start = (options, vm) => {
  const eval = (uInput, context, filename, callback) => {
    const res = vm.eval(uInput ?? "");
    callback(null, vm.toString(res));
  };

  const writer = (output) => {
    return `${color}${output}${reset}`;
  };

  repl.start({ ...options, eval, writer });
};

exports.start = start;
