const updateBuiltin = (name, fn) => {
    const nativeFn = exec(`(name, fn) => {
        const vm = this.parentVM;
        if (!vm?.meta?.__originalFunctions) {
            vm.meta.__originalFunctions = {}
        }
        vm.meta.__originalFunctions[name] = vm?.builtins[name]
        vm.builtins[name] = (args) => fn(...args.map((arg) => this.nodeToJS(arg)))
    }`)

    nativeFn(name, fn)
}

const resetBuiltin = (name) => { 
    const nativeFn = exec(`(name) => {
        const vm = this.parentVM;
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
        const vm = this.parentVM;
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
        this.parentVM.operators[operator] = this.jsToNode(fn)
    }`)

    nativeFn(operator, fn)
}

const removeOperator = (operator) => {
    const nativeFn = exec(`(operator) => {
        delete this.parentVM.operators[operator];
        delete this.parentVM.operators["unary" + operator];
    }`)
    nativeFn(operator)
}

const addVariable = (name, value) => {
    const nativeFn = exec(`(name, value) => {
        this.parentVM.symbols[name] = {
            node: this.jsToNode(value),
            const: false
        }
    }`)

    nativeFn(name, value)
}

const removeVariable = (name) => {
    const nativeFn = exec(`(name) => {
        delete this.parentVM.symbols[name]
    }`)

    nativeFn(name)
}