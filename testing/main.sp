/* Builtin Types */
append :: (list :: [T], value :: T) => [T]
insert :: (list :: [T], value :: T, index :: Number) => [T]
length :: (value) => Number
print :: (...args) => Undefined
println :: (...args) => Undefined
exec :: (expr :: String) => Any
eval :: (expr :: String) => Any
raw :: (expr) => Raw
value :: (value :: Raw) => Object
loadLib :: (filePath :: String) => Object
error :: (message :: String) => Object
exit :: (code :: Number) => Undefined
dis :: (fn :: Function) => Undefined
inspect :: (value) => Object // TODO: type this correctly
break :: (num :: Number) => Undefined
out :: (value :: T) => T
type :: (value) => String
class :: (value) => Native | Function | Undefined
closures :: () => Object
globals :: () => Object
locals :: () => Object
keys :: (value :: Object) => [String]
delete :: (object :: Object, key :: String) => Object // TODO: return typed object minus the key
pop :: (list :: [T]) => T | Undefined
popf :: (list :: [T]) => T | Undefined
remove :: (list :: [T], index :: Number) => [T]
proxy :: (object :: T && Object, handler :: Object) => T // TODO: type handler correctly, and possibly the returned object based on the handler's types
__builtins :: () => Object // TODO: type this correctly
__frame :: (n :: Number) => ({
    line: Number,
    col: Number,
    filePath: String,
    name: String,
    vmPath: String,
    locals: Object
})