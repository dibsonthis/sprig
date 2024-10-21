const updateBuiltin = (name, fn) => {
    const nativeFn = exec(`(name, fn) => {
        const vm = _vm.parentVM;
        if (!vm?.meta?.__originalFunctions) {
            vm.meta.__originalFunctions = {}
        }
        vm.meta.__originalFunctions[name] = vm?.builtins[name]
        vm.builtins[name] = (args) => _vm.jsToNode(fn(...args.map((arg) => _vm.nodeToJS(arg))))
    }`)

    nativeFn(name, fn)
}

const resetBuiltin = (name) => { 
    const nativeFn = exec(`(name) => {
        const vm = _vm.parentVM;
        if (!(name in vm?.meta?.__originalFunctions ?? {})) {
            return
        }

        if (!vm?.meta?.__originalFunctions[name]) {
            delete vm.builtins[name]
            return
        }

        vm.builtins[name] = vm?.meta.__originalFunctions[name]
    }`)

    nativeFn(name)
}

const resetBuiltins =  () => {
    const nativeFn = exec(`() => {
        const vm = _vm.parentVM;
        if (!vm?.meta?.__originalFunctions) {
            return
        }

        Object.entries(vm?.meta?.__originalFunctions).forEach(([key, value]) => {
            vm.builtins[key] = value
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
        _vm.parentVM.operators[operator] = _vm.jsToNode(fn)
    }`)

    nativeFn(operator, fn)
}

const removeOperator = (operator) => {
    const nativeFn = exec(`(operator) => {
        delete _vm.parentVM.operators[operator];
        delete _vm.parentVM.operators["unary" + operator];
    }`)
    nativeFn(operator)
}

const addVariable = (name, value) => {
    const nativeFn = exec(`(name, value) => {
        _vm.parentVM.symbols[name] = {
            node: _vm.jsToNode(value),
            const: false
        }
    }`)

    nativeFn(name, value)
}

const removeVariable = (name) => {
    const nativeFn = exec(`(name) => {
        delete _vm.parentVM.symbols[name]
    }`)

    nativeFn(name)
}