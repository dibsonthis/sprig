// Native Functions
const _toChars = exec(`(str) => str ? Array.from(str) : []`)
const _startsWith = exec(`(str, substr) => str.startsWith(substr)`)
const _split = exec(`(str, separator = " ") => str.split(separator)`)

// Exported Functions
{str: String}
const toChars = (str) => _toChars(str)
{str: String, substr: String}
const startsWith = (str, substr) => _startsWith(str, substr)
{str: String, separator: String}
const split = (str, separator) => _split(str, separator)
