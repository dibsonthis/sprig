// import { Node, NodePayload, NodeType, FuncNode, SymbolTable } from "../types";
// import { Lexer } from "../lexer/lexer";
// import { Parser } from "../parser/parser";
// import { config } from "../config";
// import { getParamNames } from "../utils/utils";
// import path from "path";
// import fs from "fs";
// export class Evaluator {
//   private nodes: Node[];
//   private node: Node;
//   private index: number = 0;

//   public symbols: SymbolTable = {};
//   public tempVars: SymbolTable = {};
//   public cachedImports = {};
//   public filePath: string;

//   private errorAndContinue(message: string, node?: Node) {
//     const errorNode = node ? node : this.node;
//     console.error(
//       "\x1b[31m%s\x1b[0m",
//       `Error at (${errorNode.line}:${errorNode.col}) in '${path.resolve(
//         this.filePath
//       )}': ${message}`
//     );
//   }

//   constructor(nodes: Node[], filePath: string = ".") {
//     this.nodes = nodes;
//     this.node = this.nodes[0];
//     this.filePath = filePath;
//   }

//   private advance() {
//     this.index += 1;
//     this.node = this.nodes[this.index];
//   }

//   private newNode(type: NodeType = "Undefined", value?: any): Node {
//     return {
//       col: this.node.col,
//       line: this.node.line,
//       type,
//       value,
//       evaluated: true,
//     };
//   }

//   private newError = (message: string): Node => ({
//     type: "Error",
//     value: message,
//     line: this.node.line,
//     col: this.node.col,
//   });

//   private toString(node: Node): string {
//     switch (node.type) {
//       case "ID":
//       case "Number":
//       case "String":
//       case "Boolean": {
//         return node.value.toString();
//       }
//       case "Object": {
//         var repr = "{ ";
//         const keys = Object.keys(node.value);
//         for (let i = 0; i < keys.length; i++) {
//           const key = keys[i];
//           const value = node.value[key];
//           if (value?.type === "String") {
//             repr += `${key}: "${this.toString(value)}"`;
//           } else {
//             repr += `${key}: ${this.toString(value)}`;
//           }
//           if (i < keys.length - 1) {
//             repr += ", ";
//           }
//         }
//         repr += " }";
//         return repr;
//       }
//       case "Undefined": {
//         return "undefined";
//       }
//       case "Library": {
//         return `Library {${Object.keys(node.libNode?.exports ?? {})}}`;
//       }
//       case "List": {
//         var repr = "[";
//         repr += node.nodes?.map((elem) => this.toString(elem)).join(", ");
//         repr += "]";
//         return repr;
//       }
//       case "Function": {
//         const params = node.funcNode.params
//           .map((e) => this.toString(e))
//           .join(", ");
//         return `function: '${node.funcNode?.name ?? "anonymous"}' (${params})`;
//       }
//       case "Native": {
//         return `native: '${
//           node.nativeNode?.name ?? "anonymous"
//         }' (${getParamNames(node.nativeNode.function)})`;
//       }
//       case "Operator": {
//         return `${this.toString(node.left)} ${node.value} ${this.toString(
//           node.right
//         )}`;
//       }
//       case "Raw": {
//         return `Raw: ${node.value}`;
//       }
//       default: {
//         return "undefined";
//       }
//     }
//   }

//   private nativeFunctions = {
//     cwd: (args: Node[]) => {
//       console.log(process.cwd());
//     },
//     loadLib: (args: Node[]) => {
//       if (args.length !== 1) {
//         return this.newError("Function 'loadLib' expects 1 argument(s)");
//       }
//       const filePath = args[0];
//       if (filePath.type !== "String") {
//         return this.newError(
//           "Function 'loadLib' argument 'filePath' to be a List"
//         );
//       }

//       const lib = require(path.resolve(filePath.value));

//       const libObj = this.newNode("Object");
//       libObj.evaluated = true;
//       libObj.value = {};

//       for (const prop in lib) {
//         const nativeNode = this.newNode("Native");
//         nativeNode.nativeNode = { name: prop, function: lib[prop] };
//         libObj.value[prop] = nativeNode;
//       }

//       return libObj;
//     },
//     functions: (args: Node[]) => {
//       if (args.length !== 1) {
//         return this.newError("Function 'functions' expects 1 argument(s)");
//       }
//       const lib = args[0];
//       if (lib.type !== "Library") {
//         return this.newError(
//           "Function 'functions' argument 'lib' to be a Libray"
//         );
//       }
//       const functions = this.newNode("Object", lib.value);
//       functions.evaluated = true;
//       return functions;
//     },
//     call: (args: Node[]) => {
//       if (args.length !== 3) {
//         return this.newError("Function 'call' expects 3 argument(s)");
//       }
//       const lib = args[0];
//       const fnName = args[1];
//       const argsList = args[2];

//       if (lib.type !== "Library") {
//         return this.newError(
//           "Function 'call' argument 'library' to be a Library"
//         );
//       }
//       if (fnName.type !== "String") {
//         return this.newError(
//           "Function 'call' argument 'fnName' to be a String"
//         );
//       }
//       if (argsList.type !== "List") {
//         return this.newError("Function 'call' argument 'args' to be a List");
//       }
//       const fn = lib.libNode?.exports[fnName.value];
//       if (!fn) {
//         return this.newError(`Function '${fnName.value}' is undefined`);
//       }
//       return fn(argsList.nodes);
//     },
//     run: (args: Node[]) => {
//       if (args.length < 1) {
//         return this.newError("Function 'run' expects at least 1 argument(s)");
//       }
//       const native = args[0];
//       if (native.type !== "Native") {
//         return this.newError(
//           "Function 'run' argument 'nativeFn' to be a Native"
//         );
//       }

//       const nativeArgs = args.slice(1).map((elem) => this.nodeToJS(elem));

//       const res = native.nativeNode.function(...nativeArgs);
//       return this.jsToNode(res);
//     },
//     runRaw: (args: Node[]) => {
//       if (args.length < 1) {
//         return this.newError(
//           "Function 'runRaw' expects at least 1 argument(s)"
//         );
//       }
//       const native = args[0];
//       if (native.type !== "Native") {
//         return this.newError(
//           "Function 'runRaw' argument 'nativeFn' to be a Native"
//         );
//       }

//       const nativeArgs = args.slice(1).map((elem) => this.nodeToJS(elem));

//       const res = native.nativeNode.function(...nativeArgs);
//       return this.newNode("Raw", res);
//     },
//     schema: (args: Node[]) => {
//       if (args.length != 2) {
//         return this.newError("Function 'schema' expects 2 argument(s)");
//       }
//       const node = args[0];
//       const schema = args[1];
//       if (schema.type !== "Object") {
//         return this.newError(
//           "Function 'schema' argument 'schema' to be an Object"
//         );
//       }
//       node.schema = schema;
//       return node;
//     },
//     print: (args: Node[]) => {
//       args.forEach((node) => {
//         process.stdout.write(this.toString(node));
//       });
//       process.stdout.write("\n");
//     },
//     println: (args: Node[]) => {
//       args.forEach((node) => {
//         console.log(this.toString(node));
//       });
//     },
//     forEach: (args: Node[]) => {
//       if (args.length !== 2) {
//         return this.newError("Function 'forEach' expects 2 arguments");
//       }
//       const arr = args[0];
//       const fn = args[1];
//       if (arr.type !== "List") {
//         return this.newError("Function 'forEach' argument 'list' to be a List");
//       }
//       if (fn.type !== "Function") {
//         return this.newError(
//           "Function 'forEach' argument 'fn' to be a Function"
//         );
//       }

//       const fnCall = this.newNode("FunctionCall");
//       const argsNode = this.newNode("List");

//       arr.nodes?.forEach((elem, index) => {
//         // const fnCall = this.newNode("FunctionCall");
//         // const argsNode = this.newNode("List");
//         argsNode.nodes = [elem];
//         if (fn.funcNode?.params.length == 2) {
//           argsNode.nodes.push(this.newNode("Number", index));
//         }
//         fnCall.left = fn;
//         fnCall.right = argsNode;
//         this.evaluateFunctionCall(fnCall);
//       });
//     },
//     map: (args: Node[]) => {
//       if (args.length !== 2) {
//         return this.newError("Function 'map' expects 2 arguments");
//       }
//       const arr = args[0];
//       const fn = args[1];
//       if (arr.type !== "List") {
//         return this.newError("Function 'map' argument 'list' to be a List");
//       }
//       if (fn.type !== "Function") {
//         return this.newError("Function 'map' argument 'fn' to be a Function");
//       }

//       const newArr = { ...arr };

//       newArr.nodes = newArr.nodes?.map((elem, index) => {
//         const fnCall = this.newNode("FunctionCall");
//         const argsNode = this.newNode("List");
//         argsNode.nodes = [elem];
//         if (fn.funcNode?.params.length == 2) {
//           argsNode.nodes.push(this.newNode("Number", index));
//         }
//         fnCall.left = fn;
//         fnCall.right = argsNode;
//         return this.evaluateFunctionCall(fnCall);
//       });

//       return newArr;
//     },
//     filter: (args: Node[]) => {
//       if (args.length !== 2) {
//         return this.newError("Function 'filter' expects 2 arguments");
//       }
//       const arr = args[0];
//       const fn = args[1];
//       if (arr.type !== "List") {
//         return this.newError("Function 'filter' argument 'list' to be a List");
//       }
//       if (fn.type !== "Function") {
//         return this.newError(
//           "Function 'filter' argument 'fn' to be a Function"
//         );
//       }

//       const newArr = { ...arr };

//       newArr.nodes = newArr.nodes?.filter((elem, index) => {
//         const fnCall = this.newNode("FunctionCall");
//         const argsNode = this.newNode("List");
//         argsNode.nodes = [elem];
//         if (fn.funcNode?.params.length == 2) {
//           argsNode.nodes.push(this.newNode("Number", index));
//         }
//         fnCall.left = fn;
//         fnCall.right = argsNode;
//         const res = this.evaluateFunctionCall(fnCall);
//         if (res.type === "Boolean") {
//           return res.value;
//         }
//         return false;
//       });

//       return newArr;
//     },
//     length: (args: Node[]) => {
//       if (args.length !== 1) {
//         return this.newError("Function 'length' expects 1 argument");
//       }
//       const node = args[0];
//       switch (node.type) {
//         case "String":
//           return this.newNode("Number", node.value.length);
//         case "List":
//           return this.newNode("Number", node.nodes?.length ?? 0);
//         case "Object":
//           return this.newNode("Number", Object.keys(node.value).length);
//         default: {
//           return this.newNode();
//         }
//       }
//     },
//     error: (args: Node[]) => {
//       if (args.length !== 1) {
//         return this.newError("Function 'error' expects 1 argument");
//       }
//       const message = args[0];
//       if (message.type !== "String") {
//         return this.newError(
//           "Function 'error' argument 'message' to be a string"
//         );
//       }
//       return this.newError(message.value);
//     },
//     type: (args: Node[]) => {
//       if (args.length !== 1) {
//         return this.newError("Function 'type' expects 1 argument");
//       }
//       const node = args[0];
//       return this.newNode("String", node.type.toString());
//     },
//     replace: (args: Node[]) => {
//       if (args.length !== 3) {
//         return this.newError("Function 'replace' expects 2 argument(s)");
//       }

//       const str = args[0];
//       if (str.type !== "String") {
//         return this.newError(
//           "Function 'replace' argument 'str' to be a string"
//         );
//       }
//       const from = args[1];
//       if (from.type !== "String") {
//         return this.newError(
//           "Function 'replace' argument 'from' to be a string"
//         );
//       }
//       const to = args[2];
//       if (from.type !== "String") {
//         return this.newError("Function 'replace' argument 'to' to be a string");
//       }

//       const regexp = new RegExp(from.value, "g");

//       return this.newNode(
//         "String",
//         (str.value as string).replace(regexp, to.value)
//       );
//     },
//     eval: (args: Node[]) => {
//       if (args.length !== 1 && args.length !== 2) {
//         return this.newError("Function 'eval' expects 1 or 2 argument(s)");
//       }

//       const node = args[0];
//       if (node.type !== "String") {
//         return this.newError("Function 'eval' argument 'expr' to be a string");
//       }

//       if (args.length === 1) {
//         const res = this.eval(node.value);
//         return res;
//       }

//       const env = args[1];
//       if (env.type !== "Object") {
//         return this.newError("Function 'eval' argument 'env' to be an object");
//       }

//       const res = this.eval(node.value, env);
//       return res;
//     },
//     exec: (args: Node[]) => {
//       if (args.length !== 1) {
//         return this.newError("Function 'exec' expects 1 argument(s)");
//       }

//       const expr = args[0];
//       if (expr.type !== "String") {
//         return this.newError(
//           "Function 'exec' argument 'expr' to be a string"
//         );
//       }
//       try {
//         const res = eval(expr.value);
//         return this.jsToNode(res);
//       } catch (e) {
//         return this.newError(e);
//       }
//     },
//     raw: (args: Node[]) => {
//       if (args.length !== 1) {
//         return this.newError("Function 'raw' expects 1 argument(s)");
//       }

//       const expr = args[0];
//       if (expr.type !== "String") {
//         return this.newError("Function 'raw' argument 'expr' to be a string");
//       }
//       try {
//         const res = eval(expr.value);
//         return this.newNode("Raw", res);
//       } catch (e) {
//         return this.newError(e);
//       }
//     },
//     value: (args: Node[]) => {
//       if (args.length !== 1) {
//         return this.newError("Function 'value' expects 1 argument(s)");
//       }
//       const node = args[0];
//       if (node.type !== "Raw") {
//         return this.newError("Function 'value' argument 'rawVal' to be a Raw");
//       }

//       return this.jsToNode(node.value);
//     },
//   };

//   public nodeToJS(node: Node) {
//     switch (node.type) {
//       case "String":
//       case "Boolean":
//       case "Number": {
//         return node.value;
//       }
//       case "Raw": {
//         return node.value;
//       }
//       case "List": {
//         const arr = [];
//         node.nodes.forEach((elem) => arr.push(this.nodeToJS(elem)));
//         return arr;
//       }
//       case "Object": {
//         const obj = {};
//         for (const prop in node.value) {
//           obj[prop] = this.nodeToJS(node.value[prop]);
//         }
//         return obj;
//       }
//       case "Native": {
//         return node.nativeNode.function;
//       }
//       case "Function": {
//         return node;
//       }
//       default:
//         return undefined;
//     }
//   }

//   public jsToNode(res) {
//     if (res === null || res === undefined) {
//       return this.newNode();
//     }
//     if (res["__type__"] === "Raw") {
//       return this.newNode("Raw", res.value);
//     }
//     if (typeof res === "string") {
//       return this.newNode("String", res);
//     }

//     if (typeof res === "number" || typeof res === "bigint") {
//       return this.newNode("Number", res);
//     }

//     if (typeof res === "boolean") {
//       return this.newNode("Boolean", res);
//     }

//     if (typeof res === "undefined") {
//       return this.newNode();
//     }

//     if (typeof res === "object") {
//       if (Array.isArray(res)) {
//         const arr = this.newNode("List");
//         arr.nodes = [];
//         res.forEach((elem) => {
//           arr.nodes.push(this.jsToNode(elem));
//         });
//         arr.evaluated = true;
//         return arr;
//       }

//       const obj = this.newNode("Object");
//       obj.value = {};

//       if (res["__type__"] == "error") {
//         return this.newError(res["message"] ?? "");
//       }

//       for (const prop in res) {
//         obj.value[prop] = this.jsToNode(res[prop]);
//       }

//       return obj;
//     }

//     if (typeof res === "function") {
//       const native = this.newNode("Native");
//       native.nativeNode = {
//         name: res.name,
//         function: res,
//       };
//       return native;
//     }

//     return this.newNode();
//   }

//   public evaluateFunctionWithArgs(fn: Node, args: Node[]) {
//     if (fn.type !== "Function") {
//       return this.newNode();
//     }

//     const functionCall = this.newNode("FunctionCall");
//     functionCall.left = fn;
//     functionCall.right = this.newNode("List");
//     functionCall.right.nodes = args;

//     return this.evaluateFunctionCall(functionCall);
//   }

//   private evaluateOperator(op: Node): Node {
//     let left = op.left;
//     let right = op.right as Node;

//     if (!op.right) {
//       return this.newNode();
//     }

//     const rightCopy: Node = { ...op.right };

//     if (op.value !== "=" && op.value !== "else" && op.value !== "&&") {
//       left = this.evaluateNode(op.left);
//     }

//     if (right?.type === "Accessor") {
//       right.left = this.evaluateNode(right.left);
//       right.right = this.evaluateNode(right.right);
//       if (rightCopy.left?.type === "ID" && right.left.type === "Undefined") {
//         right.left = rightCopy.left;
//       }
//     } else if (right?.type === "FunctionCall") {
//     } else if (op.value === "else" || op.value === "&&") {
//     } else {
//       right = this.evaluateNode(op.right);
//     }

//     // op.left = undefined;
//     // op.right = undefined;

//     if (left?.type == "Error") {
//       return left;
//     }
//     if (right?.type == "Error") {
//       return right;
//     }

//     switch (op.value) {
//       case "+": {
//         if (op.meta?.unary && right.type === "Number") {
//           return right;
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Number", left.value + right.value);
//         }

//         if (left?.type === "String" && right?.type === "String") {
//           return this.newNode("String", left.value + right.value);
//         }

//         if (left?.type === "List" && right?.type === "List") {
//           const newList = {
//             ...left,
//             nodes: [...(left.nodes ?? []), ...(right.nodes ?? [])],
//           };
//           return newList;
//         }

//         return this.newNode("Undefined");
//       }

//       case "-": {
//         if (op.meta?.unary && right.type === "Number") {
//           return { ...right, value: -right.value };
//         }

//         if (op.meta?.unary && right.type === "List") {
//           return { ...right, nodes: right.nodes?.splice(0).reverse() };
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Number", left.value - right.value);
//         }

//         return this.newNode("Undefined");
//       }

//       case "*": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Number", left.value * right.value);
//         }

// if (left?.type === "Number" && right?.type === "String") {
//   const node = this.newNode("String", "");
//   for (let i = 0; i < left.value; i++) {
//     node.value += right.value;
//   }
//   return node;
// }

// if (left?.type === "String" && right?.type === "Number") {
//   const node = this.newNode("String", "");
//   for (let i = 0; i < right.value; i++) {
//     node.value += left.value;
//   }
//   return node;
// }

// if (left?.type === "Number" && right?.type === "List") {
//   const node = this.newNode("List");
//   node.nodes = [];
//   for (let i = 0; i < left.value; i++) {
//     const innerNode = this.newNode("List");
//     innerNode.nodes = right.nodes?.slice(0);
//     node.nodes.push(innerNode);
//   }
//   return node;
// }

// if (left?.type === "List" && right?.type === "Number") {
//   const node = this.newNode("List");
//   node.nodes = [];
//   for (let i = 0; i < right.value; i++) {
//     const innerNode = this.newNode("List");
//     innerNode.nodes = left.nodes?.slice(0);
//     node.nodes.push(innerNode);
//   }
//   return node;
// }

//         return this.newNode("Undefined");
//       }

//       case "/": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Number", left.value / right.value);
//         }

//         return this.newNode("Undefined");
//       }

//       case "<": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Boolean", left.value < right.value);
//         }

//         return this.newNode("Undefined");
//       }

//       case ">": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Boolean", left.value > right.value);
//         }

//         return this.newNode("Undefined");
//       }

//       case "<=": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Boolean", left.value <= right.value);
//         }

//         return this.newNode("Undefined");
//       }

//       case ">=": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Boolean", left.value >= right.value);
//         }

//         return this.newNode("Undefined");
//       }

//       case "+=": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         const eqNode = this.newNode("Operator", "=");
//         eqNode.evaluated = false;
//         eqNode.left = op.left;
//         eqNode.right = this.newNode("Operator", "+");
//         eqNode.right.evaluated = false;
//         eqNode.right.left = op.left;
//         eqNode.right.right = op.right;

//         const res = this.evaluateNode(eqNode);
//         return res;
//       }

//       case "-=": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         const eqNode = this.newNode("Operator", "=");
//         eqNode.evaluated = false;
//         eqNode.left = op.left;
//         eqNode.right = this.newNode("Operator", "-");
//         eqNode.right.evaluated = false;
//         eqNode.right.left = op.left;
//         eqNode.right.right = op.right;

//         const res = this.evaluateNode(eqNode);
//         return res;
//       }

//       case "%": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Number", left.value % right.value);
//         }

//         return this.newNode("Undefined");
//       }

//       case "==": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Boolean", left.value == right.value);
//         }

//         if (left?.type === "String" && right?.type === "String") {
//           return this.newNode("Boolean", left.value == right.value);
//         }

//         if (left?.type === "Boolean" && right?.type === "Boolean") {
//           return this.newNode("Boolean", left.value == right.value);
//         }

//         if (left?.type === "Undefined" && right?.type === "Undefined") {
//           return this.newNode("Boolean", true);
//         }

//         // TODO: lists and objects

//         return this.newNode("Boolean", false);
//       }

//       case "!=": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Boolean", left.value != right.value);
//         }

//         if (left?.type === "String" && right?.type === "String") {
//           return this.newNode("Boolean", left.value != right.value);
//         }

//         if (left?.type === "Boolean" && right?.type === "Boolean") {
//           return this.newNode("Boolean", left.value != right.value);
//         }

//         if (left?.type === "Undefined" && right?.type === "Undefined") {
//           return this.newNode("Boolean", false);
//         }

//         // TODO: lists and objects

//         return this.newNode("Boolean", true);
//       }

//       case "!": {
//         if (op.meta?.unary) {
//           if (right.type === "Boolean") {
//             return this.newNode("Boolean", !right.value);
//           }
//           return this.newNode("Boolean", right.type === "Undefined");
//         }

//         return this.newNode("Undefined");
//       }

//       case "^": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Number" && right?.type === "Number") {
//           return this.newNode("Number", left.value ** right.value);
//         }

//         return this.newNode("Undefined");
//       }

//       case "=": {
//         // op.left = left;
//         // op.right = right;
//         const eqNode = this.newNode("Operator");
//         eqNode.value = "=";
//         eqNode.left = left;
//         eqNode.right = right;
//         return this.evaluateEquals(eqNode);
//       }

//       case "&&": {
//         const leftExpr = this.evaluateNode(left);
//         if (leftExpr.type === "Boolean" && leftExpr.value) {
//           const rightExpr = this.evaluateNode(right);
//           if (rightExpr.type === "Boolean" && rightExpr.value) {
//             return this.newNode("Boolean", true);
//           }
//         }
//         return this.newNode("Boolean", false);
//       }

//       case "||": {
//         const leftExpr = this.evaluateNode(left);
//         const rightExpr = this.evaluateNode(right);
//         if (
//           (leftExpr.type === "Boolean" && leftExpr.value) ||
//           (rightExpr.type === "Boolean" && rightExpr.value)
//         ) {
//           return this.newNode("Boolean", true);
//         }
//         return this.newNode("Boolean", false);
//       }

//       case ".": {
//         if (op.meta?.unary) {
//           return this.newNode("Undefined");
//         }

//         if (left?.type === "Object" && rightCopy?.type === "ID") {
//           const value = left?.value[rightCopy.value];
//           return value ?? this.newNode("Undefined");
//         }

//         if (left?.type === "Object" && rightCopy?.type === "FunctionCall") {
//           const name = rightCopy.left?.value;
//           const value = left?.value[name];
//           if (value) {
//             rightCopy.left = value;
//             return this.evaluateFunctionCall(rightCopy);
//           }
//         }

//         if (rightCopy?.type === "FunctionCall" && rightCopy.right) {
//           const args = rightCopy.right.node
//             ? this.flatten(rightCopy.right.node, [","], [], [","])
//             : [];
//           left && args.unshift(left);
//           const list = this.newNode("List");
//           list.nodes = args;
//           rightCopy.right = list;
//           return this.evaluateFunctionCall(rightCopy);
//         }

//         if (left?.type === "Object" && right?.type === "Accessor") {
//           const flat = this.flatten(right, [""], ["ID"], [], ["Accessor"]);
//           flat[0] = left?.value[flat[0].value];
//           const reduced = flat.reduce((a, b, i) => {
//             const accessorNode: Node = {
//               type: "Accessor",
//               line: left.line,
//               col: left.col,
//               left: a,
//               right: b,
//             };

//             return this.evaluateAccessor(accessorNode);
//           });
//           return reduced;
//         }

//         return this.newNode("Undefined");
//       }

//       case "else": {
//         if (
//           left?.type !== "IfStatement" &&
//           !(left?.type === "Operator" && left?.value === "else")
//         ) {
//           return this.newNode();
//         }
//         if (
//           right?.type !== "IfStatement" &&
//           !(right?.type === "Operator" && right?.value === "else") &&
//           !(right?.type === "Block" || right.type === "Object")
//         ) {
//           return this.newNode();
//         }
//         const statementCopy = structuredClone(left?.left);
//         const leftStatement = this.evaluateNode(statementCopy);
//         const leftBlock = left?.right;
//         if (leftStatement.type === "Boolean" && leftStatement.value) {
//           const nodes = leftBlock?.nodes;
//           if (!nodes) {
//             return this.newNode();
//           }

//           const nodesCopy = [...nodes];

//           let evaluatedNode = this.newNode();

//           nodesCopy.forEach(
//             (expr) => (evaluatedNode = this.evaluateNode(expr))
//           );
//           return evaluatedNode;
//         }

//         if (right.type === "Block") {
//           const nodes = right?.nodes;
//           if (!nodes) {
//             return this.newNode();
//           }

//           const nodesCopy = [...nodes];

//           let evaluatedNode = this.newNode();

//           nodesCopy.forEach(
//             (expr) => (evaluatedNode = this.evaluateNode(expr))
//           );
//           return evaluatedNode;
//         }

//         return this.evaluateNode(right);
//       }

//       default: {
//         const fn: (data: NodePayload) => Node = config.operators[op.value];
//         if (!fn) {
//           this.errorAndContinue(`Operator ${op.value} is not defined`);
//           return this.newNode("Undefined");
//         }

//         const payload: NodePayload = {
//           left: this.evaluateNode(left),
//           right: this.evaluateNode(right),
//           token: op.value,
//           col: right.col,
//           line: right.line,
//         };

//         const res = fn(payload);
//         res.evaluated = true;
//         return res;
//       }
//     }
//   }

//   private traverse(
//     currentNode: Node,
//     nodes: Node[],
//     doNotEvaluateTokens?: string[],
//     doNotEvaluateTypes?: NodeType[],
//     doNotPushTokens?: string[],
//     doNotPushTypes?: NodeType[],
//     doNotEvaluateChildrenTokens?: string[]
//   ) {
//     if (!currentNode) {
//       return;
//     }

//     let value = currentNode;

//     if (doNotEvaluateTokens?.includes(currentNode.value)) {
//     } else if (doNotEvaluateTypes?.includes(currentNode.type)) {
//     } else {
//       value = this.evaluateNode(currentNode);
//     }

//     if (doNotPushTokens?.includes(value.value)) {
//     } else if (doNotPushTypes?.includes(value.type)) {
//     } else {
//       nodes.push(value);
//     }

//     if (doNotEvaluateChildrenTokens?.includes(currentNode.value)) {
//     } else {
//       value.left &&
//         this.traverse(
//           value.left,
//           nodes,
//           doNotEvaluateTokens,
//           doNotEvaluateTypes,
//           doNotPushTokens,
//           doNotPushTypes,
//           doNotEvaluateChildrenTokens
//         );
//       value.right &&
//         this.traverse(
//           value.right,
//           nodes,
//           doNotEvaluateTokens,
//           doNotEvaluateTypes,
//           doNotPushTokens,
//           doNotPushTypes,
//           doNotEvaluateChildrenTokens
//         );
//     }
//   }

//   private flatten(
//     node: Node | undefined,
//     doNotEvaluateTokens?: string[],
//     doNotEvaluateTypes?: NodeType[],
//     doNotPushTokens?: string[],
//     doNotPushTypes?: NodeType[],
//     doNotEvaluateChildrenTokens?: string[]
//   ): Node[] {
//     if (!node) {
//       return [];
//     }
//     if (node.type === "List" && node.nodes) {
//       return node.nodes;
//     }
//     const nodes: Node[] = [];
//     this.traverse(
//       node,
//       nodes,
//       doNotEvaluateTokens,
//       doNotEvaluateTypes,
//       doNotPushTokens,
//       doNotPushTypes,
//       doNotEvaluateChildrenTokens
//     );

//     return nodes;
//   }

//   private evaluateList(node: Node) {
//     // const evaluatedList = structuredClone(node);
//     const evaluatedList = this.newNode("List");
//     evaluatedList.node = node.node;
//     evaluatedList.nodes = node.nodes;
//     evaluatedList.col = node.col;
//     evaluatedList.line = node.line;

//     if (evaluatedList.node) {
//       // node.nodes = this.flatten(node.node, [","], [], [","]);
//       // node.node = undefined;
//       evaluatedList.nodes = this.flatten(node.node, [","], [], [","]);
//       evaluatedList.node = undefined;
//     } else {
//       // node.nodes = node.nodes ?? [];
//       evaluatedList.nodes = node.nodes ?? [];
//     }
//     // node.evaluated = true;
//     // return node;
//     evaluatedList.evaluated = true;
//     return evaluatedList;
//   }

//   private evaluateObject(node: Node) {
//     // const evaluatedObj = structuredClone(node);
//     const evaluatedObj = this.newNode("Object");
//     evaluatedObj.node = node.node;
//     // node.value = {};
//     evaluatedObj.value = {};
//     if (evaluatedObj.node) {
//       const flattenedProps = this.flatten(
//         // node.node,
//         evaluatedObj.node,
//         [","],
//         ["ID"],
//         [","]
//       ).filter((elem) => !(elem.type === "Operator" && elem.value == ":"));
//       const innerObject = {};
//       for (var i = 0; i < flattenedProps.length; i += 2) {
//         var keyNode: Node | undefined = flattenedProps[i];
//         if (keyNode.type === "List") {
//           keyNode = this.evaluateNode(keyNode.nodes?.[0]);
//           if (keyNode?.type !== "String") {
//             this.errorAndContinue(
//               "Dynamic object property names must resolve to strings"
//             );
//             return this.newNode("Undefined");
//           }
//         } else if (keyNode.type !== "ID") {
//           this.errorAndContinue("Object property names must be identifiers");
//           return this.newNode();
//         }
//         const value = this.evaluateNode(flattenedProps[i + 1]);

//         innerObject[keyNode.value] = value;

//         if (value.type === "Function" && value.funcNode) {
//           value.funcNode.name = keyNode.value;
//         } else if (value.type === "Native" && value.nativeNode) {
//           value.nativeNode.name = keyNode.value;
//         }
//       }
//       // node.value = innerObject;
//       // node.node = undefined;
//       // node.evaluated = true;
//       evaluatedObj.value = innerObject;
//       evaluatedObj.node = undefined;
//       evaluatedObj.evaluated = true;
//     }
//     // return node;
//     return evaluatedObj;
//   }

//   private evaluateAccessor(node: Node) {
//     const accessorList = this.evaluateNode(node.right);
//     let toAccess = this.evaluateNode(node.left);

//     if (node.left?.type === "ID" && toAccess.type === "Undefined") {
//       toAccess = node.left;
//     }

//     if (toAccess?.type === "ID" || toAccess?.type === "Accessor") {
//       return node;
//     }

//     // node.right = accessorList;
//     // node.left = toAccess;

//     const accessor = this.evaluateNode(accessorList?.nodes?.[0]);

//     if (!accessor) {
//       this.errorAndContinue("Accessor list cannot be empty");
//       return this.newNode();
//     }

//     if (toAccess?.type === "List") {
//       if (accessor?.type !== "Number") {
//         this.errorAndContinue("List accessor must be a number");
//         return this.newNode();
//       }

//       const value = toAccess.nodes?.[accessor?.value];

//       if (!value) {
//         return this.newNode("Undefined");
//       }

//       return value;
//     }

//     if (toAccess?.type === "Object") {
//       if (accessor?.type !== "String") {
//         this.errorAndContinue("Object accessor must be a string");
//         return this.newNode();
//       }

//       const value = toAccess.value[accessor?.value];

//       if (!value) {
//         return this.newNode("Undefined");
//       }

//       return value;
//     }

//     if (toAccess?.type === "String") {
//       if (accessor?.type !== "Number") {
//         this.errorAndContinue("String accessor must be a number");
//         return this.newNode();
//       }

//       const value = toAccess.value?.[accessor?.value];

//       if (!value) {
//         return this.newNode("Undefined");
//       }

//       return this.newNode("String", value);
//     }

//     return this.newNode("Undefined");
//   }

//   private evaluateFunction(node: Node) {
//     if (!node.left || !node.right) {
//       return this.newNode("Undefined");
//     }

//     const params = node.left.node
//       ? this.flatten(node.left.node, ["=", ","], ["ID"], [","], [], ["="])
//       : [];

//     var hasDefault = false;
//     const defaults = {};
//     var error;

//     params.forEach((param, i) => {
//       if (param.type === "Operator" && param.value === "=") {
//         hasDefault = true;
//         if (param.left?.type !== "ID") {
//           error = "Function parameters must be identifiers";
//           node.type = "Undefined";
//         }
//         defaults[param.left?.value] = this.evaluateNode(param.right);
//         param.left && (params[i] = param.left);
//       } else if (param.type !== "ID") {
//         error = "Function parameters must be identifiers";
//         node.type = "Undefined";
//       } else {
//         if (hasDefault) {
//           error = "Cannot declare default parameters before normal parameters";
//           node.type = "Undefined";
//         }
//       }
//     });

//     if (error) {
//       return this.newError(error);
//     }
//     const body = node.right;
//     node.funcNode = {
//       params,
//       body,
//       closures: {},
//       defaults,
//     };

//     // TODD: optimise this, coz we're bringing EVERYTHING in

//     for (const symbol in this.symbols) {
//       ((node.funcNode as FuncNode).closures as SymbolTable)[symbol] =
//         this.symbols[symbol];
//     }
//     node.left = undefined;
//     node.right = undefined;
//     node.evaluated = true;
//     return node;
//   }

//   private evaluateFunctionCall(node: Node) {
//     if (!node.left || !node.right) {
//       return this.newNode("Undefined");
//     }
//     let func = node.left;

//     if (node.left.type !== "Function") {
//       func = this.evaluateNode(node.left);
//       if (func.type === "Undefined" && node.left.type === "ID") {
//         func = node.left;
//       }
//     }

//     let args: Node[] = [];

//     if (node.right.node) {
//       args = this.flatten(node.right.node, [","], [], [","], [], [":"]);
//     } else if (node.right.nodes) {
//       args = node.right.nodes;
//     }

//     const namedArgs = {};
//     let hasNamedArg = false;
//     let error;

//     args.forEach((arg) => {
//       if (arg.type === "Operator" && arg.value === ":") {
//         hasNamedArg = true;
//         if (arg.left?.type !== "ID") {
//           error = "Argument names must be identifiers";
//           return;
//         }
//         namedArgs[arg.left.value] = this.evaluateNode(arg.right);
//       } else {
//         if (hasNamedArg) {
//           error = "Arguments must either be all named or all unnamed";
//           return;
//         }
//       }
//     });

//     if (error) {
//       return this.newError(error);
//     }

//     // Possible builtin call
//     if (func.type === "ID") {
//       const fn =
//         config.functions[func.value] ?? this.nativeFunctions[func.value];

//       if (!fn) {
//         this.errorAndContinue(`Function '${func.value}' is undefined`);
//         return this.newNode();
//       }

//       return fn(args) ?? this.newNode();
//     }

//     // node.left = undefined;
//     // node.right = undefined;

//     // If native

//     if (func.nativeNode) {
//       if (func.schema) {
//         const schemaKeys = Object.keys(func.schema.value);
//         for (let i = 0; i < schemaKeys.length; i++) {
//           const key = schemaKeys[i];
//           if (!args[i]) {
//             if (!args[i]) {
//               return this.newError(
//                 `Function '${func.nativeNode.name}' expects '${schemaKeys.length}' parameters but was provided with ${args.length}`
//               );
//             }
//           }
//           const valueType = args[i].type ?? "Undefined";
//           const schemaType =
//             func.schema.value[key].type === "List"
//               ? func.schema.value[key].nodes?.map((e) => e.value)
//               : func.schema.value[key]?.value ?? "Undefined";
//           let passed = true;
//           if (Array.isArray(schemaType)) {
//             passed = schemaType.length === 0 || schemaType.includes(valueType);
//           } else [(passed = schemaType == valueType)];
//           if (!passed) {
//             return this.newError(
//               `Function '${
//                 func.nativeNode.name
//               }' expects paramater '${key}' to be of type ${
//                 Array.isArray(schemaType) ? schemaType.join(" | ") : schemaType
//               } but was provided with value of type ${valueType}`
//             );
//           }
//         }
//       }
//       return this.nativeFunctions.run([func, ...args]);
//     }

//     if (!func.funcNode?.body) {
//       return this.newNode("Undefined");
//     }

//     const body = structuredClone(func.funcNode?.body);
//     let nodes;

//     if (body.type === "Block" && body.nodes) {
//       nodes = body.nodes;
//     } else {
//       nodes = [body];
//     }
//     const symbols = { ...this.symbols };
//     for (const prop in symbols) {
//       symbols[prop] = {
//         node: symbols[prop].node,
//         const: false,
//         outsideScope: true,
//       };
//     }
//     const evaluator = new Evaluator(nodes, func.funcNode.originFilePath);
//     evaluator.symbols = { ...func.funcNode.closures, ...symbols };

//     func.funcNode?.params.forEach((param, index) => {
//       if (func.funcNode?.defaults?.[param.value]) {
//         evaluator.symbols[param.value] = {
//           node: func.funcNode.defaults[param.value],
//           const: false,
//         };
//       }
//       if (namedArgs[param.value]) {
//         evaluator.symbols[param.value] = {
//           node: namedArgs[param.value],
//           const: false,
//         };
//       } else if (
//         index <= args.length - 1 &&
//         args[index].type !== "Operator" &&
//         args[index].value !== ":"
//       ) {
//         evaluator.symbols[param.value] = {
//           node: args[index] ?? this.newNode(),
//           const: false,
//         };
//       }
//     });

//     if (func.schema) {
//       for (const prop in func.schema.value) {
//         const valueType = evaluator.symbols[prop]?.node.type ?? "Undefined";
//         const schemaType =
//           func.schema.value[prop].type === "List"
//             ? func.schema.value[prop].nodes?.map((e) => e.value)
//             : func.schema.value[prop]?.value ?? "Undefined";
//         let passed = true;
//         if (Array.isArray(schemaType)) {
//           passed = schemaType.length === 0 || schemaType.includes(valueType);
//         } else [(passed = schemaType == valueType)];
//         if (!passed) {
//           return this.newError(
//             `Function '${
//               func.funcNode.name
//             }' expects paramater '${prop}' to be of type ${
//               Array.isArray(schemaType) ? schemaType.join(" | ") : schemaType
//             } but was provided with value of type ${valueType}`
//           );
//         }
//       }
//     }

//     const result = evaluator.evaluate() ?? this.newNode();
//     return result;
//   }

//   private evaluateDeclaration(node: Node) {
//     if (!node.declNode) {
//       return this.newNode("Undefined");
//     }
//     const { id, value } = node.declNode;
//     const symbol = this.symbols[id.value];
//     if (symbol && !symbol.outsideScope) {
//       return this.newError(`Variable '${id.value}' is already defined`);
//     }
//     const declValue = value
//       ? this.evaluateNode(value)
//       : this.newNode("Undefined");
//     if (declValue.type === "Function" && declValue.funcNode) {
//       declValue.funcNode.name = id.value;
//     } else if (declValue.type === "Native" && declValue.nativeNode) {
//       declValue.nativeNode.name = id.value;
//     }
//     if (declValue.schema) {
//       declValue.schema = this.evaluateNode(declValue.schema);
//     }
//     this.symbols[id.value] = { node: declValue, const: node.value === "const" };
//     return declValue;
//   }

//   private evaluateID(node: Node) {
//     return (
//       this.symbols[node.value]?.node ??
//       this.tempVars[node.value]?.node ??
//       this.newNode()
//     );
//   }

//   private evaluateIfStatement(node: Node) {
//     const leftCopy = structuredClone(node.left);
//     const statement = this.evaluateNode(leftCopy);
//     const block = node.right;

//     // TODO: make this truthy
//     if (statement.type === "Boolean" && statement.value) {
//       const nodes = block?.nodes;
//       if (!nodes) {
//         return this.newNode();
//       }

//       const nodesCopy = [...nodes];

//       let evaluatedNode = this.newNode();

//       nodesCopy.forEach((expr) => (evaluatedNode = this.evaluateNode(expr)));
//       return evaluatedNode;
//     }

//     return this.newNode();
//   }

//   private evaluateWhileStatement(node: Node) {
//     const statement = node.left?.node;

//     var reachedBreak = false;

//     while (true) {
//       const evaluatedStatement = this.evaluateNode(statement);
//       if (!evaluatedStatement.value) {
//         return this.newNode();
//       }
//       var reachedContinue = false;

//       const blockCopy = node.right;
//       const nodes = blockCopy?.nodes;
//       if (!nodes) {
//         return this.newNode();
//       }

//       for (let j = 0; j < nodes.length; j++) {
//         const expr = nodes[j];
//         const res = this.evaluateNode(expr);
//         if (res.type === "Break") {
//           reachedBreak = true;
//           break;
//         }
//         if (res.type === "Continue") {
//           reachedContinue = true;
//           break;
//         }
//       }

//       if (reachedContinue) {
//         continue;
//       }

//       if (reachedBreak) {
//         break;
//       }
//     }

//     return this.newNode();
//   }

//   private evaluateForStatement(node: Node) {
//     const args = this.flatten(node.left?.node, [","], ["ID"], [","]);

//     if (!args.length) {
//       return this.newNode();
//     }

//     const arr = this.evaluateNode(args[0]);
//     let valueName;
//     let indexName;

//     if (args.length > 1) {
//       if (args[1].type !== "ID") {
//         return this.newNode();
//       }
//       valueName = args[1].value;
//     }

//     if (args.length > 2) {
//       if (args[2].type !== "ID") {
//         return this.newNode();
//       }
//       indexName = args[2].value;
//     }

//     var reachedBreak = false;

//     if (!arr.nodes) {
//       return this.newNode();
//     }

//     for (let i = 0; i < arr.nodes.length; i++) {
//       var reachedContinue = false;
//       const elem = arr.nodes[i];
//       valueName &&
//         (this.tempVars[valueName] = {
//           node: elem,
//           const: false,
//         });
//       indexName &&
//         (this.tempVars[indexName] = {
//           node: this.newNode("Number", i),
//           const: false,
//         });

//       // const blockCopy = structuredClone(node.right);
//       const blockCopy = node.right;
//       const nodes = blockCopy?.nodes;
//       if (!nodes) {
//         return this.newNode();
//       }

//       for (let j = 0; j < nodes.length; j++) {
//         const expr = nodes[j];
//         const res = this.evaluateNode(expr);
//         if (res.type === "Break") {
//           reachedBreak = true;
//           break;
//         }
//         if (res.type === "Continue") {
//           reachedContinue = true;
//           break;
//         }
//       }

//       if (reachedContinue) {
//         continue;
//       }

//       if (reachedBreak) {
//         break;
//       }
//     }

//     valueName && delete this.tempVars[valueName];
//     indexName && delete this.tempVars[indexName];

//     return this.newNode();
//   }

//   private evaluateEquals(node: Node) {
//     if (node.left?.type === "Accessor") {
//       const toAccess = this.evaluateNode(node.left?.left);
//       const accessList = this.evaluateNode(node.left?.right);
//       const accessor = accessList.nodes?.[0];
//       const right = this.evaluateNode(node.right);
//       if (toAccess?.type === "List" && toAccess?.nodes && right) {
//         if (accessor?.type !== "Number") {
//           this.errorAndContinue("List accessor must be a number");
//           return this.newNode();
//         }
//         toAccess.nodes[accessor?.value] = right;
//         return right;
//       }
//       if (toAccess?.type === "Object" && right) {
//         if (accessor?.type !== "String") {
//           this.errorAndContinue("Object accessor must be a string");
//           return this.newNode();
//         }
//         toAccess.value[accessor?.value] = right;
//         return right;
//       }

//       return this.newNode("Undefined");
//     }
//     if (node.left?.type === "Operator" && node.left.value === ".") {
//       if (!node.right) {
//         node.right = this.newNode("Undefined");
//       }
//       const right = this.evaluateNode(node.right);
//       const toAccess = this.evaluateNode(node.left?.left);
//       let accessor = node.left?.right;
//       if (!accessor) {
//         return this.newNode("Undefined");
//       }
//       if (toAccess.type !== "Object") {
//         return this.newError(
//           `Cannot assign property to variable of type ${toAccess.type}`
//         );
//       }
//       if (accessor.type === "ID") {
//         toAccess.value[accessor.value] = right;
//         return right;
//       }
//       accessor = this.evaluateNode(node.left?.right);
//       if (accessor.type === "Accessor") {
//         const flat = this.flatten(accessor, [], ["Accessor", "ID"], []).filter(
//           (elem) => elem.type !== "Accessor"
//         );
//         const lastAccessor = flat.pop()?.nodes?.[0];
//         if (toAccess.type === "Object") {
//           flat[0] = toAccess?.value[flat[0].value];
//         } else if (toAccess.type === "List" && toAccess.nodes) {
//           flat[0] = toAccess?.nodes[flat[0].value];
//         }
//         const reduced = flat.reduce((a, b) => {
//           const accessorNode: Node = {
//             type: "Accessor",
//             line: toAccess.line,
//             col: toAccess.col,
//             left: a,
//             right: b,
//           };

//           return this.evaluateAccessor(accessorNode);
//         });

//         if (reduced.type === "Object") {
//           reduced.value[lastAccessor?.value] = right;
//         } else if (reduced.type === "List" && reduced.nodes) {
//           reduced.nodes[lastAccessor?.value] = right;
//         }
//         return right;
//       }
//     }

//     if (node.left?.type !== "ID") {
//       this.errorAndContinue(
//         `Cannot assign to value of type ${node.left?.type}`
//       );
//       return this.newNode();
//     }
//     const symbolValue = this.symbols[node.left?.value];

//     if (!symbolValue) {
//       this.errorAndContinue(`Variable '${node.left?.value}' is undefined`);
//       return this.newNode();
//     }
//     if (symbolValue.const) {
//       this.errorAndContinue(
//         `Cannot assign to const variable '${node.left?.value}'`
//       );
//       return this.newNode();
//     }
//     if (!node.value) {
//       return this.newNode("Undefined");
//     }
//     this.symbols[node.left?.value] = {
//       ...symbolValue,
//       node: this.evaluateNode(node.right) ?? this.newNode("Undefined"),
//     };
//     return this.symbols[node.left?.value].node;
//   }

//   private eval(str: string, env?: Node): Node {
//     const lexer = new Lexer(str, true);
//     lexer.tokenize();
//     const parser = new Parser(lexer.nodes);
//     parser.parse();
//     const evaluator = new Evaluator(parser.nodes);
//     if (env) {
//       for (const prop in env.value) {
//         evaluator.symbols[prop] = { node: env.value[prop], const: false };
//       }
//     } else {
//       evaluator.symbols = this.symbols;
//       evaluator.tempVars = this.tempVars;
//     }

//     return evaluator.evaluate() ?? this.newNode();
//   }

//   private evaluateImport(node: Node): Node {
//     const importOptions = node.right;
//     if (node.right?.type === "ID") {
//       // TODO: import builtin
//       return this.newNode();
//     }
//     if (node.right?.type === "Operator") {
//       const source = this.evaluateNode(node.right.right);
//       const module = node.right.left;

//       if (!source && !module) {
//         return this.newNode();
//       }

//       if (source.type !== "String") {
//         return this.newNode();
//       }

//       const resolvedPath = path.resolve(source.value);

//       const cachedImport = this.cachedImports[resolvedPath];

//       // const currentDirPath = path.dirname(path.resolve(this.filePath));
//       const currentDirPath = process.cwd();

//       if (module?.type === "ID") {
//         if (cachedImport) {
//           this.symbols[module?.value] = { node: cachedImport, const: false };

//           return this.symbols[module?.value].node ?? this.newNode();
//         }

//         try {
//           fs.readFileSync(source.value);
//         } catch (e) {
//           this.errorAndContinue(`No such file "${source.value}"`);
//           return this.newNode();
//         }

//         const lexer = new Lexer(source.value);
//         lexer.tokenize();
//         const parser = new Parser(lexer.nodes, source.value);
//         parser.parse();
//         const evaluator = new Evaluator(parser.nodes, source.value);

//         process.chdir(path.dirname(resolvedPath));

//         const res = evaluator.evaluate();

//         process.chdir(currentDirPath);

//         const moduleObject = {};

//         for (const symbol in evaluator.symbols) {
//           if (evaluator.symbols[symbol].node.type === "Function") {
//             (
//               evaluator.symbols[symbol].node.funcNode as FuncNode
//             ).originFilePath = source.value;
//           }
//           moduleObject[symbol] = evaluator.symbols[symbol].node;
//         }

//         const moduleSymbol = this.newNode("Object", moduleObject);

//         this.cachedImports[resolvedPath] = moduleSymbol;

//         this.symbols[module?.value] = { node: moduleSymbol, const: false };

//         return this.symbols[module?.value].node ?? this.newNode();
//       }

//       if (module?.type === "List") {
//         const lexer = new Lexer(source.value);
//         lexer.tokenize();
//         const parser = new Parser(lexer.nodes, source.value);
//         parser.parse();
//         const evaluator = new Evaluator(parser.nodes, source.value);

//         process.chdir(path.dirname(resolvedPath));

//         evaluator.evaluate();

//         process.chdir(currentDirPath);

//         const moduleList = this.flatten(module.node, [","], ["ID"], [","]);
//         moduleList.forEach((name) => {
//           if (name.type === "ID") {
//             if (evaluator.symbols[name.value].node.type === "Function") {
//               (
//                 evaluator.symbols[name.value].node.funcNode as FuncNode
//               ).originFilePath = source.value;
//             }
//             this.symbols[name.value] = evaluator.symbols[name.value];
//           }
//         });
//         return this.newNode();
//       }
//     }

//     return this.newNode();
//   }

//   private evaluateNode(node?: Node): Node {
//     if (!node) {
//       return this.newNode("Undefined");
//     }
//     if (node.evaluated) {
//       return node;
//     }
//     if (node.type === "Paren" && node.node) {
//       return this.evaluateNode(node.node);
//       // node = node.node;
//     }
//     if (
//       node.type === "Number" ||
//       node.type === "String" ||
//       node.type === "Boolean" ||
//       node.type === "Raw"
//     ) {
//       return node;
//     }
//     if (node.type === "Operator" && node.value === ":") {
//       return node;
//     }
//     switch (node.type) {
//       case "ID": {
//         return this.evaluateID(node);
//       }
//       case "List": {
//         const res = this.evaluateList(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "Object": {
//         const res = this.evaluateObject(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "Operator": {
//         const res = this.evaluateOperator(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "Accessor": {
//         const res = this.evaluateAccessor(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "Decl": {
//         const res = this.evaluateDeclaration(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "Function": {
//         const res = this.evaluateFunction(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "FunctionCall": {
//         const res = this.evaluateFunctionCall(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "IfStatement": {
//         const res = this.evaluateIfStatement(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "ForStatement": {
//         const res = this.evaluateForStatement(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "WhileStatement": {
//         const res = this.evaluateWhileStatement(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }
//       case "Break": {
//         return node;
//       }
//       case "Continue": {
//         return node;
//       }
//       case "Return": {
//         return node;
//       }
//       case "Eval": {
//         const res = this.eval(node.value);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//           return res;
//         }
//         return this.newNode("String", this.toString(res));
//       }
//       case "Import": {
//         const res = this.evaluateImport(node);
//         if (res.type === "Error") {
//           this.errorAndContinue(res.value);
//         }
//         return res;
//       }

//       default: {
//         return this.newNode("Undefined");
//       }
//     }
//   }

//   public evaluate() {
//     while (this.node) {
//       this.nodes[this.index] = this.evaluateNode(this.node);
//       if (this.nodes[this.index].type === "Return") {
//         return this.evaluateNode(this.nodes[this.index].right);
//       }
//       if (this.nodes[this.index].type === "ID") {
//         this.errorAndContinue(
//           `Cannot evaluate '${this.nodes[this.index]?.value}'`
//         );
//         return this.newNode();
//       }
//       if (this.nodes[this.index].type === "Accessor") {
//         this.errorAndContinue(
//           `Cannot evaluate '${this.nodes[this.index].left?.value}'`
//         );
//         return this.newNode();
//       }
//       if (this.nodes[this.index].type === "Error") {
//         // this.errorAndContinue(this.nodes[this.index].value);
//         // this.errorAndExit(this.nodes[this.index].value);
//       }
//       this.advance();
//     }

//     return this.nodes.pop();
//   }
// }
