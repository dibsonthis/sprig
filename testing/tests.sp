const Test = Testing.Test({
    // verbose: true
    errorsOnly: true
})

const {
    assert, 
    isEqual, 
    isNotEqual, 
    listIncludes, 
    objectHas, 
    getLocalTests
} = Test

const test_object = () => {
    const PI = 3.14
    const key = "id"
    const person = {
        token: "_-_",
        nums: (1...3),
        bloop: {
            a: 10 + 4,
            b: 20,
            c: (1...4),
            d: (const d = 1200) + (const e = 1.4)
        },
        [key]: PI
    }

    person.nums[0] = 100
    person.bloop.c[0] = person.token * person.bloop.a
    person.bloop.e = person.bloop.d + d

    assert(isEqual, person.token, "_-_")
    assert(isEqual, person.id, 3.14)
    assert(isEqual, person.bloop.e, 2401.4)
    assert(isEqual, person.bloop.e, 2401.4)
}

const test_coroutines = () => {
    const coro = () => {
        var x = 0
        while (true) {
            yield x += 1
        }
    }

    const c1 = coro();

    while ((let c = c1()) <= 10) {
        // do nothing
    }

    assert(isEqual, c, 11)

    const coroAdvanced = (init, value) => {
        var x = init
        while (true) {
            yield x += value
        }
    }

    const cAdvanced = coroAdvanced(100);

    const res = cAdvanced(20)

    assert(isEqual, res, 120)
}

const test_server = () => {
    const {use, get, send, json, listen} = Server
    const port = 3000

    const app = Server.new()

    app->get("/", (req, res) => {
        res->send('<h1 onclick="console.log(`hello`)"> Hello World </h1>')
    })

    app->get("/users/:id", (req, res) => {
        const id = (req->value).params.id
        fetch("https://jsonplaceholder.typicode.com/todos/" + id, (data) => {
            if (!data) {
                res->json({error: {code: 404, message: `ID {{id}} not found`}})
            } else {
                res->json(data)
            }
        })
    })

    app->listen(port, () => print(`Listening on port {{port}}...`))
}

const test_websocket = () => {
    const {client, on, send, createReadLineInterface} = Websocket
    const {parse} = Json

    const wsc = client("wss://stream.binance.com:9443/ws/btcusdt@trade")
    const rl = createReadLineInterface()

    const n = 1000

    var price;
    var lastPrice;
    var secondLastPrice;

    interval(n, () => {
        secondLastPrice = lastPrice
        lastPrice = price
        const diff = (lastPrice - secondLastPrice)->truncate(3)
        
        const diffString = 
            diff > 0 ? `\e[32m${{diff}}\e[0m` : `\e[31m${{diff}}\e[0m`

        print(`Price: {{lastPrice}} ({{diffString}})`)
    })

    rl->on("line", (data) => {
        wsc->send(data)
    })

    wsc->on("open", (e) => {
        print("Opening connection")
    })

    wsc->on("message", (e) => {
        const parsed = parse(e)
        price = (parsed.p)->toNumber
    })

    wsc->on("close", (e) => {
        print("Closing connection")
    })
}

const test_sdl = () => {

    const sdl_import_path = "../modules/sdl/sdl.sp"
    import sdl : sdl_import_path

    const windowOptions = {
        title: `TESTING: {{sdl_import_path}}`,
        resizable: true,
    }

    const window = sdl.createWindow(windowOptions)
    const windowObject = window->value()

    const _buildBuffer = jsEval(`(height, width) => {
        const stride = width * 4
        const buffer = Buffer.alloc(stride * height)

        let offset = 0
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                buffer[offset++] = Math.floor(256 * i / height) // R
                buffer[offset++] = Math.floor(256 * j / width)  // G
                buffer[offset++] = 0                            // B
                buffer[offset++] = 255                          // A
            }
        }

        return buffer
    }
    `)


    {height: Number, width: Number}
    const buildBuffer = (height, width) => _buildBuffer(height, width)

    const redraw = () => {
        const height = windowObject._pixelHeight
        const width = windowObject._pixelWidth
        const buffer = buildBuffer(height, width)
        sdl.render(window, width, height, width * 4, 'rgba32', buffer)
    }

    sdl.on("*", window, (e, v) => {
        print(`{{e}} -> {{v}}`)
        if (e == "keyDown" && v.key == "escape") {
            exit()
        }
    })
    sdl.on("resize", window, redraw)
}

const test_fetch = () => {
    const endpoint = "https://jsonplaceholder.typicode.com/todos/"

    fetch(endpoint + "1", (data) => {
        assert(isEqual, data.id, 1)
        return fetch(endpoint + `{{data.id + 1}}`)
    })->then((data) => {
        assert(isEqual, data.id, 2)
        return fetch(endpoint + `{{data.id + 1}}`)
    })->then((data) => {
        assert(isEqual, data.id, 3)
        return fetch(endpoint + `{{data.id + 1}}`)
    })->then((data) => {
        assert(isEqual, data.id, 4)
    })->catch((e) => print((e->value).message))
}

const test_cache_fetch = () => {
    var fetch_cache = {}

    const cacheFetch = (endpoint, callback) => {
        if (fetch_cache[endpoint]) {
            return promise(callback(fetch_cache[endpoint]))
        }
        
        fetch(endpoint, (data) => {
            fetch_cache[endpoint] = data
            callback(data)
        })
    }

    cacheFetch("https://jsonplaceholder.typicode.com/todos/1", (data) => {
        assert(isEqual, data.id, 1)
    })->then(() => {
        cacheFetch("https://jsonplaceholder.typicode.com/todos/1", (data) => {
            assert(isEqual, data.id, 1)
        })
    })->then(() => {
        cacheFetch("https://jsonplaceholder.typicode.com/todos/1", (data) => {
            assert(isEqual, data.id, 1)
        })
    })->catch((e) => print((e->value).message))
}

const test_counter = () => {
    const Counter = (init = 0) => {
        var count = {
            value: init
        }
        return [() => count.value += 1, count]
    }

    const [counter1, c1] = Counter()
    const [counter2, c2] = Counter()

    counter1()
    counter1()
    counter2()

    assert(isEqual, c1.value, 2)
    assert(isEqual, c2.value, 1)
}

const test_obj_reducer = () => {
    const props = [
        ["name", "Jack"],
        ["age", 34],
        ["nums", 1...10]
    ]

    const obj = props->reduce((obj, kv) => {
        const [key, value] = kv
        obj[key] = value
        return obj
    }, {})

    assert(isEqual, obj->length, 3)
    assert(isEqual, obj.name, "Jack")
    assert(isEqual, obj.age, 34)
    assert(isEqual, obj.nums->length, 10)

}

const test_wrappers = () => {
    const div = (a, b) => {
        return a / b
    }

    const logWrapper = (fn, ...args) => {
        return fn(...args)
    }

    const doubleWrapper = (fn, ...args) => {
        return fn(...args) * 2
    }

    const listWrapper = (fn, ...args) => {
        return [fn(...args)]
    }

    const createWrappers = (fn, ...wrappers) => {
        return wrappers->reduce((fn, wrapper) => {
            return (...args) => wrapper(fn, ...args);
        }, fn)
    }

    const f = div->createWrappers(logWrapper, doubleWrapper, listWrapper)

    const res1 = f(10, 2);
    const res2 = f(5, 4);

    assert(isEqual, res1[0], 10)
    assert(isEqual, res2[0], 2.5)
}

const test_proxy = () => {
    const person = {
        name: "Jack",
        id: 43,
        address: {
            name: "123 Fake st."
        }
    }
    
    const handler = {
        repr: {
            _: (v) => "***"
        },
        get: {
            _: (v) => (v ? [v] : undefined)
        },
        set: {
            _: (o, k, v, c) => {
                if (o[k]) {
                    return v
                }
                return undefined
            }
        },
    }
    
    const personProxy = person->proxy(handler)
    personProxy.age = 45
    personProxy.id = 1001

    assert(isEqual, personProxy.name[0], "Jack")
    assert(isEqual, personProxy.id[0], 1001)
    assert(isEqual, personProxy.age, undefined)
}

const test_validation = () => {

    const typeValidator = (t) => ((v, c) => {
        if (v->type != t) {
            return c
        }
        return v
    })
    
    const rangeValidator = (min, max) => ((v, c) => {
        if (v < min) {
            return min
        }
        if (v > max) {
            return max
        }
        return v
    })

    const readonlyValidator = (v, c) => {
        return c
    }
    
    const customValidator = (v, c) => {
        if (v->length > c->length) {
            return c
        }
        return v
    }
    
    const createHandler = (validation) => {
        var handler = {}
        validation->keys->forEach((key) => {
            const validation_prop = validation[key]
            if (validation_prop->type == Object) {
                handler[key] = validation_prop->createHandler
            } else {
                handler[key] = (v, c) => {
                   return validation_prop(v, c)
                }
            }
        })
        return handler
    }
    
    const createProxy = (obj, handler) => {
        const proxy = obj->proxy({set: handler})
        proxy->keys->forEach((key) => {
            const value = proxy[key]
            if (value->type == Object) {
                const res = value->createProxy(handler[key])
                proxy[key] = res
            }
        })
        return proxy
    }
    
    const createValidatedObject = (obj, validation) => {
        const handler = validation->createHandler
        const validatedObject = obj->createProxy(handler)
        return validatedObject
    }
    
    const obj = {
        name: "Jack",
        age: 34,
        address: {
            street: "123 Fake St.",
            postcode: 2113
        },
        num: 0,
        nums: 1..10,
        secret: "Shh it's a secret"
    }
    
    const validation = {
        name: typeValidator(String),
        age: typeValidator(Number),
        num: rangeValidator(0, 20),
        nums: customValidator,
        secret: readonlyValidator,
        address: {
            postcode: typeValidator(Number)
        }
    }
    
    const p = createValidatedObject(obj, validation)
    
    p.address.street = "18 Tirvala Road."
    p.address.postcode = "999"
    p.address.postcode = 144
    p.address.postcode = "ggg"
    p.num = 300
    p.secret = "new secret"

    assert(isEqual, p.secret, "Shh it's a secret")
    assert(isEqual, p.address.postcode, 144)
    assert(isEqual, p.num, 20)

    const Color = () => {
        return createValidatedObject({
            r: 0,
            g: 0,
            b: 0
        }, {
            r: rangeValidator(0, 255),
            g: rangeValidator(0, 255),
            b: rangeValidator(0, 255),
        })
    }
    
    const color = Color()
    color.r = 400
    color.b = -4

    assert(isEqual, color.r, 255)
    assert(isEqual, color.g, 0)
    assert(isEqual, color.b, 0)
}

const test_io = () => {
    const len = Io.readFile("tests.sp")->length
    assert(isNotEqual, len, 0)
}

const test_json = () => {
    const {parse, stringify} = Json

    const objStr = `{"name": "Allan", "age": 45, "nums": [1,2,3,4,5]}`

    const parsedObj = parse(objStr)
    parsedObj.nums[5] = 2 * 4.5

    assert(isEqual, parsedObj.nums[5], 9)
}

const test_list = () => {
    const arr = 1..10
    arr->insert(100, 5)
    arr->insert(-30)
    arr->append(450)
    const first = arr->popf()
    const last = arr->pop()
    arr->remove(arr->length - 1)

    assert(isEqual, first, -30)
    assert(isEqual, last, 450)
    assert(isEqual, arr[0], 2)

    while (arr->length > 0) {
        let front = arr->popf
    }

    assert(isEqual, arr->length, 0)
}

const test_imports = () => {
    const modules_path = "/Users/adib/Dev/Personal/Languages/newlang/src/modules"
    import io : `{{modules_path}}/io/io.sp`
    assert(isNotEqual, io.readFile, undefined)
}

const test_classes = () => {
    const (Color) = (r = 0, g = 0, b = 0) => {
        const color = {r: 0, g: 0, b: 0}->proxy({
            repr: {
                r: (v) => `\e[31m{{v}}\e[0m`,
                g: (v) => `\e[32m{{v}}\e[0m`,
                b: (v) => `\e[34m{{v}}\e[0m`,
            },
            set: {
                _: (o, k, v, c) => {
                    if (v < 0) {
                        return 0
                    }
                    if (v > 255) {
                        return 255
                    }
                    return v
                }
            }
        })
    
        color.r = r
        color.g = g
        color.b = b
        
        return color
    }
    
    const c = Color()

    c.r = 20
    c.g = 400
    c.b = -34

    const constructor = c->class

    assert(isEqual, c.r, 20)
    assert(isEqual, c.g, 255)
    assert(isEqual, c.b, 0)

    const c2 = constructor(10, 20, 500)

    assert(isEqual, c2.r, 10)
    assert(isEqual, c2.g, 20)
    assert(isEqual, c2.b, 255)

    assert(isEqual, c->instanceOf(Color), true)
    assert(isEqual, c->instanceOf(constructor), true)

    const (Upper) = () => {
        const (Lower) = (name) => {
            return {name}
        }
    }

    const lower = Upper()
    const obj = lower("Allan")

    assert(isEqual, obj->instanceOf(Upper), false)
    assert(isEqual, obj->instanceOf(lower), true)
}

const test_raw_classes = () => {
    const _Buffer = jsEval(`(size) => Buffer.alloc(size)`)
    const Buffer = (size) => _Buffer(size)
    
    const buffer = Buffer(100)

    assert(isEqual, buffer->instanceOf(Buffer), false)
    assert(isEqual, buffer->instanceOf(buffer->class), true)
}

const test_common = () => {
    const commonKeys = __common
    ->keys
    ->filter((k) => k[0] != "_")

    assert(listIncludes, commonKeys, "instanceOf")
    assert(listIncludes, commonKeys, "includes")
    assert(listIncludes, commonKeys, "reduce")
    assert(listIncludes, commonKeys, "slice")
    assert(listIncludes, commonKeys, "timeout")
    assert(listIncludes, commonKeys, "interval")
    assert(listIncludes, commonKeys, "fetch")
    assert(listIncludes, commonKeys, "then")
    assert(listIncludes, commonKeys, "catch")
    assert(listIncludes, commonKeys, "delay")
    assert(listIncludes, commonKeys, "promise")
    assert(listIncludes, commonKeys, "toNumber")
    assert(listIncludes, commonKeys, "toString")
    assert(listIncludes, commonKeys, "truncate")
    assert(listIncludes, commonKeys, "Io")
    assert(listIncludes, commonKeys, "Json")
    assert(listIncludes, commonKeys, "Server")
    assert(listIncludes, commonKeys, "Str")
    assert(listIncludes, commonKeys, "Websocket")
}

const test_breakn = () => {
    var x = 0
    while (true) {
        x += 1
        for (0..10, y) {
            if (y == 5) {
                break(2)
            }
        }
    }

    assert((a, b) => a == b, x, 1)
    assert(isEqual, y, 5)
}

const tests = getLocalTests({
    exclude: ["test_sdl", "test_fetch", "test_cache_fetch", "test_server", "test_websocket"]
})

Test.run(...tests)