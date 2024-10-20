const _parse = exec(`(str) => {
    try {
        return JSON.parse(str)
    } catch(e) {
        return {__type__: "error", message: e.message}
    }
}`)

const _stringify = exec(`(obj) => {
    try {
        return JSON.stringify(obj)
    } catch(e) {
        return {__type__: "error", message: e.message}
    }
}`)

{str: String}
const parse = (str) => {
    const res = _parse(str)
    if (res.__type__ == "error") {
        return error(res.message)
    }
    return res
}

{obj: Object}
const stringify = (obj) => {
    const res = _stringify(str)
    if (res.__type__ == "error") {
        return error(res.message)
    }
    return res
}