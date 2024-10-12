# Sprig 🌿 A Language Sprouting From NodeJS

Sprig is a dynamic programming language built on NodeJS that allows developers to write efficient and powerful code. It leverages the capabilities of NodeJS while providing its own syntax and useful extensions.

## Key Features

- **Bi-Directional Data Flow**: Sprig enables seamless data exchange between NodeJS and the Sprig environment, making it easy to utilize existing NodeJS libraries and functions within your Sprig code.

- **Extensibility**: Sprig is designed for easy extension, allowing developers to create native JS functionality on the fly to extend the language.

- **Integration with NodeJS**: Sprig takes advantage of NodeJS’s non-blocking I/O and asynchronous programming model, providing a robust framework for building scalable applications.

## Getting Started

1. **Installation**: Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/dibsonthis/sprig.git
   cd sprig
   npm install
   ```

2. **Build the executable**: Use the following command to build the sprig executable - this compiles and packages sprig into the bin folder:

   ```bash
   npm run package (or package:win for Windows)
   ```

3. **Install the executable**: To install sprig globally, use the following script:
   ```bash
   npm run bin (or bin:win for Windows)
   ```

### Your first Sprig program

```python
const greet = (name) => `Hey {{name}}, welcome to Sprig 🌿`

"friend"->greet->print // Hey friend, welcome to Sprig 🌿
greet("pal")->print() // Hey pal, welcome to Sprig 🌿
print(greet("buddy")) // Hey buddy, welcome to Sprig 🌿
```

### Leveraging NodeJS on the fly

```python
const nativeAdd = jsEval(`(a, b) => a + b`);
(100 + nativeAdd(20, 30))->print // 150

const rawBuffer = jsEval(`(size) => Buffer.alloc(size)`)
const buffer = rawBuffer(10)
print(buffer) // Buffer* Raw<object>
print(buffer->value) // { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, readBigUInt64LE: native: 'readBigUInt64LE' (offset = 0), readBigUInt64BE: native: 'readBigUInt64BE' (offset = 0) ... }
```

## Further Examples

### Proxy

Much like JS, we can create object proxies that whose native functionality can be intercepted via a handler object. Note that '\_' means the intercept applies to all the properties. Property keys can also be provided here for specificity.

```python
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

    print(personProxy.name[0]) // "Jack"
    print(personProxy.id[0]) // 1001
    print(personProxy.age) // undefined
```

## Classes

Classes are simply constructor functions in Sprig. The difference between a normal function and a constructor is the parentheses in the function name. Anything returned from a constructor will have its type be that constructor function.

```python
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

    print(c.r) // 20
    print(c.g) // 255
    print(c.b) // 0
```

## Common

Common built-ins can be accessed globally or through the \_\_common object.

```python
const commonKeys = __common
    ->keys
    ->filter((k) => k[0] != "_")
    ->print

// [instanceOf, includes, reduce, slice, timeout, interval, fetch, then, catch, delay, promise, toNumber, toString, truncate, Io, Json, Server, Str, Testing, Websocket]
```

## Config overrides

Adding a `config.sp` file at the top level can set global variables and create custom operators. Anything in the `globals` object will be injected into the global scope. Operators defined in `operators` can be either unary or binary based on the number of parameters provided.

These two objects can also be accessed via `__config`.

```python

// config.sp

const globals = {
    MODULES_PATH: "/some_path/modules",
}

const operators = {
    "$$": (a, b) => {
        return (a * b) / 3
    },
    "#": (v) => {
        return [v]
    },
}
```

More examples can be found in `testing/tests.sp`.

To run those tests using the built-in Testing suite, simply run:

```bash
sprig testing/tests.sp
```
