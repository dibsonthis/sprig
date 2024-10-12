const _parse = jsEval(`(str) => {
    try {
        return JSON.parse(str)
    } catch(e) {
        return {__type__: "error", message: e}
    }
}`)

const _stringify = jsEval(`(obj) => {
    try {
        return JSON.stringify(obj)
    } catch(e) {
        return {__type__: "error", message: e}
    }
}`)

{str: String}
const parse = (str) => _parse(str)

{obj: Object}
const stringify = (obj) => _stringify(obj)