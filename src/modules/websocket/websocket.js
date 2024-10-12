const Websocket = require("ws");
const readline = require("readline");

const client = (url) => {
  const wsc = new Websocket(url);
  return wsc;
};

const server = (options) => {
  const wss = new Websocket.Server(options);
  return wss;
};

const on = (wss, eventName, fn) => {
  const func = (...event) => {
    if (event[0]?.constructor?.name === "Buffer") {
      event[0] = event[0].toString();
    }
    return fn(...event);
  };
  wss.on(eventName, func);
};

const send = (ws, message) => {
  ws.send(message.toString());
};

const createReadLineInterface = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  rl.prompt(false);
  return rl;
};

exports.server = server;
exports.client = client;
exports.on = on;
exports.send = send;
exports.createReadLineInterface = createReadLineInterface;
