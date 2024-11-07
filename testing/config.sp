const globals = {
    APP_ID: "A0001",
    sayHi: () => print("hi")
}

const operators = {
    "$$": (a, b) => {
        return (a * b) / 3
    },
    "#": (v) => {
        return [v]
    },
}

const paths = {
    "@modules": "../modules",
}