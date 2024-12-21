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


// append :: ([T], T) => [T]

// const map = (arr, fn) => {

//     res :: [fn(arr[Number], Number)]

//     const res = []

//     for (arr, v, i) {
//         append(res, fn(v, i))
//     }

//     return res
// }

// var mappedNums = map(1..10, (e, i) => e * i)
// var mappedStrs = map(1..10, (e, i) => `{{e}}: {{i}}`)

// mappedStrs = mappedNums

// print({mappedNums, mappedStrs})

// fn :: (T) => T
// const fn = (x) => "10"

// var g = fn("1")
// g = true

// Blah :: (T) => Not(T)
// x :: Blah(Number)
// const x = 10

// NotT :: (T) => Not(T)
// NotANumber :: NotT(Number)
// NotAString :: NotT(String)

// Either :: (T, K) => T | K
// EitherStringOrT :: (T) => Either(String, T)
// z :: EitherStringOrT(Boolean | Number)

// NotNumber :: Exclude(Number | Boolean | String, Number | Boolean)
// x :: NotNumber
// const x = 1

// NotAType :: (T, K) => Exclude(T, K)
// NotANumber :: (T) => NotAType(T, Number)

// const g = 100
// const y = true

// x :: NotANumber(g)
// const x = g

// Fn :: (T, T) => ((T, T) => T)
// NumFn :: Fn(Number, Number)
// StrFn :: Fn(String, String)

// f :: StrFn | NumFn
// const f = (a, b) => a + b
// var res = f(1, 2)
// res = true

// NonNullable :: (T) => Exclude(T, Undefined)
// x :: NonNullable(Number)
// var x;

// append :: ([T], T) => [T]
// map :: ([T], ((T, Number) => K)) => [K]

// const map = (arr, fn) => {
//     Res :: Call(fn(arr[Number], Number))
//     res :: [Res]
//     const res = []
//     for (arr, v, i) {
//         append(res, fn(v, i))
//     }
//     return res
// }

// var res = map(1..10, (e, i) => 8)
// res = map(1..10, (e, i) => "e + i")

// f :: (T, String) => String
// const f = (a, b) => {
//     return a + b
// }

// var g = f(1, "1")
// g = true

// Bloop :: String | Number
// var g :: Bloop = 100
// g = true


// ==== Works ==== //


// add :: (a :: Number, b :: Number) => Number

// const add = (a, b) => a + b

// const g = add(30, 4)

// const f :: Number = g * 2

// print(f)

// type :: (value) => String

// var t :: String | Number = type(10)
// t = 10
// t = true

// print(t)

// bloop :: (value :: T) => [T]
// const str = "100"
// const bloop = (value) => [value, str]
// var g = bloop("bye")
// print(g)

// bloop2 :: (v::T, c::Number) => Number
// const bloop2 = (v, c) => c
// const h = bloop2(true, 500)

// fib :: (n::Number) => Number

// const fib = (n) => {
//     if (n <= 1) {
//         return n
//     } else {
//         return fib(n - 1) + fib(n - 2)
//     }

//     return 0
// }

// const fib5 = fib(10)
// print(fib5)

// Matrix :: [[Number]]
// const nums = 1..10
// const matrix :: Matrix = [[100, 100, 100], nums + [...nums]]

// createMatrix :: (n::Number, m::Number) => Matrix
// const createMatrix = (n, m = 5) => [n] * m

// Person :: {
//     name: String,
//     age: Number,
//     matrix: Matrix,
//     address: {
//         street: String
//     }
// }

// createPerson :: (name::String, age::Number) => Person
// const createPerson = (name, age) => {
//     return {
//         name, 
//         age,
//         matrix: createMatrix(fib(10)), 
//         address: {
//             street: "123 Fake Street"
//     }}
// }

// var p :: Person = createPerson("Jason", 45)
// p = createPerson("Jack", 33)

// print(p)

// proxy :: (object :: T is Object, handler :: Object) => T
// const prox :: String = proxy(p, {})

// objToList :: (obj :: T && Object) => [{id: T, nums: [Number]}]
// const objToList = (obj) => [{id: obj, nums: 1..10}]

// var x = objToList({a: 100})
// print(x)




// map :: (arr :: [T], fn :: (elem :: T, index :: Number) => K) => [K]
// const map = (arr, fn) => {
//     return [fn(arr[0], 0)]
// }

// const g :: String = map(1..10, (elem, index) => elem)

// blah :: (v :: T, fn :: (val :: T) => K) => K
// const blah = (v, fn) => fn(v)

// const g :: String = blah(10, (val) => val)
// print(g)

/* Types */

// add :: (a::Number, b::Number) => Number
// const add = (a, b) => a + b
// var g = add(5, 6)
// var z :: String = g

// id :: (v::T) => ({id: T})
// const id = (v) => ({id: v})

// var g :: {id: String} = id("10")
// var h :: {id: Number} = id(10)
// println(g, h)

// length :: (v) => Number

// listLength :: (v::[T]) => Number
// const listLength = (v) => length(v)

// var g = listLength(1..10)

// proxy :: (object :: T && Object, handler :: { get: Object, set: Object }) => T

// const obj = {name: "Jack", age: 34, address: {
//     street: "123 Fake Street",
//     postcode: 1234,
//     nums: 1..10
// }}

// const handler = {
//     get: {
//         name: (v) => [v]
//     }, 
//     set: {
//         name: (o, k, v, c) => {
//             return v
//         }
//     }
// }

// const p :: String = proxy(obj, handler)

// print(p)

// Vec3 :: (value :: T) => ({
//     x: T, y: T, z: T
// })

// vec3n :: (value :: Number) => Vec3(Number)
// vec3s :: (value :: String) => Vec3(String)

// const vec3n = (value) => ({
//     x: value, y: value * 2, z: value / 3.4
// })

// const vec3s = (value) => ({
//     x: value, y: value * 2, z: value * 10
// })

// const z :: Vec3(String) = vec3s("6")

// print(z)

// blah :: (v :: T, fn :: (val :: T) => K) => K
// const blah = (v, fn) => fn(v)

// const g :: String = blah(10, (val) => val)
// print(g)

// /* Builtins */
append :: (list :: [T], value :: T) => [T]
// insert :: (list :: [T], value :: T, index :: Number) => [T]
// length :: (value) => Number
// print :: (...args) => Undefined
// println :: (...args) => Undefined
// exec :: (expr :: String) => Any
// eval :: (expr :: String) => Any
// raw :: (expr) => Raw
// value :: (value :: Raw) => Object
// loadLib :: (filePath :: String) => Object
// error :: (message :: String) => Object
// exit :: (code :: Number) => Undefined
// dis :: (fn :: Function) => Undefined
// inspect :: (value) => Object // TODO: type this correctly
// break :: (num :: Number) => Undefined
// out :: (value :: T) => T
// type :: (value) => String
// class :: (value) => Native | Function | Undefined
// closures :: () => Object
// globals :: () => Object
// locals :: () => Object
// keys :: (value :: Object) => [String]
// delete :: (object :: Object, key :: String) => Object // TODO: return typed object minus the key
// pop :: (list :: [T]) => T | Undefined
popf :: (list :: [T]) => T | Undefined
// remove :: (list :: [T], index :: Number) => [T]
// proxy :: (object :: T && Object, handler :: Object) => T // TODO: type handler correctly, and possibly the returned object based on the handler's types
// __builtins :: () => Object // TODO: type this correctly
// __frame :: (n :: Number) => ({
//     line: Number,
//     col: Number,
//     filePath: String,
//     name: String,
//     vmPath: String,
//     locals: Object
// })

map :: (list :: [T], fn :: (val :: T, index :: Number) => K) => [K]

const map = (arr, fn) => {
    var res :: [fn(arr[Number], Number)] = []
    for (arr, value, index) {
        append(res, fn(value, index))
    }
    return res
}

const g :: [String] = map(1..10, (v, i) => ({id: popf([v])}))
print(g)


// blah :: (x::Number) => Number
// const blah = (someValue) => someValue
// const blah2 :: blah = (val) => val
// const g :: String = blah2(8)

// const blah = (x = "hi") => 100

// const f :: String = blah

// Fn :: (x::T) => [T]
// const fn = (x) => [x]

// Person :: {
//     name: String,
//     age: Number,
//     address: {
//         street: String,
//         postcode: Number,
//         fn: (x::T) => [T]
//     }
// }

// const person :: Person = {name: "Jack", age: 34, address: {
//     street: "123 Fake Street",
//     postcode: 1234,
//     fn: (x) => [x]
// }}

// const g :: Number = person.address.fn(1..10)