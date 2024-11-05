const lib = loadLib(__frame().vmPath + "/../modules/io/io.js")

{filePath: String}
const readFile = (filePath) => lib.readFile(filePath)

{filePath: String, content: String}
const writeFile = (filePath, content) => lib.writeFile(filePath, content)