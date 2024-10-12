const globals = {
    MODULES_PATH: "/Users/adib/Dev/Personal/Languages/newlang/modules",
}

const operators = {
    "$$": (a, b) => {
        return (a * b) / 3
    },
    "#": (v) => {
        return [v]
    },
}