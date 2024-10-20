const lib = loadLib("repl.js")

const start = (options = {}) => lib.start(options, exec("this"))