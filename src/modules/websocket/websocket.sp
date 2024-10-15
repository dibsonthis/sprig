const lib = loadLib(__vm().vmPath + "/../modules/websocket/websocket.js")

{url: String}
const client = (url) => lib.client(url)

{options: Object}
const server = (options = {}) => lib.server(options)

{eventName: String, wss: [Raw, Object], fn: Function}
const on = (wss, eventName, fn) => lib.on(wss, eventName, fn)

{ws: [Raw, Object], message: String}
const send = (ws, message) => lib.send(ws, message)

{buffer: Raw}
const asString = (buffer) => lib.asString(buffer)

const createReadLineInterface = () => lib.createReadLineInterface()
