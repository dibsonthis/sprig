const express = require("express");

const _new = () => {
  const app = express();
  return app;
};

const encodings = {
  json: () => express.json(),
  text: () => express.text(),
  raw: () => express.raw(),
  urlencoded: (options) => express.urlencoded(options),
};

const use = (instance, middleware) => {
  instance.use(middleware);
};
const get = (instance, route, fn) => {
  instance.get(route, fn);
};
const post = (instance, route, fn) => {
  instance.post(route, fn);
};
const listen = (instance, port, cb) => {
  instance.listen(port, cb);
};
const send = (res, message) => {
  res.send(message);
};
const json = (res, message) => {
  res.json(message);
};

module.exports = {
  new: _new,
  use,
  get,
  post,
  listen,
  send,
  json,
  encodings,
};
