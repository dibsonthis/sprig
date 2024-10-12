const globals = {
    APP_ID: "A0001",
}

const operators = {
    "$$": (a, b) => {
        return (a * b) / 3
    },
    "#": (v) => {
        return [v]
    },
}