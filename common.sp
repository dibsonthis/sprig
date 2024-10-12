// Class Functions

{constructor: [Function, Native]}
const instanceOf = (value, constructor) => {
    return value->class == constructor
}

// List Functions

{arr: List}
const includes = (arr, value) => {
    for (arr, v) {
        if (v == value) {
            return true
        }
    }
    return false
}

{arr: List, fn: Function}
const reduce = (arr, fn, init) => {
    var res = arr[0]
    var index = 1
    if (init) {
        res = init
        index = 0
    }
    
    for (index..arr->length, v, i) {
        res = fn(res, arr[v], i)
    }
    return res
}

{arr: List, start: Number, end: [Number, Undefined]}
const slice = (arr, start, end) => {
    var _end = end
    if (!end) {
        _end = arr->length
    }
    return ((arr | _end)[0] | start)[1]
}

// Async Functions

const _timeout = jsEval(`(n, fn, ...args) => {
    const s = setTimeout(() => {
        fn(...args)
      }, n);
      return s
}`)

{n: Number, fn: Function}
const timeout = (n, fn, ...args) => {
    return _timeout(n, fn, ...args)
}

const _interval = jsEval(`(n, fn, ...args) => {
    const s = setInterval(() => {
        fn(...args)
      }, n);
      return s
}`)

{n: Number, fn: Function}
const interval = (n, fn, ...args) => {
    return _interval(n, fn, ...args)
}

const _fetch = jsEval(`(endpoint, ...callbacks) => {
    var promise = fetch(endpoint)
    .then(response => {
        if (!response.ok) {
            return undefined;
        }
        return response.json();
    })

    callbacks.forEach((cb) => {
        promise = promise.then(cb)
    })

    return promise
}`)

{endpoint: String}
const fetch = (endpoint, ...callbacks) => _fetch(endpoint, ...callbacks)

const _then = jsEval(`(promise, callback) => {
    return promise.then(callback)
}`)

{promise: Raw, callback: Function}
const then = (promise, callback) => _then(promise, callback)

const _catch = jsEval(`(promise, callback) => {
    return promise.catch(callback)
}`)

{promise: Raw, callback: Function}
const catch = (promise, callback) => _catch(promise, callback)

const _delay = jsEval(`(ms) => new Promise(resolve => setTimeout(resolve, ms))`)
{ms: Number}
const delay = (ms = 0) => _delay(ms)

const _promise = jsEval(`(value) => Promise.resolve(value)`)
const promise = (value) => _promise(value)

// Parsing Functions

const _toNumber = jsEval(`(value) => parseFloat(value)`)
const toNumber = (value) => _toNumber(value)

const _toString = jsEval("(value) => `${value}`")
const toString = (value) => _toString(value)

// Numeric Functions

const _truncate = jsEval(`(floatNumber, decimals) => {
    const factor = Math.pow(10, decimals);
    return Math.trunc(floatNumber * factor) / factor;
}`)
const truncate = (value, decimals = 2) => _truncate(value, decimals)