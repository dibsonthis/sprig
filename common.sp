// Class Functions

{constructor: [Function, Native]}
const instanceOf = (value, constructor) => {
    return value->class == constructor
}

// List Functions

const includes = (arr, value) => {
    for (arr, v) {
        if (v == value) {
            return true
        }
    }
    return false
}

const forEach = (arr, fn) => {
    for (arr, value, index) {
        fn(value, index)
    }
}

const map = (arr, fn) => {
    const res = []
    for (arr, value, index) {
        res->append(fn(value, index))
    }
    return res
}

const filter = (arr, fn) => {
    const res = []
    for (arr, value, index) {
        if (fn(value, index)) {
            res->append(value)
        }
    }
    return res
}

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

const slice = (arr, start, end) => {
    var _end = end
    if (!end) {
        _end = arr->length
    }
    return ((arr | _end)[0] | start)[1]
}

const _sort = exec(`(arr, fn) => {
    return arr.toSorted((a, b) => fn(_vm.nodeToJS(a), _vm.nodeToJS(b))).map((e) => _vm.nodeToJS(e))
}`)

const sort = (arr, fn) => {
    return arr->map((e) => raw(e))->_sort(fn)
}

// Async Functions

const _timeout = exec(`(fn, n) => {
    const s = setTimeout(() => {
        fn()
      }, n);
      return s
}`)

{fn: Function, n: Number, }
const timeout = (fn, n = 0) => {
    return _timeout(fn, n)
}

const _interval = exec(`(fn, n) => {
    const s = setInterval(() => {
        fn()
      }, n);
      return s
}`)

{fn: Function, n: Number}
const interval = (fn, n = 0) => {
    return _interval(fn, n)
}

const _clearInterval = exec(`(id) => {
    clearInterval(id);
}`)

{id: Raw}
const clearInterval = (id) => {
    _clearInterval(id)
}

const _fetch = exec(`(endpoint, ...callbacks) => {
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

const _then = exec(`(promise, callback) => {
    return promise.then(callback)
}`)

{promise: Raw, callback: Function}
const then = (promise, callback) => _then(promise, callback)

const _catch = exec(`(promise, callback) => {
    return promise.catch(callback)
}`)

{promise: Raw, callback: Function}
const catch = (promise, callback) => _catch(promise, callback)

const _delay = exec(`(ms) => new Promise(resolve => setTimeout(resolve, ms))`)
{ms: Number}
const delay = (ms = 0) => _delay(ms)

const _promise = exec(`(value) => Promise.resolve(value)`)
const promise = (value) => _promise(value)

// Parsing Functions

const _toNumber = exec(`(value) => parseFloat(value)`)
const toNumber = (value) => _toNumber(value)

const _toString = exec("(value) => `${value}`")
const toString = (value) => _toString(value)

// Numeric Functions

const _truncate = exec(`(floatNumber, decimals) => {
    const factor = Math.pow(10, decimals);
    return Math.trunc(floatNumber * factor) / factor;
}`)
const truncate = (value, decimals = 2) => _truncate(value, decimals)