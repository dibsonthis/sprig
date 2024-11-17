// const Test = Testing.Test({
//     // verbose: true
//     errorsOnly: true
// })

// const {
//     assert, 
//     isEqual, 
//     isNotEqual, 
//     listIncludes, 
//     objectHas, 
//     getLocalTests
// } = Test

// const test_object = () => {
//     const PI = 3.14
//     const key = "id"
//     const person = {
//         token: "_-_",
//         nums: (1...3),
//         bloop: {
//             a: 10 + 4,
//             b: 20,
//             c: (1...4),
//             d: (const d = 1200) + (const e = 1.4)
//         },
//         [key]: PI
//     }

//     person.nums[0] = 100
//     person.bloop.c[0] = person.token * person.bloop.a
//     person.bloop.e = person.bloop.d + d

//     assert(objectHas, person, "id")
//     assert(isEqual, person.token, "_-_")
//     assert(isEqual, person.id, 3.14)
//     assert(isEqual, person.bloop.e, 2401.4)
//     assert(isEqual, person.bloop.e, 2401.4)
// }

// const test_coroutines = () => {
//     const coro = () => {
//         var x = 0
//         while (true) {
//             yield x += 1
//         }
//     }

//     const c1 = coro();

//     while ((let c = c1()) <= 10) {
//         // do nothing
//     }

//     assert(isEqual, c, 11)

//     const coroAdvanced = (init, value) => {
//         var x = init
//         while (true) {
//             yield x += value
//         }
//     }

//     const cAdvanced = coroAdvanced(100);

//     const res = cAdvanced(20)

//     assert(isEqual, res, 120)
// }

// const test_counter = () => {
//     const Counter = (init = 0) => {
//         var count = {
//             value: init
//         }
//         return [() => count.value += 1, count]
//     }

//     const [counter1, c1] = Counter()
//     const [counter2, c2] = Counter()

//     counter1()
//     counter1()
//     counter2()

//     assert(isEqual, c1.value, 2)
//     assert(isEqual, c2.value, 1)
// }

// const test_obj_reducer = () => {
//     const props = [
//         ["name", "Jack"],
//         ["age", 34],
//         ["nums", 1...10]
//     ]

//     const obj = props->reduce((obj, kv) => {
//         const [key, value] = kv
//         obj[key] = value
//         return obj
//     }, {})

//     assert(isEqual, obj->length, 3)
//     assert(isEqual, obj.name, "Jack")
//     assert(isEqual, obj.age, 34)
//     assert(isEqual, obj.nums->length, 10)

// }


// const test_wrappers = () => {
//     const div = (a, b) => {
//         return a / b
//     }

//     const logWrapper = (fn, ...args) => {
//         return fn(...args)
//     }

//     const doubleWrapper = (fn, ...args) => {
//         return fn(...args) * 2
//     }

//     const listWrapper = (fn, ...args) => {
//         return [fn(...args)]
//     }

//     const createWrappers = (fn, ...wrappers) => {
//         return wrappers->reduce((fn, wrapper) => {
//             return (...args) => wrapper(fn, ...args);
//         }, fn)
//     }

//     const f = div->createWrappers(logWrapper, doubleWrapper, listWrapper)

//     const res1 = f(10, 2);
//     const res2 = f(5, 4);

//     assert(isEqual, res1[0], 10)
//     assert(isEqual, res2[0], 2.5)
// }

// const test_proxy = () => {
//     const person = {
//         name: "Jack",
//         id: 43,
//         address: {
//             name: "123 Fake st."
//         }
//     }
    
//     const handler = {
//         repr: {
//             _: (v) => "***"
//         },
//         get: {
//             _: (v) => (v ? [v] : undefined)
//         },
//         set: {
//             _: (o, k, v, c) => {
//                 if (o[k]) {
//                     return v
//                 }
//                 return undefined
//             }
//         },
//     }
    
//     const personProxy = person->proxy(handler)
//     personProxy.age = 45
//     personProxy.id = 1001

//     assert(isEqual, personProxy.name[0], "Jack")
//     assert(isEqual, personProxy.id[0], 1001)
//     assert(isEqual, personProxy.age, undefined)
// }

// const test_validation = () => {

//     const typeValidator = (t) => {
//         return (v, c) => {
//             if (v->type != t) {
//                 return c
//             }
//             return v
//         }
//     }
    
//     const rangeValidator = (min, max) => ((v, c) => {
//         if (v < min) {
//             return min
//         }
//         if (v > max) {
//             return max
//         }
//         return v
//     })

//     const readonlyValidator = (v, c) => {
//         return c
//     }
    
//     const customValidator = (v, c) => {
//         if (v->length > c->length) {
//             return c
//         }
//         return v
//     }
    
//     const createHandler = (validation) => {
//         var handler = {}
//         validation->keys->forEach((key) => {
//             const validation_prop = validation[key]
//             if (validation_prop->type == Object) {
//                 handler[key] = validation_prop->createHandler
//             } else {
//                 handler[key] = (v, c) => {
//                    return validation_prop(v, c)
//                 }
//             }
//         })
//         return handler
//     }
    
//     const createProxy = (obj, handler) => {
//         const proxy = obj->proxy({set: handler})
//         proxy->keys->forEach((key) => {
//             const value = proxy[key]
//             if (value->type == Object) {
//                 const res = value->createProxy(handler[key])
//                 proxy[key] = res
//             }
//         })
//         return proxy
//     }
    
//     const createValidatedObject = (obj, validation) => {
//         const handler = validation->createHandler
//         const validatedObject = obj->createProxy(handler)
//         return validatedObject
//     }
    
//     const obj = {
//         name: "Jack",
//         age: 34,
//         address: {
//             street: "123 Fake St.",
//             postcode: 2113
//         },
//         num: 0,
//         nums: 1..10,
//         secret: "Shh it's a secret"
//     }
    
//     const validation = {
//         name: typeValidator(String),
//         age: typeValidator(Number),
//         num: rangeValidator(0, 20),
//         nums: customValidator,
//         secret: readonlyValidator,
//         address: {
//             postcode: typeValidator(Number)
//         }
//     }

//     const p = createValidatedObject(obj, validation)
    
//     p.address.street = "18 Tirvala Road."
//     p.address.postcode = "999"
//     p.address.postcode = 144
//     p.address.postcode = "ggg"
//     p.age = 50
//     p.num = 300
//     p.secret = "new secret"

//     assert(isEqual, p.secret, "Shh it's a secret")
//     assert(isEqual, p.address.postcode, 144)
//     assert(isEqual, p.num, 20)

//     const Color = () => {
//         return createValidatedObject({
//             r: 0,
//             g: 0,
//             b: 0
//         }, {
//             r: rangeValidator(0, 255),
//             g: rangeValidator(0, 255),
//             b: rangeValidator(0, 255),
//         })
//     }
    
//     const color = Color()
//     color.r = 400
//     color.b = -4

//     assert(isEqual, color.r, 255)
//     assert(isEqual, color.g, 0)
//     assert(isEqual, color.b, 0)
// }

// const test_io = () => {
//     const len = Io.readFile("tests.sp")->length
//     assert(isNotEqual, len, 0)
// }

// const test_json = () => {
//     const {parse, stringify} = Json

//     const objStr = `{"name": "Allan", "age": 45, "nums": [1,2,3,4,5]}`

//     const parsedObj = parse(objStr)
//     parsedObj.nums[5] = 2 * 4.5

//     assert(isEqual, parsedObj.nums[5], 9)
// }

// const test_list = () => {
//     const arr = 1..10
//     arr->insert(100, 5)
//     arr->insert(-30)
//     arr->append(450)
//     const first = arr->popf()
//     const last = arr->pop()
//     arr->remove(arr->length - 1)
    
//     assert(isEqual, first, -30)
//     assert(isEqual, last, 450)
//     assert(isEqual, arr[0], 1)

//     while (arr->length > 0) {
//         let front = arr->popf
//     }

//     assert(isEqual, arr->length, 0)
// }

// const test_imports = () => {
//     const modules_path = "../src/modules"
//     import io : `{{modules_path}}/io/io`
//     assert(isNotEqual, io.readFile, undefined)
// }

// const test_classes = () => {
//     const (Color) = (r = 0, g = 0, b = 0) => {
//         const color = {r: 0, g: 0, b: 0}->proxy({
//             repr: {
//                 r: (v) => `\e[31m{{v}}\e[0m`,
//                 g: (v) => `\e[32m{{v}}\e[0m`,
//                 b: (v) => `\e[34m{{v}}\e[0m`,
//             },
//             set: {
//                 _: (o, k, v, c) => {
//                     if (v < 0) {
//                         return 0
//                     }
//                     if (v > 255) {
//                         return 255
//                     }
//                     return v
//                 }
//             }
//         })
    
//         color.r = r
//         color.g = g
//         color.b = b
        
//         return color
//     }
    
//     const c = Color()

//     c.r = 20
//     c.g = 400
//     c.b = -34

//     const constructor = c->class

//     assert(isEqual, c.r, 20)
//     assert(isEqual, c.g, 255)
//     assert(isEqual, c.b, 0)

//     const c2 = constructor(10, 20, 500)

//     assert(isEqual, c2.r, 10)
//     assert(isEqual, c2.g, 20)
//     assert(isEqual, c2.b, 255)

//     assert(isEqual, c->instanceOf(Color), true)
//     assert(isEqual, c->instanceOf(constructor), true)

//     const (Upper) = () => {
//         const (Lower) = (name) => {
//             return {name}
//         }
//     }

//     const lower = Upper()
//     const obj = lower("Allan")

//     assert(isEqual, obj->instanceOf(Upper), false)
//     assert(isEqual, obj->instanceOf(lower), true)
// }

// const test_raw_classes = () => {
//     const _Buffer = exec(`(size) => Buffer.alloc(size)`)
//     const Buffer = (size) => _Buffer(size)
    
//     const buffer = Buffer(100)

//     assert(isEqual, buffer->instanceOf(Buffer), false)
//     assert(isEqual, buffer->instanceOf(buffer->class), true)
// }

// const test_common = () => {
//     const commonKeys = __common
//     ->keys
//     ->filter((k) => k[0] != "_")

//     assert(listIncludes, commonKeys, "instanceOf")
//     assert(listIncludes, commonKeys, "includes")
//     assert(listIncludes, commonKeys, "reduce")
//     assert(listIncludes, commonKeys, "slice")
//     assert(listIncludes, commonKeys, "timeout")
//     assert(listIncludes, commonKeys, "interval")
//     assert(listIncludes, commonKeys, "fetch")
//     assert(listIncludes, commonKeys, "then")
//     assert(listIncludes, commonKeys, "catch")
//     assert(listIncludes, commonKeys, "delay")
//     assert(listIncludes, commonKeys, "promise")
//     assert(listIncludes, commonKeys, "toNumber")
//     assert(listIncludes, commonKeys, "toString")
//     assert(listIncludes, commonKeys, "truncate")
//     assert(listIncludes, commonKeys, "Io")
//     assert(listIncludes, commonKeys, "Json")
//     assert(listIncludes, commonKeys, "Server")
//     assert(listIncludes, commonKeys, "Str")
//     assert(listIncludes, commonKeys, "Websocket")
//     assert(listIncludes, commonKeys, "Core")
// }

// const test_breakn = () => {
//     var x = 0
//     while (true) {
//         x += 5
//         for (0..10, y) {
//             if (y == 5) {
//                 break(2)
//             }
//         }
//     }

//     assert(isEqual, x, 5)
// }

// const test_this = () => {
//     const obj = {
//         name: "John",
//         getName: () => this.name,
//         address: {
//             street: "123 Fake St.",
//             getStreet: () => this.street
//         }
//     }

//     const name = obj.getName()
//     const street = obj.address.getStreet()

//     assert(isEqual, name, "John")
//     assert(isEqual, street, "123 Fake St.")
// }

// const test_core = () => {

//     const { setMeta, getMeta } = Core

//     // Adding an operator
//     Core.addOperator("$avg", (a, b) => (a + b) / 2)
//     const avg = 5 $avg 3
//     assert(isEqual, avg, 4)
    
//     // Adding a variable
//     Core.addVariable("__x__", 500)
//     assert(isEqual, __x__, 500)

//     // Adding builtin
//     Core.updateBuiltin("asList", (...args) => args)
//     const ls = asList(1, 2, 3, 4, 5)
//     assert(listIncludes, ls, 3)
//     assert(isEqual, ls->length, 5)

//     // Removing builtin
//     Core.resetBuiltin("asList")
//     const fn = exec(`_vm.builtins.asList`)
//     assert(isEqual, fn, undefined)

//     // Setting Metadata

//     const user = {
//         name: "Alice",
//     }

//     const pUser = user->proxy({
//         set: {
//             _: (o, k, v, c) => {
//                 o->setMeta({
//                     modified: true
//                 })
//                 return v
//             }
//         }
//     })

//     pUser.age = 34

//     assert(isEqual, (pUser->getMeta).modified, true)
// }

// const test_config = () => {

//     // Test resolved paths
//     import [Math] : "@modules/math/math"

//     assert(isEqual, APP_ID, "A0001")
//     assert(isEqual, 4 $$ 3, 4)
//     assert(isEqual, Math.floor(4.5), 4)
//     assert(isEqual, __config->length, 4)
// }

// const test_common_functions = () => {

//     const arr = [5, 1, 3, 40, 2]
//     const num = 4.45432

//     const sortedArr = arr->sort
//     assert(isEqual, sortedArr[0], 1)
//     assert(isEqual, truncate(num), 4.45)
// }

// const test_currying = () => {
//     const curried = (fn) => {
//         const numParams = (fn->inspect).params->length
//         const arguments = []
//         const curry = (...args) => {
//             for (args, arg) {
//                 arguments->append(arg)
//                 if (arguments->length >= numParams) {
//                     return fn(...arguments)
//                 }
//             }
//             return curry
//         }
//         return curry
//     }
    
//     const add = curried((a, b) => a + b)
    
//     assert(isEqual, add(10)(20), 30)
// }

// const tests = getLocalTests()

// Test.run(...tests)

// Matrix :: [[Number]]
// matrix :: (Number, Number) => Matrix

// const matrix = (a, b) => {
//     return [[a, b], [a, b]]
// }

// var m = matrix(10, 20)
// m = matrix(100, 200)
// print(m)

// // forEach :: ([Any], (Any, Number) => Any) => Undefined

// const forEach = (arr, fn) => {
//     for (arr, value, index) {
//         fn(value, index)
//     }
// }

// add :: (Number, Number) => String

// const add = (a, b) => a + b

// var g = add(10, 20)
// g = "hi"

// exec :: (String) => Any
// eval :: (String) => Any
// print :: (...Any) => Undefined
// println :: (...Any) => Undefined
// length :: (Any) => Number
// raw :: (Any) => Raw
// keys :: (Any) => [String]
// value :: (Raw) => Any
// error :: (String) => Error
// exit :: (Number || Undefined) => Undefined
// dis :: (Function) => String
// break :: (Number) => String
// out :: (Any) => Any
// type :: (Any) => String
// class :: (Any) => Function || Native || Undefined
// append :: ([Any], Any) => [Any]
// insert :: ([Any], Any, Number) => [Any]
// pop :: ([Any]) => Any
// popf :: ([Any]) => Any
// remove :: ([Any], Number) => [Any]

// print(1, true)
// exec(100)
// print(length(1..10))
// var g = raw(100)
// value(g)

// sort :: ([Any], (Any, Any) => Number) => [Any]

// const _sort = exec("")

// const sort = (arr, fn = (a, b) => a - b) => {
//     return _sort(arr, fn)
// }

// var g = sort(1..10, (a, b) => {
//     if (a < b) {
//         return -1
//     } else {
//         return 1
//     }
// })

// g = 1

// stringify :: (T) => String
// const stringify = (value) => `{{value}}`

// id :: (T) => T

// blah :: (T, K) => T
// const blah = (a, b) => b

// var g = blah(10, 4)
// g = true

// numMap :: ([T], (Number) => Number) => [T]
// const numMap = (arr, fn) => arr

// inner :: (Number) => Number
// const inner = (value) => value * 2

// var f = numMap([1, 2], inner)

// f = ["1..10"]

// back :: ([T]) => T
// const back = (arr) => arr
// back(1..10)

// id :: (T) => [T]
// const id = (value) => value

// var x = id(10)
// x = ""

// var x = 100
// x = [true]
// print({x})


// fn :: (Number, Number) => Number
// const fn = (a, b) => a + b
// var f = fn(10, 20)
// f = true

// f :: (!Number) => Number
// const f = (n = 10) => n
// f(1, 2)

// blah :: (T, K) => T

// length :: ([Any]) => Number

// const len = (arr) => length(arr)

// const len2 = (arr) => len(arr)

// const arr = 1..10

// var g = len2(arr)

// g = true


// print(100)

// const g = true

// const f = (x) => x

// var x = f(1, 2)

// x = "100"

// print(100)

// fib :: (Number) => Number
// const fib = (n) => {
//     if (n <= 1) {
//         return n
//     }
//     return fib(n - 1) + fib(n - 2)
// }

// var f = fib(10)
// print(f)
// f = true

// const _toNumber = exec(`(value) => parseFloat(value)`)

// toNumber :: (Any) => Number
// const toNumber = (value) => _toNumber(value)

const foreach = (arr, fn) => fn(arr[0])

var g = foreach((1..10) + ["hi"], (e) => e)
g = foreach([1, 2, 3, "hi"], (e) => e)
g = true