{options: [Object, Undefined]}
const (Test) = (options) => {

    const time = jsEval(`() => performance.now()`)
    const getLocalTests = (options = {}) => {
        const locals = (__vm(1)).locals
        const tests = locals->keys->filter((key) => locals[key]->type == Function && !(options.exclude ?? [])->includes(key) && Str.startsWith(key, "test"))->map((key) => locals[key])
        return tests
    }
    const isEqual = (a, b) => a == b
    const isNotEqual = (a, b) => a !== b
    const listIncludes = (ls, val) => ls->includes(val)
    const objectHas = (obj, key) => obj->keys->includes(key)

    var results = {passed: 0, failed: 0}
    var currentFunctionName = ""

    const assert = (fn, ...args) => {
        const {line, col, name, filePath} = __vm(1)
        const result = fn(...args)
        const message = `{{result ? "\e[32m" : "\e[31m"}}Assertion {{result ? "passed" : "failed"}} - {{(fn->inspect).name}}: {{args}} "{{currentFunctionName}}" at {{filePath}}:{{line}}:{{col}}\e[0m`

        results[currentFunctionName].passed = results[currentFunctionName].passed ? result : results[currentFunctionName].passed;
        (results[currentFunctionName].assertions)->append({result, functionName: (fn->inspect).name, args, message})
    }
    
    const run = (...fns) => {
        print(`\e[33m\nStarting test run\e[0m ({{fns->length}} tests)`)

        const allRunsStartTime = time()

        for (fns, __fn) {
             let key = (__fn->inspect).name
             let runStartTime = time()
             results[key] = { passed: true, assertions: []}
             currentFunctionName = key
             __fn()
             let runEndTime = time()
             let result = results[key]
             result.time = (runEndTime - runStartTime)->truncate(3)
             if (result.passed) {
                results.passed += 1
             } else {
                results.failed += 1
             }
             if (options.verbose) {
                print(`\n{{key}} - {{result.passed ? "\e[32m" : "\e[31m"}}{{result.passed ? "Passed" : "Failed"}}\e[0m`)
                for (result.assertions, assertion) {
                    print(assertion.message)
                }
            } else if (options.errorsOnly) {
                print(`\n{{key}} - {{result.passed ? "\e[32m" : "\e[31m"}}{{result.passed ? "Passed" : "Failed"}}\e[0m`)
                for (result.assertions, assertion) {
                    if (!assertion.result) {
                        print(assertion.message)
                    }
                }
            }
        }
        const allRunsEndTime = time()
        const allRunsRunTime = (allRunsEndTime - allRunsStartTime)->truncate(3)
    
        print("\e[33m\nResults:\n\e[0m")
        
        for (results->keys->filter((e) => e != "passed" && e != "failed"), key) {
            print(`{{key}}: {{results[key].passed ? "\e[32m" : "\e[31m"}}{{results[key].passed ? "Passed" : "Failed"}}\e[0m [{{results[key].assertions->length}} assertions] \e[30m({{results[key].time}} ms)\e[0m`)
        }
    
        print("\e[33m\nSummary:\n\e[0m")
    
        if (results.passed > 0) {
            print(`\e[32mTests passed: {{results.passed}} of {{results->length - 2}}\e[0m`)
        }
        if (results.failed > 0) {
            print(`\e[31mTests failed: {{results.failed}} of {{results->length - 2}}\e[0m`)
        }
        print(`\e[30mTime: {{allRunsRunTime}} ms\n\e[0m`)
    
        const _results = results
        results = {passed: 0, failed: 0}
        currentFunctionName = ""
    
        return _results
    }

    return { 
        assert, 
        isEqual, 
        isNotEqual, 
        listIncludes, 
        objectHas, 
        getLocalTests,
        run 
    }
 }