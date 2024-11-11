const updateBuiltin = (name, fn) => {
    const nativeFn = exec(`(name, fn) => {
        if (!_vm?.meta?.__originalFunctions) {
            _vm.meta.__originalFunctions = {}
        }
        _vm.meta.__originalFunctions[name] = _vm?.builtins[name]
        _vm.builtins[name] = (args) => _vm.jsToNode(fn(args.map((arg) => _vm.nodeToJS(arg))))
    }`)

    nativeFn(name, fn)
}

const resetBuiltin = (name) => { 
    const nativeFn = exec(`(name) => {
        if (!(name in _vm?.meta?.__originalFunctions ?? {})) {
            return
        }

        if (!_vm?.meta?.__originalFunctions[name]) {
            delete _vm.builtins[name]
            return
        }

        _vm.builtins[name] = _vm?.meta.__originalFunctions[name]
    }`)

    nativeFn(name)
}

const resetBuiltins =  () => {
    const nativeFn = exec(`() => {
        if (!_vm?.meta?.__originalFunctions) {
            return
        }

        Object.entries(_vm?.meta?.__originalFunctions).forEach(([key, value]) => {
            _vm.builtins[key] = value
        })
    }`)

    nativeFn()
}

const addOperator = (operator, fn) => {
    const unary = (fn->inspect).params->length == 1
    if (unary) {
        operator = "unary" + operator
    }
    const nativeFn = exec(`(operator, fn) => {
        _vm.operators[operator] = _vm.jsToNode(fn)
    }`)

    nativeFn(operator, fn)
}

const removeOperator = (operator) => {
    const nativeFn = exec(`(operator) => {
        delete _vm.operators[operator];
        delete _vm.operators["unary" + operator];
    }`)
    nativeFn(operator)
}

const addVariable = (name, value) => {
    const nativeFn = exec(`(name, value) => {
        if (_vm.callFrame.parentFrame) {
            _vm.callFrame.parentFrame.symbols[name] = {
                node: _vm.jsToNode(value),
                const: false
            }
        }
    }`)

    nativeFn(name, value)
}

const removeVariable = (name) => {
    const nativeFn = exec(`(name) => {
        if (_vm.callFrame.parentFrame) {
            delete _vm.callFrame.parentFrame?.symbols[name]
        }
    }`)

    nativeFn(name)
}

const _getMeta = exec(`(obj) => obj.meta`)

const getMeta = (obj) => {
    return raw(obj)->_getMeta
}

const _setMeta = exec(`(obj, meta) => {
    if (obj.meta) {
        obj.meta = {...obj.meta, ...meta}
    } else {
        obj.meta = meta
    }
}`)

const setMeta = (obj, meta) => {
    raw(obj)->_setMeta(meta)
    return obj
}