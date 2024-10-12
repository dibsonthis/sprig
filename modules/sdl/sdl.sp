const lib = loadLib("sdl.js")
const test = () => lib.test()
const test2 = () => lib.test2()
const buff = () => lib.buff()
const sineWav = () => lib.sineWav()
const freq = () => lib.freq()

{options: Object}
const createWindow = (options = {}) => lib.createWindow(options)

{eventName: String, window: Raw, fn: Function}
const on = (eventName, window, fn) => lib.on(eventName, window, fn)

{
    window: Raw, width: Number, height: Number, 
    stride: Number, format: String, buffer: Raw
}
const render = (window, width, height, stride, format, buffer) 
    => lib.render(window, width, height, stride, format, buffer)