const lib = loadLib(__vm().vmPath + "/../modules/server/server.js")

const new = () => lib.new()
const use = (instance, middleware) => lib.use(instance, middleware)
const get = (instance, route, fn) => lib.get(instance, route, fn)
const post = (instance, route, fn) => lib.post(instance, route, fn)
const listen = (instance, port, cb) => lib.listen(instance, port, cb)
const send = (res, message) => lib.send(res, message)
const json = (res, message) => lib.json(res, message)

const encodings = lib.encodings