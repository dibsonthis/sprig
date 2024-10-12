// Native Functions
const _toChars = jsEval(`(str) => str ? Array.from(str) : []`)
const _startsWith = jsEval(`(str, substr) => str.startsWith(substr)`)

// Exported Functions
{str: String}
const toChars = (str) => _toChars(str)
{str: String, substr: String}
const startsWith = (str, substr) => _startsWith(str, substr)
