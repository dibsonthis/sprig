import { Node, SymbolTable, NodeTypeEnum } from "../types";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Generator } from "../generator/generator";
import { getParamNames } from "../utils/utils";
import path from "path";

export class VM {
  private nodes: Node[];
  private node: Node;
  private stack: Node[] = [];
  private index: number = 0;

  public symbols: SymbolTable = {};
  public tempVars: SymbolTable = {};
  public operators: Record<string, Node> = {};
  public cachedImports = {};
  public filePath: string;
  public functionName: string;

  public parentVM: VM;

  private errorAndContinue(message: string, node?: Node) {
    const errorNode = node ? node : this.node;
    const resolved = path.resolve(this.filePath);
    console.error(
      "\x1b[31m%s\x1b[0m",
      `Error in '${this.functionName}' (${resolved}:${errorNode.line}:${errorNode.col}): ${message}`
    );
  }

  private errorAndExit(message: string, node?: Node) {
    this.errorAndContinue(message, node);
    process.exit(1);
  }

  constructor(nodes: Node[], filePath: string = ".") {
    this.nodes = nodes;
    this.node = this.nodes[0];
    this.filePath = filePath;
  }

  private advance() {
    this.index += 1;
    this.node = this.nodes[this.index];
  }

  private newNode(
    type: NodeTypeEnum = NodeTypeEnum.Undefined,
    value?: any,
    evaluated = false
  ): Node {
    return {
      col: this.node?.col ?? 0,
      line: this.node?.line ?? 0,
      type,
      value,
      evaluated,
    };
  }

  private newError = (message: string): Node => ({
    type: NodeTypeEnum.Error,
    value: message,
    line: this.node.line,
    col: this.node.col,
    evaluated: true,
  });

  public back() {
    this.index -= 1;
    this.node = this.nodes[this.index];
  }

  private nextNode() {
    return this.nodes[this.index + 1];
  }

  private previousNode() {
    return this.nodes[this.index - 1];
  }

  private removeNext() {
    this.nodes.splice(this.index + 1, 1);
  }

  private removeCurrent() {
    this.nodes.splice(this.index, 1);
    this.node = this.nodes[this.index];
  }

  private removePrevious() {
    this.nodes.splice(this.index - 1, 1);
    this.index -= 1;
    this.node = this.nodes[this.index];
  }

  private toString(node: Node): string {
    switch (node.type) {
      case NodeTypeEnum.ID:
      case NodeTypeEnum.Number:
      case NodeTypeEnum.String:
      case NodeTypeEnum.Boolean: {
        return node.value.toString();
      }
      case NodeTypeEnum.Object: {
        var repr = "{ ";
        if (node.handler) {
          repr = "Proxy { ";
        }
        if (node.class) {
          if (node.class.type === NodeTypeEnum.Function) {
            repr = `${node.class.funcNode?.name ?? "Class"} ` + repr;
          } else {
            repr = `${node.class.nativeNode?.name ?? "Class"}* ` + repr;
          }
        }
        const keys = Object.keys(node.value);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          let value = node.value[key];

          const intercept = node.handler?.value?.get?.value?.[key];
          const generalIntercept = node.handler?.value?.get?.value?.["_"];

          if (intercept && intercept.type === NodeTypeEnum.Function) {
            value = this.evaluateFunctionWithArgs(intercept, [value]);
          } else if (
            generalIntercept &&
            generalIntercept.type === NodeTypeEnum.Function
          ) {
            value = this.evaluateFunctionWithArgs(generalIntercept, [value]);
          }

          const reprIntercept = node.handler?.value?.repr?.value?.[key];
          const generalReprIntercept = node.handler?.value?.repr?.value?.["_"];

          if (reprIntercept && reprIntercept.type === NodeTypeEnum.Function) {
            value = this.evaluateFunctionWithArgs(reprIntercept, [value]);
          } else if (
            generalReprIntercept &&
            generalReprIntercept.type === NodeTypeEnum.Function
          ) {
            value = this.evaluateFunctionWithArgs(generalReprIntercept, [
              value,
            ]);
          }

          if (value?.type === NodeTypeEnum.String) {
            repr += reprIntercept
              ? `${key}: ${this.toString(value)}`
              : `${key}: "${this.toString(value)}"`;
          } else {
            if (value == node) {
              repr += "{...}";
            } else if (value.meta?.hiddenProp) {
              continue;
            } else {
              repr += `${key}: ${this.toString(value)}`;
            }
          }
          if (i < keys.length - 1) {
            repr += ", ";
          }
        }
        repr += " }";
        return repr;
      }
      case NodeTypeEnum.Undefined: {
        return "undefined";
      }
      case NodeTypeEnum.Library: {
        return `Library {${Object.keys(node.libNode?.exports ?? {})}}`;
      }
      case NodeTypeEnum.List: {
        var repr = "[";
        if (node.class) {
          if (node.class.type === NodeTypeEnum.Function) {
            repr = `${node.class.funcNode?.name ?? "Class"} ` + repr;
          } else {
            repr = `${node.class.nativeNode?.name ?? "Class"}* ` + repr;
          }
        }
        repr += node.nodes
          ?.map((elem) => {
            if (elem === node) {
              return "[...]";
            } else {
              return this.toString(elem);
            }
          })
          .join(", ");
        repr += "]";
        return repr;
      }
      case NodeTypeEnum.Function: {
        const params = node.funcNode.params
          .map((e) => {
            return this.toString(e);
          })
          .join(", ");
        return `function: '${node.funcNode?.name ?? "anonymous"}' (${params})`;
      }
      case NodeTypeEnum.CatchAllParam: {
        return `...${node.value}`;
      }
      case NodeTypeEnum.Native: {
        return `native: '${node.nativeNode?.name ?? "anonymous"}' (${
          node.nativeNode?.builtin
            ? "...args"
            : getParamNames(node.nativeNode.function)
        })`;
      }
      case NodeTypeEnum.Operator: {
        return `${this.toString(node.left)} ${node.value} ${this.toString(
          node.right
        )}`;
      }
      case NodeTypeEnum.Error: {
        return `Error: ${node.value}`;
      }
      case NodeTypeEnum.Raw: {
        let repr = `Raw<${typeof node.value}>`;
        if (node.class) {
          if (node.class.type === NodeTypeEnum.Function) {
            repr = `${node.class.funcNode?.name ?? "Class"} ` + repr;
          } else {
            repr = `${node.class.nativeNode?.name ?? "Class"}* ` + repr;
          }
        }
        return repr;
      }
      default: {
        return "undefined";
      }
    }
  }

  public nodeToJS(node: Node) {
    switch (node.type) {
      case NodeTypeEnum.String:
      case NodeTypeEnum.Boolean:
      case NodeTypeEnum.Number: {
        return node.value;
      }
      case NodeTypeEnum.Raw: {
        return node.value;
      }
      case NodeTypeEnum.List: {
        const arr = [];
        node.nodes.forEach((elem) => arr.push(this.nodeToJS(elem)));
        return arr;
      }
      case NodeTypeEnum.Object: {
        const obj = {};
        for (const prop in node.value) {
          obj[prop] = this.nodeToJS(node.value[prop]);
        }
        return obj;
      }
      case NodeTypeEnum.Native: {
        return node.nativeNode.function;
      }
      case NodeTypeEnum.Function: {
        const fnNode = (...args) =>
          this.nodeToJS(
            this.evaluateFunctionWithArgs(
              node,
              args.map((e) => this.jsToNode(e))
              // args.map((e) => this.newNode(NodeTypeEnum.Raw, e))
              // args.map((e) => {
              //   if (typeof e === "object") {
              //     return this.newNode(NodeTypeEnum.Raw, e);
              //   }
              //   return this.jsToNode(e);
              // })
            )
          );
        return fnNode;
      }
      default:
        return undefined;
    }
  }

  public jsToNode(res, force = false) {
    if (res === null || res === undefined) {
      return this.newNode();
    }
    if (res["__type__"] === NodeTypeEnum.Raw) {
      return this.newNode(NodeTypeEnum.Raw, res.value);
    }
    if (typeof res === "string") {
      return this.newNode(NodeTypeEnum.String, res);
    }

    if (typeof res === "number" || typeof res === "bigint") {
      return this.newNode(NodeTypeEnum.Number, res);
    }

    if (typeof res === "boolean") {
      return this.newNode(NodeTypeEnum.Boolean, res);
    }

    if (typeof res === "undefined") {
      return this.newNode();
    }

    if (typeof res === "object") {
      if (Array.isArray(res)) {
        const arr = this.newNode(NodeTypeEnum.List);
        arr.nodes = [];
        res.forEach((elem) => {
          arr.nodes.push(this.jsToNode(elem, force));
        });
        arr.evaluated = true;
        return arr;
      }

      if (!force) {
        if (Object.getPrototypeOf(res) !== Object.prototype) {
          const rawRes = this.newNode(NodeTypeEnum.Raw, res);
          rawRes.class = this.jsToNode(res.constructor);
          return rawRes;
        }
      }

      const obj = this.newNode(NodeTypeEnum.Object);
      obj.evaluated = true;
      obj.value = {};

      if (res["__type__"] == NodeTypeEnum.Error) {
        return this.newError(res["message"] ?? "");
      }

      if (res instanceof Error) {
        const props = Object.getOwnPropertyNames(res);

        for (const prop of props) {
          obj.value[prop] = this.jsToNode(res[prop]);
        }
      } else {
        for (const prop in res) {
          obj.value[prop] = this.jsToNode(res[prop]);
        }
      }

      return obj;
    }

    if (typeof res === "function") {
      const native = this.newNode(NodeTypeEnum.Native);
      native.nativeNode = {
        name: res.name,
        function: res,
      };
      return native;
    }

    return this.newNode();
  }

  private eval(str: string, env?: Node): Node {
    const lexer = new Lexer(str, true);
    lexer.tokenize();
    const parser = new Parser(lexer.nodes);
    parser.parse();
    const generator = new Generator(parser.nodes, parser.filePath);
    generator.generate();

    if (generator.generatedNodes.at(-1).type === NodeTypeEnum.Pop) {
      generator.generatedNodes.pop();
    }

    const vm = new VM(generator.generatedNodes, parser.filePath);
    vm.parentVM = this;

    if (env) {
      for (const prop in env.value) {
        vm.symbols[prop] = { node: env.value[prop], const: false };
      }
    } else {
      vm.symbols = this.symbols;
      vm.tempVars = this.tempVars;
      vm.operators = this.operators;
    }

    return vm.evaluate();
  }

  public evaluateFunctionWithArgs(fn: Node, args: Node[]) {
    if (fn.type !== NodeTypeEnum.Function) {
      return this.newNode();
    }
    this.stack.push(this.newNode(NodeTypeEnum.FunctionCallBegin));
    args.forEach((arg) => {
      arg.evaluated = true;
      this.stack.push(arg);
    });
    this.stack.push(fn);
    // this.stack.push(this.newNode(NodeTypeEnum.Number, args.length));
    const functionCall = this.newNode(NodeTypeEnum.FunctionCall);

    return this.evaluateFunctionCall(functionCall);
  }

  private builtins = {
    __builtins: (args: Node[]) => {
      const builtinsObject = this.newNode(NodeTypeEnum.Object, {}, true);
      Object.keys(this.builtins).forEach((key) => {
        const nativeNode = this.newNode(NodeTypeEnum.Native);
        nativeNode.nativeNode = {
          name: key,
          function: this.builtins[key],
          builtin: true,
        };
        builtinsObject.value[key] = nativeNode;
      });
      return builtinsObject;
    },
    print: (args: Node[]) => {
      args.forEach((node) => {
        process.stdout.write(this.toString(node));
      });
      process.stdout.write("\n");
      return this.newNode();
    },
    println: (args: Node[]) => {
      args.forEach((node) => {
        console.log(this.toString(node));
      });
      return this.newNode();
    },
    jsEval: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'jsEval' expects 1 argument(s)");
      }

      const expr = args[0];
      if (expr.type !== NodeTypeEnum.String) {
        return this.newError(
          "Function 'jsEval' expects argument 'expr' to be a string"
        );
      }
      try {
        const res = eval(expr.value);
        return this.jsToNode(res);
      } catch (e) {
        return this.newError(e);
      }
    },
    run: (args: Node[]) => {
      if (args.length < 1) {
        return this.newError("Function 'run' expects at least 1 argument(s)");
      }
      const native = args[0];
      if (native.type !== NodeTypeEnum.Native) {
        return this.newError(
          "Function 'run' expects argument 'nativeFn' to be a Native"
        );
      }

      const nativeArgs = args.slice(1).map((elem) => this.nodeToJS(elem));
      const res = native.nativeNode.function(...nativeArgs);
      return this.jsToNode(res);
    },
    runRaw: (args: Node[]) => {
      if (args.length < 1) {
        return this.newError(
          "Function 'runRaw' expects at least 1 argument(s)"
        );
      }
      const native = args[0];
      if (native.type !== NodeTypeEnum.Native) {
        return this.newError(
          "Function 'runRaw' expects argument 'nativeFn' to be a Native"
        );
      }

      const nativeArgs = args.slice(1).map((elem) => this.nodeToJS(elem));

      let res = native.nativeNode.function(...nativeArgs);
      // if (nativeArgs.length) {
      //   res = native.nativeNode.function(...nativeArgs);
      // } else {
      //   res = native.nativeNode.function(nativeArgs);
      // }
      return this.newNode(NodeTypeEnum.Raw, res);
    },
    raw: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'raw' expects 1 argument(s)");
      }

      const expr = args[0];
      if (expr.type !== NodeTypeEnum.String) {
        return this.newError(
          "Function 'raw' expects argument 'expr' to be a String"
        );
      }
      try {
        const res = eval(expr.value);
        return this.newNode(NodeTypeEnum.Raw, res);
      } catch (e) {
        return this.newError(e);
      }
    },
    eval: (args: Node[]) => {
      if (args.length !== 1 && args.length !== 2) {
        return this.newError("Function 'eval' expects 1 or 2 argument(s)");
      }

      const node = args[0];
      if (node.type !== NodeTypeEnum.String) {
        return this.newError(
          "Function 'eval' expects argument 'expr' to be a string"
        );
      }

      if (args.length === 1) {
        const res = this.eval(node.value);
        return res;
      }

      const env = args[1];
      if (env.type !== NodeTypeEnum.Object) {
        return this.newError(
          "Function 'eval' expects argument 'env' to be an object"
        );
      }

      const res = this.eval(node.value, env);
      return res;
    },
    loadLib: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'loadLib' expects 1 argument(s)");
      }
      const filePath = args[0];
      if (filePath.type !== NodeTypeEnum.String) {
        return this.newError(
          "Function 'loadLib' expects argument 'filePath' to be a List"
        );
      }

      const lib = require(path.resolve(filePath.value));

      const libObj = this.newNode(NodeTypeEnum.Object);
      libObj.evaluated = true;
      libObj.value = {};

      for (const prop in lib) {
        // const nativeNode = this.newNode(NodeTypeEnum.Native);
        // nativeNode.nativeNode = { name: prop, function: lib[prop] };
        // libObj.value[prop] = nativeNode;
        libObj.value[prop] = this.jsToNode(lib[prop]);
      }

      return libObj;
    },
    value: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'value' expects 1 argument(s)");
      }
      const node = args[0];
      if (node.type !== NodeTypeEnum.Raw) {
        return this.newError(
          "Function 'value' expects argument 'rawVal' to be a Raw"
        );
      }

      const res = this.jsToNode(node.value, true);

      return res;
    },
    length: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'length' expects 1 argument");
      }
      const node = args[0];
      switch (node.type) {
        case NodeTypeEnum.String:
          return this.newNode(NodeTypeEnum.Number, node.value.length);
        case NodeTypeEnum.List:
          return this.newNode(NodeTypeEnum.Number, node.nodes?.length ?? 0);
        case NodeTypeEnum.Object:
          return this.newNode(
            NodeTypeEnum.Number,
            Object.keys(node.value).length
          );
        default: {
          return this.newNode();
        }
      }
    },
    error: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'error' expects 1 argument");
      }
      const message = args[0];
      if (message.type !== NodeTypeEnum.String) {
        return this.newError(
          "Function 'error' expects argument 'message' to be a string"
        );
      }
      return this.newError(message.value);
    },
    exit: (args: Node[]) => {
      var code = 0;
      if (args.length === 1) {
        const exitCode = args[0];
        if (exitCode.type !== NodeTypeEnum.Number) {
          return this.newError(
            "Function 'exit' expects argument 'code' to be a Number"
          );
        }
        code = exitCode.value;
      }
      process.exit(code);
    },
    inspect: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'inspect' expects 1 argument");
      }
      let node = args[0];

      switch (node.type) {
        case NodeTypeEnum.Object: {
          const res = this.newNode(NodeTypeEnum.Object, {}, true);

          const keys = this.newNode(NodeTypeEnum.List, undefined, true);
          keys.nodes = Object.keys(node.value).map((key) =>
            this.newNode(NodeTypeEnum.String, key)
          );

          const values = this.newNode(NodeTypeEnum.List, undefined, true);
          values.nodes = Object.values(node.value);

          const proxy = node.handler;

          res.value.keys = keys;
          res.value.values = values;
          res.value.length = this.newNode(
            NodeTypeEnum.Number,
            keys.nodes.length
          );
          res.value.isProxy = this.newNode(
            NodeTypeEnum.Boolean,
            proxy !== undefined
          );
          res.value.handler = proxy ?? this.newNode();
          res.value.class = node.class ?? this.newNode();

          return res;
        }
        case NodeTypeEnum.Function: {
          const res = this.newNode(NodeTypeEnum.Object, {}, true);

          const name = node.funcNode?.name;
          const params = node.funcNode?.params;
          const isCoroutine = node.funcNode?.isCoroutine;
          const coroutineIndex = node.funcNode?.coroutineIndex;
          const coroutineFinished =
            node.funcNode?.coroutineIndex >= node.value?.length;
          const schema = node.schema?.value;

          res.value.name = this.newNode(
            NodeTypeEnum.String,
            name ?? "anonymous"
          );
          res.value.params = this.newNode(NodeTypeEnum.List, undefined, true);
          res.value.params.nodes = params;
          res.value.schema = schema
            ? this.newNode(NodeTypeEnum.Object, schema, true)
            : this.newNode();
          res.value.isCoroutine = this.newNode(
            NodeTypeEnum.Boolean,
            isCoroutine ?? false
          );
          res.value.coroutineIndex = this.newNode(
            NodeTypeEnum.Number,
            coroutineIndex ?? -1
          );
          res.value.coroutineFinished = this.newNode(
            NodeTypeEnum.Boolean,
            coroutineFinished
          );

          return res;
        }
        default: {
          return this.newNode();
        }
      }
    },
    finished: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'finished' expects 1 argument");
      }
      const coroutine = args[0];
      if (coroutine.type !== NodeTypeEnum.Function) {
        return this.newError(
          "Function 'finished' expects argument 'coroutine' to be a Function"
        );
      }
      return this.newNode(
        NodeTypeEnum.Boolean,
        coroutine.funcNode?.coroutineIndex &&
          coroutine.funcNode?.coroutineIndex >= coroutine.value?.length
      );
    },
    dirName: (args: Node[]) => {
      return this.newNode(NodeTypeEnum.String, __dirname);
    },
    break: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'break' expects 1 argument");
      }
      const num = args[0];
      if (num.type !== NodeTypeEnum.Number) {
        return this.newError(
          "Function 'break' expects argument 'n' to be a Number"
        );
      }
      this.evaluateBreakN(num.value);
      return;
    },
    out: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'out' expects 1 argument");
      }
      const value = args[0];
      return this.newNode(
        NodeTypeEnum.Return,
        this.newNode(NodeTypeEnum.Return, value)
      );
    },
    __vm: (args: Node[]) => {
      var n = 0;
      if (args.length == 1) {
        const node = args[0];
        if (node.type !== NodeTypeEnum.Number) {
          return this.newError(
            "Function '__vm' expects argument 'n' to be a Number"
          );
        }
        n = node.value;
      }

      let vm = this;
      for (let i = 0; i < n; i++) {
        if (!vm.parentVM) {
          break;
        }
        vm = vm.parentVM as any;
      }

      return this.newNode(
        NodeTypeEnum.Object,
        {
          line: this.newNode(NodeTypeEnum.Number, vm.node?.line ?? 0),
          col: this.newNode(NodeTypeEnum.Number, vm.node?.col ?? 0),
          filePath: this.newNode(NodeTypeEnum.String, vm.filePath),
          name: this.newNode(
            NodeTypeEnum.String,
            vm.functionName ?? "anonymous"
          ),
          vmPath: this.newNode(NodeTypeEnum.String, __dirname),
          locals: vm.builtins.locals([]),
        },
        true
      );
    },
    type: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'type' expects 1 argument");
      }
      const node = args[0];
      return this.newNode(NodeTypeEnum.String, NodeTypeEnum[node.type]);
    },
    class: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'class' expects 1 argument");
      }
      const node = args[0];
      return node.class ? node.class : this.newNode();
    },
    globals: (args: Node[]) => {
      const symbolObject = this.newNode(NodeTypeEnum.Object, {}, true);
      Object.keys(this.symbols).forEach((key) => {
        const symbol = this.symbols[key];
        if (symbol.isGlobal) {
          symbolObject.value[key] = this.symbols[key].node;
        }
      });
      return symbolObject;
    },
    locals: (args: Node[]) => {
      const symbolObject = this.newNode(NodeTypeEnum.Object, {}, true);
      Object.keys(this.symbols).forEach((key) => {
        const symbol = this.symbols[key];
        if (!symbol.isGlobal) {
          symbolObject.value[key] = this.symbols[key].node;
        }
      });
      return symbolObject;
    },
    keys: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'keys' expects 1 argument");
      }
      const node = args[0];
      const list = this.newNode(NodeTypeEnum.List);
      list.nodes = [];
      list.evaluated = true;
      if (node.type !== NodeTypeEnum.Object) {
        return list;
      }
      Object.keys(node.value).forEach((key) => {
        list.nodes.push(this.newNode(NodeTypeEnum.String, key));
      });
      return list;
    },
    delete: (args: Node[]) => {
      if (args.length !== 2) {
        return this.newError("Function 'delete' expects 2 arguments");
      }
      const obj = args[0];
      const key = args[1];
      if (obj.type !== NodeTypeEnum.Object) {
        return this.newError(
          "Function 'delete' expects argument 'object' to be an Object"
        );
      }
      if (key.type !== NodeTypeEnum.String) {
        return this.newError(
          "Function 'delete' expects argument 'key' to be a String"
        );
      }
      delete obj.value[key.value];
      return obj;
    },
    append: (args: Node[]) => {
      if (args.length !== 2) {
        return this.newError("Function 'append' expects 2 arguments");
      }
      const list = args[0];
      const value = args[1];
      if (list.type !== NodeTypeEnum.List) {
        return this.newError(
          "Function 'append' expects argument 'list' to be an List"
        );
      }
      list.nodes.push(value);
      return list;
    },
    insert: (args: Node[]) => {
      if (args.length < 2) {
        return this.newError("Function 'insert' expects 2 or 3 arguments");
      }
      const list = args[0];
      const value = args[1];
      const index = args[2];

      if (list.type !== NodeTypeEnum.List) {
        return this.newError(
          "Function 'insert' expects argument 'list' to be an List"
        );
      }
      if (index && index.type !== NodeTypeEnum.Number) {
        return this.newError(
          "Function 'insert' expects argument 'list' to be an List"
        );
      }
      list.nodes.splice(index?.value ?? 0, 0, value);
      return list;
    },
    pop: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'pop' expects 1 argument");
      }
      const list = args[0];

      if (list.type !== NodeTypeEnum.List) {
        return this.newError(
          "Function 'pop' expects argument 'list' to be an List"
        );
      }
      return list.nodes.pop() ?? this.newNode();
    },
    popf: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'popf' expects 1 argument");
      }
      const list = args[0];

      if (list.type !== NodeTypeEnum.List) {
        return this.newError("Function 'popf' argument 'list' to be an List");
      }
      return list.nodes.shift() ?? this.newNode();
    },
    remove: (args: Node[]) => {
      if (args.length !== 2) {
        return this.newError("Function 'remove' expects 2 arguments");
      }
      const list = args[0];
      const index = args[1];
      if (list.type !== NodeTypeEnum.List) {
        return this.newError(
          "Function 'remove' expects argument 'list' to be an List"
        );
      }
      if (index.type !== NodeTypeEnum.Number) {
        return this.newError(
          "Function 'remove' expects argument 'index' to be a Number"
        );
      }
      list.nodes.splice(index.value, 1);
      return list;
    },
    proxy: (args: Node[]) => {
      if (args.length !== 2) {
        return this.newError("Function 'proxy' expects 2 arguments");
      }
      const obj = args[0];
      const handler = args[1];
      if (obj.type !== NodeTypeEnum.Object) {
        return this.newError(
          "Function 'proxy' expects argument 'object' to be an Object"
        );
      }
      if (handler.type !== NodeTypeEnum.Object) {
        return this.newError(
          "Function 'proxy' expects argument 'handler' to be an Object"
        );
      }
      const objCopy = structuredClone(obj);
      objCopy.handler = handler;
      return objCopy;
    },
    forEach: (args: Node[]) => {
      if (args.length !== 2) {
        return this.newError("Function 'forEach' expects 2 arguments");
      }
      const arr = args[0];
      const fn = args[1];
      if (arr.type !== NodeTypeEnum.List) {
        return this.newError(
          "Function 'forEach' expects argument 'list' to be a List"
        );
      }
      if (fn.type !== NodeTypeEnum.Function) {
        return this.newError(
          "Function 'forEach' expects argument 'fn' to be a Function"
        );
      }

      const fnCall = this.newNode(NodeTypeEnum.FunctionCall);
      const argsNode = this.newNode(NodeTypeEnum.List);

      arr.nodes?.forEach((elem, index) => {
        argsNode.nodes = [elem];
        if (fn.funcNode?.params.length == 2) {
          argsNode.nodes.push(this.newNode(NodeTypeEnum.Number, index));
        }
        this.stack.push(this.newNode(NodeTypeEnum.FunctionCallBegin));
        argsNode.nodes.forEach((node) => this.stack.push(node));
        this.stack.push(fn);
        this.evaluateFunctionCall(fnCall);
      });
    },
    map: (args: Node[]) => {
      if (args.length !== 2) {
        return this.newError("Function 'map' expects 2 arguments");
      }
      const arr = args[0];
      const fn = args[1];
      if (arr.type !== NodeTypeEnum.List) {
        return this.newError(
          "Function 'map' expects argument 'list' to be a List"
        );
      }
      if (fn.type !== NodeTypeEnum.Function) {
        return this.newError(
          "Function 'map' expects argument 'fn' to be a Function"
        );
      }

      const newArr = { ...arr };

      const fnCall = this.newNode(NodeTypeEnum.FunctionCall);
      const argsNode = this.newNode(NodeTypeEnum.List);

      newArr.nodes = newArr.nodes?.map((elem, index) => {
        argsNode.nodes = [elem];
        if (fn.funcNode?.params.length == 2) {
          argsNode.nodes.push(this.newNode(NodeTypeEnum.Number, index));
        }
        this.stack.push(this.newNode(NodeTypeEnum.FunctionCallBegin));
        argsNode.nodes.forEach((node) => this.stack.push(node));
        this.stack.push(fn);
        return this.evaluateFunctionCall(fnCall);
      });

      return newArr;
    },
    filter: (args: Node[]) => {
      if (args.length !== 2) {
        return this.newError("Function 'filter' expects 2 arguments");
      }
      const arr = args[0];
      const fn = args[1];
      if (arr.type !== NodeTypeEnum.List) {
        return this.newError(
          "Function 'filter' expects argument 'list' to be a List"
        );
      }
      if (fn.type !== NodeTypeEnum.Function) {
        return this.newError(
          "Function 'filter' expects argument 'fn' to be a Function"
        );
      }

      const newArr = { ...arr };

      const fnCall = this.newNode(NodeTypeEnum.FunctionCall);
      const argsNode = this.newNode(NodeTypeEnum.List);

      newArr.nodes = newArr.nodes?.filter((elem, index) => {
        argsNode.nodes = [elem];
        if (fn.funcNode?.params.length == 2) {
          argsNode.nodes.push(this.newNode(NodeTypeEnum.Number, index));
        }
        this.stack.push(this.newNode(NodeTypeEnum.FunctionCallBegin));
        argsNode.nodes.forEach((node) => this.stack.push(node));
        this.stack.push(fn);
        const res = this.evaluateFunctionCall(fnCall);

        const truthy =
          res.type === NodeTypeEnum.Boolean
            ? res.value
            : res.type !== NodeTypeEnum.Undefined;

        return truthy;
      });

      return newArr;
    },
  };

  private evaluateOperator(node: Node) {
    var right = this.stack.pop();

    switch (node.value) {
      case "unary+": {
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));
        return right;
      }
      case "unary-": {
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }
        if (right.type === NodeTypeEnum.Number) {
          return { ...right, value: -right.value };
        }
        return this.newNode();
      }
      case "unary!": {
        const truthy =
          right.type === NodeTypeEnum.Boolean
            ? right.value
            : right.type !== NodeTypeEnum.Undefined;
        return this.newNode(NodeTypeEnum.Boolean, !truthy);
      }
      case "unary...": {
        if (right.type === NodeTypeEnum.List) {
          right.nodes?.forEach((elem) => this.stack.push(elem));
          return;
        }
        return this.newNode();
      }
      case "+": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.Number &&
          right.type === NodeTypeEnum.Number
        ) {
          return this.newNode(NodeTypeEnum.Number, left.value + right.value);
        }

        if (
          left.type === NodeTypeEnum.String &&
          right.type === NodeTypeEnum.String
        ) {
          return this.newNode(NodeTypeEnum.String, left.value + right.value);
        }

        if (
          left.type === NodeTypeEnum.List &&
          right.type === NodeTypeEnum.List
        ) {
          const newList = this.newNode(NodeTypeEnum.List);
          newList.evaluated = true;
          newList.nodes = [...left?.nodes, ...right?.nodes];
          return newList;
        }

        if (
          left.type === NodeTypeEnum.Object &&
          right.type === NodeTypeEnum.Object
        ) {
          const newObject = this.newNode(NodeTypeEnum.Object);
          newObject.evaluated = true;
          newObject.value = { ...left?.value, ...right?.value };
          if (left.handler || right.handler) {
            const newHandler = this.newNode(NodeTypeEnum.Object, {
              ...(left.handler?.value ?? {}),
              ...(right.handler?.value ?? {}),
            });
            newObject.handler = newHandler;
          }
          return newObject;
        }

        return this.newNode();
      }
      case "-": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.Number &&
          right.type === NodeTypeEnum.Number
        ) {
          return this.newNode(NodeTypeEnum.Number, left.value - right.value);
        }
        return this.newNode();
      }
      case "*": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.Number &&
          right.type === NodeTypeEnum.Number
        ) {
          return this.newNode(NodeTypeEnum.Number, left.value * right.value);
        }

        if (
          left?.type === NodeTypeEnum.Number &&
          right?.type === NodeTypeEnum.String
        ) {
          const node = this.newNode(NodeTypeEnum.String, "");
          for (let i = 0; i < left.value; i++) {
            node.value += right.value;
          }
          return node;
        }

        if (
          left?.type === NodeTypeEnum.String &&
          right?.type === NodeTypeEnum.Number
        ) {
          const node = this.newNode(NodeTypeEnum.String, "");
          for (let i = 0; i < right.value; i++) {
            node.value += left.value;
          }
          return node;
        }

        if (
          left?.type === NodeTypeEnum.Number &&
          right?.type === NodeTypeEnum.List
        ) {
          const node = this.newNode(NodeTypeEnum.List);
          node.nodes = [];
          for (let i = 0; i < left.value; i++) {
            const innerNode = this.newNode(NodeTypeEnum.List);
            innerNode.nodes = right.nodes?.slice(0);
            node.nodes.push(innerNode);
          }
          return node;
        }

        if (
          left?.type === NodeTypeEnum.List &&
          right?.type === NodeTypeEnum.Number
        ) {
          const node = this.newNode(NodeTypeEnum.List);
          node.nodes = [];
          for (let i = 0; i < right.value; i++) {
            const innerNode = this.newNode(NodeTypeEnum.List);
            innerNode.nodes = left.nodes?.slice(0);
            node.nodes.push(innerNode);
          }
          return node;
        }

        return this.newNode();
      }
      case "/": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.Number &&
          right.type === NodeTypeEnum.Number
        ) {
          return this.newNode(NodeTypeEnum.Number, left.value / right.value);
        }
        return this.newNode();
      }
      case "%": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.Number &&
          right.type === NodeTypeEnum.Number
        ) {
          return this.newNode(NodeTypeEnum.Number, left.value % right.value);
        }
        return this.newNode();
      }
      case "^": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.Number &&
          right.type === NodeTypeEnum.Number
        ) {
          return this.newNode(NodeTypeEnum.Number, left.value ** right.value);
        }
        return this.newNode();
      }
      case "=": {
        var left = this.stack.pop();
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (left.type === NodeTypeEnum.String) {
          const symbol = this.symbols[left.value];
          if (!symbol) {
            return this.newError(`Variable '${left.value}' is undefined`);
          }
          if (symbol.const) {
            return this.newError(
              `Cannot reassign value of const variable '${left.value}'`
            );
          }
          this.symbols[left.value].node = right;
          return right;
        }
        return this.newNode();
      }
      case "...": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.Number &&
          right.type === NodeTypeEnum.Number
        ) {
          const res = this.evaluateRangeOperator(left, right);
          res.evaluated = true;
          return res;
        }
        return this.newError("Range operands must be of type Number");
      }
      case "..": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.Number &&
          right.type === NodeTypeEnum.Number
        ) {
          const res = this.evaluateRangeOperator(left, right);
          res.nodes = res.nodes.slice(0, -1);
          res.evaluated = true;
          return res;
        }
        return this.newError("Range operands must be of type Number");
      }
      case "|": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (
          left.type === NodeTypeEnum.List &&
          right.type === NodeTypeEnum.Number
        ) {
          const newList = this.newNode(NodeTypeEnum.List);
          newList.evaluated = true;

          const subListA = this.newNode(NodeTypeEnum.List);
          subListA.evaluated = true;
          subListA.nodes = left?.nodes?.slice(0, right.value);

          const subListB = this.newNode(NodeTypeEnum.List);
          subListB.evaluated = true;
          subListB.nodes = left?.nodes?.slice(right.value);

          newList.nodes = [subListA, subListB];
          return newList;
        }
        return this.newNode();
      }
      case "==": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (left.type !== right.type) {
          return this.newNode(NodeTypeEnum.Boolean, false);
        }

        return this.newNode(NodeTypeEnum.Boolean, left?.value === right?.value);
      }
      case "!=": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (left.type !== right.type) {
          return this.newNode(NodeTypeEnum.Boolean, true);
        }

        return this.newNode(NodeTypeEnum.Boolean, left?.value !== right?.value);
      }
      case "<": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (left.type !== right.type) {
          return this.newNode(NodeTypeEnum.Boolean, false);
        }

        return this.newNode(NodeTypeEnum.Boolean, left?.value < right?.value);
      }
      case ">": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (left.type !== right.type) {
          return this.newNode(NodeTypeEnum.Boolean, false);
        }

        return this.newNode(NodeTypeEnum.Boolean, left?.value > right?.value);
      }
      case "<=": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (left.type !== right.type) {
          return this.newNode(NodeTypeEnum.Boolean, false);
        }

        return this.newNode(NodeTypeEnum.Boolean, left?.value <= right?.value);
      }
      case ">=": {
        var left = this.stack.pop();
        left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

        if (left.type === NodeTypeEnum.Error) {
          return left;
        }
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }

        if (left.type !== right.type) {
          return this.newNode(NodeTypeEnum.Boolean, false);
        }

        return this.newNode(NodeTypeEnum.Boolean, left?.value >= right?.value);
      }

      default: {
        const customOperation = this.operators[node.value];
        if (customOperation) {
          if (node.value.startsWith("unary")) {
            right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));
            if (right.type === NodeTypeEnum.Error) {
              return right;
            }
            return this.evaluateFunctionWithArgs(customOperation, [right]);
          }

          var left = this.stack.pop();
          left.type === NodeTypeEnum.ID && (left = this.evaluateID(left));
          right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));

          if (left.type === NodeTypeEnum.Error) {
            return left;
          }
          if (right.type === NodeTypeEnum.Error) {
            return right;
          }

          return this.evaluateFunctionWithArgs(customOperation, [left, right]);
        }

        return this.newNode();
      }
    }
  }

  private evaluateRangeOperator(left: Node, right: Node) {
    let _start = left.value;
    let _end = right.value;

    let reversed = false;

    if (_start > _end) {
      _start = right.value;
      _end = left.value;
      reversed = true;
    }

    let array: Node[] = Array.from({ length: _end - _start + 1 }, (_, i) =>
      this.newNode(NodeTypeEnum.Number, _start + i)
    );

    reversed && array.reverse();

    const newList = this.newNode(NodeTypeEnum.List);
    newList.nodes = array;

    return newList;
  }

  private evaluateID(node: Node) {
    let symbol;
    if (this.tempVars.hasOwnProperty(node.value)) {
      symbol = this.tempVars[node.value];
    } else {
      symbol = this.symbols[node.value];
    }

    if (!symbol) {
      if (this.builtins.hasOwnProperty(node.value)) {
        const native = this.newNode(NodeTypeEnum.Native);
        native.nativeNode = {
          name: node.value,
          function: this.builtins[node.value],
          builtin: true,
        };
        return native;
      }
      return this.newError(`Variable '${node.value}' is not defined`);
    }
    return symbol.node;
  }

  private resetLoops() {
    for (const node of this.nodes) {
      if (node.type === NodeTypeEnum.StartForLoop) {
        node.forLoopStartNode.count = -1;
        node.forLoopStartNode.arr = undefined;
      }
    }
  }

  private evaluateBreak(breakAll: boolean = false) {
    var loopCount = 1;
    while (this.node) {
      if (
        this.node.type === NodeTypeEnum.StartForLoop ||
        this.node.type === NodeTypeEnum.StartWhileLoop
      ) {
        loopCount++;
      } else if (
        this.node.type === NodeTypeEnum.ForStatement ||
        this.node.type === NodeTypeEnum.WhileStatement
      ) {
        loopCount--;
        if (loopCount === 0) {
          // reset the start loop
          if (this.node.type === NodeTypeEnum.ForStatement) {
            this.nodes[this.node.value].forLoopStartNode.count = -1;
            this.nodes[this.node.value].forLoopStartNode.arr = undefined;
          }
          if (!breakAll) {
            break;
          }
        }
      }
      this.advance();
    }
  }

  private evaluateBreakN(n = 1) {
    const node = this.node;
    var numberOfLoopsEncountered = 0;
    while (true) {
      if (!this.node) {
        // We've gone too far back
        this.errorAndExit("Break count exceeds number of loops", node);
      }
      if (
        this.node.type === NodeTypeEnum.StartForLoop ||
        this.node.type === NodeTypeEnum.StartWhileLoop
      ) {
        numberOfLoopsEncountered++;
        if (this.node.type === NodeTypeEnum.StartForLoop) {
          this.node.forLoopStartNode.count = 0;
          this.node.forLoopStartNode.arr = undefined;
        }
        if (numberOfLoopsEncountered === n) {
          if (this.node.type === NodeTypeEnum.StartForLoop) {
            this.index = this.node.forLoopStartNode.endIndex;
            this.node = this.nodes[this.index];
          } else if (this.node.type === NodeTypeEnum.StartWhileLoop) {
            this.index = this.node.value;
            this.node = this.nodes[this.index];
          }
          break;
        }
      }

      this.back();
    }
  }

  private evaluateForLoop(node: Node) {
    node.forLoopStartNode.count++;

    if (!node.forLoopStartNode.arr) {
      var arr = this.stack.pop();
      if (!arr) {
        this.errorAndExit("For loops must have a valid array");
      }
      if (arr.type === NodeTypeEnum.Undefined) {
        this.errorAndExit("For loops must have a valid array");
      }
      if (arr.type === NodeTypeEnum.ID) {
        arr = this.evaluateID(arr);
        if (arr.type === NodeTypeEnum.Error) {
          this.errorAndExit(arr.value);
          return this.newNode();
        }
      }
      node.forLoopStartNode.arr = arr.nodes;
    }

    if (!node.forLoopStartNode.arr) {
      this.errorAndExit("For loops must have a valid array");
    }

    if (node.forLoopStartNode.count >= node.forLoopStartNode.arr.length) {
      node.forLoopStartNode.count = -1;
      node.forLoopStartNode.arr = undefined;
      this.index = node.forLoopStartNode.endIndex;
      this.node = this.nodes[this.index];

      if (node.forLoopStartNode.valueName) {
        delete this.tempVars[node.forLoopStartNode.valueName];
      }
      if (node.forLoopStartNode.indexName) {
        delete this.tempVars[node.forLoopStartNode.indexName];
      }
      return;
    }

    if (node.forLoopStartNode.valueName) {
      this.tempVars[node.forLoopStartNode.valueName] = {
        node: node.forLoopStartNode.arr[node.forLoopStartNode.count],
        const: false,
      };
    }
    if (node.forLoopStartNode.indexName) {
      this.tempVars[node.forLoopStartNode.indexName] = {
        node: this.newNode(NodeTypeEnum.Number, node.forLoopStartNode.count),
        const: false,
      };
    }
  }

  private evaluateDecl(node: Node) {
    var value = this.stack.pop();
    var id = this.stack.pop();

    if (!id) {
      return this.newError("Malformed declaration");
    }

    if (id?.type === NodeTypeEnum.List) {
      if (value.type === NodeTypeEnum.List) {
        var valueNodes = [...value.nodes];

        id.nodes.forEach((elem, i) => {
          if (i < id.nodes.length - 1) {
            const declNode = this.newNode(NodeTypeEnum.Decl, node.value);
            this.stack.push(this.newNode(NodeTypeEnum.ID, elem.value));
            this.stack.push(valueNodes.shift() ?? this.newNode());
            this.evaluateDecl(declNode);
          }
        });

        if (valueNodes.length > 1) {
          const declNode = this.newNode(NodeTypeEnum.Decl, node.value);
          this.stack.push(
            this.newNode(NodeTypeEnum.ID, id.nodes.at(-1)?.value)
          );
          const restList = this.newNode(NodeTypeEnum.List);
          restList.evaluated = true;
          restList.nodes = valueNodes;
          this.stack.push(restList);
          this.evaluateDecl(declNode);
        } else {
          const declNode = this.newNode(NodeTypeEnum.Decl, node.value);
          this.stack.push(
            this.newNode(NodeTypeEnum.ID, id.nodes.at(-1)?.value)
          );
          this.stack.push(valueNodes[0] ?? this.newNode());
          this.evaluateDecl(declNode);
        }
      } else if (value.type === NodeTypeEnum.Object) {
        id.nodes.forEach((elem, i) => {
          const declNode = this.newNode(NodeTypeEnum.Decl, node.value);
          this.stack.push(this.newNode(NodeTypeEnum.ID, elem.value));
          this.stack.push(value.value[elem.value] ?? this.newNode());
          this.evaluateDecl(declNode);
        });
      }

      return this.newNode();
    }

    const existingSymbol = this.symbols[id.value];

    if (existingSymbol && this.symbols.hasOwnProperty(id.value)) {
      if (!(existingSymbol.canChange && node.value === "let")) {
        return this.newError(`Variable '${id.value}' is already defined`);
      }
    }

    if (value.type === NodeTypeEnum.ID) {
      value = this.evaluateID(value);
      if (value.type === NodeTypeEnum.Error) {
        return value;
      }
    }

    if (value.type === NodeTypeEnum.Function && !value.funcNode?.name) {
      value.funcNode.name = id.value;
    }

    if (node?.declNode?.isClass) {
      value.class = id;
    }

    this.symbols[id.value] = {
      node: value,
      const: node.value === "const",
      canChange: node.value === "let",
    };
    return value;
  }

  private evaluateFunctionCall(node: Node, isMethod = false) {
    var fnName;
    var fn;

    if (!isMethod) {
      fn = this.stack.pop();
    }

    const args = [];
    const namedArgs = {};

    while (true) {
      const arg = this.stack.pop();
      if (arg.type === NodeTypeEnum.FunctionCallBegin) {
        break;
      }
      if (arg.type === NodeTypeEnum.NamedArg) {
        namedArgs[arg.left.value] = arg.right;
      } else {
        args.unshift(this.evaluateNode(arg));
      }
    }

    if (isMethod) {
      fn = this.stack.pop();
    }

    if (fn.type === NodeTypeEnum.Undefined) {
      return fn;
    }

    if (fn.type === NodeTypeEnum.Native) {
      if (fn.nativeNode.builtin) {
        return fn.nativeNode.function(args);
      }
      return this.builtins.run([fn, ...args]);
    }

    if (fn.type === NodeTypeEnum.String) {
      fnName = fn.value;
    }

    if (fnName && this.builtins.hasOwnProperty(fnName)) {
      return this.builtins[fnName](args);
    }

    fnName && (fn = this.tempVars[fnName]?.node ?? this.symbols[fnName]?.node);

    if (!fn) {
      this.errorAndContinue(`Function '${fnName}' is undefined`);
      return this.newNode();
    }

    if (fn.type === NodeTypeEnum.Native) {
      if (fn.nativeNode.builtin) {
        return fn.nativeNode.function(args);
      }
      return this.builtins.run([fn, ...args]);
    }

    if (fn.type !== NodeTypeEnum.Function) {
      return this.newNode();
    }

    const vm = new VM(fn.value, fn.funcNode.originFilePath);
    vm.operators = this.operators;
    vm.parentVM = this;
    vm.functionName = fn.funcNode?.name ?? "anonymous";

    // First call of coroutine
    if (fn.funcNode.isCoroutine && fn.funcNode.coroutineIndex === undefined) {
      const newfn = { ...fn };
      const closures = newfn.funcNode.closures;
      newfn.funcNode.closures = {};
      fn = structuredClone(newfn);
      fn.funcNode.closures = closures;
      fn.funcNode.coroutineIndex = 0;
      if (fn.funcNode.params.length > 0) {
        const initParam = fn.funcNode.params.shift();
        var initArg = args[0];
        if (!initArg) {
          initArg = fn.funcNode?.defaults[initParam.value] ?? this.newNode();
        }
        fn.funcNode.closures[initParam.value] = {
          node: initArg,
          const: false,
        };
      }
      return fn;
    }

    if (fn.funcNode.coroutineIndex !== undefined) {
      vm.symbols = {
        ...fn.funcNode.closures,
        ...fn.funcNode.coroutineSymbols,
      };

      vm.index = fn.funcNode.coroutineIndex;
      vm.node = vm.nodes[vm.index];
    } else {
      vm.symbols = {
        ...fn.funcNode.closures,
      };
    }

    if (fnName && !vm.symbols[fnName]) {
      vm.symbols[fnName] = { node: fn, const: false };
    }

    fn.funcNode.params.forEach((param, index) => {
      var paramValue = this.newNode();

      if (param.type === NodeTypeEnum.CatchAllParam) {
        const catchAll = this.newNode(NodeTypeEnum.List);
        catchAll.evaluated = true;
        catchAll.nodes = [];

        for (let i = index; i < args.length; i++) {
          const arg = args[i];
          catchAll.nodes.push(arg);
        }

        vm.symbols[param.value] = {
          node: catchAll,
          const: false,
        };
      } else {
        const defaultParam = fn.funcNode.defaults[param.value];

        if (defaultParam) {
          paramValue = defaultParam;
        }

        if (args[index]) {
          paramValue = args[index];
        }

        vm.symbols[param.value] = {
          node: paramValue,
          const: false,
        };
      }
    });

    for (const prop in namedArgs) {
      vm.symbols[prop] = {
        node: namedArgs[prop],
        const: false,
      };
    }

    if (fn.schema) {
      Object.keys(fn.schema.value).forEach((key) => {
        const schemaProp = fn.schema.value[key];
        const valueType = NodeTypeEnum[vm.symbols[key].node.type];

        if (schemaProp.type === NodeTypeEnum.List && schemaProp.nodes) {
          if (!schemaProp.nodes.map((e) => e.value).includes(valueType)) {
            this.errorAndExit(
              `Function '${fnName}' expects parameter '${key}' to be of type ${this.toString(
                schemaProp
              )} but was provided with value of type ${valueType}`
            );
          }
        } else if (schemaProp.value !== valueType) {
          this.errorAndExit(
            `Function '${fnName}' expects parameter '${key}' to be of type ${schemaProp.value} but was provided with value of type ${valueType}`
          );
        }
      });
    }

    const res = vm.evaluate();

    if (fn.class) {
      res.class = fn;
    }

    if (fn.funcNode?.isCoroutine) {
      fn.funcNode.coroutineIndex = vm.index + 1;
      fn.funcNode.coroutineSymbols = vm.symbols;
    }

    return res;
  }

  private evaluateList(node: Node) {
    if (node.evaluated) {
      return node;
    }
    const evaluatedList = this.newNode(NodeTypeEnum.List);
    evaluatedList.evaluated = true;
    evaluatedList.nodes = [];
    var arg;
    while (true) {
      arg = this.stack.pop();
      if (arg.type === NodeTypeEnum.ListBegin) {
        break;
      }
      evaluatedList.nodes.unshift(arg);
    }
    return evaluatedList;
  }

  private evaluateObject(node: Node) {
    if (node.evaluated) {
      return node;
    }
    const evaluatedObject = this.newNode(NodeTypeEnum.Object);
    evaluatedObject.evaluated = true;
    evaluatedObject.value = {};
    for (let i = 0; i < node.value; i++) {
      const value = this.stack.pop();
      var key = this.stack.pop();

      if (key.type === NodeTypeEnum.List) {
        key = this.evaluateID(key.nodes[0]);
        if (key.type === NodeTypeEnum.Error) {
          this.errorAndContinue(key.value);
          continue;
        }
        key.value = this.toString(key);
      }

      evaluatedObject.value[key.value] = value;
    }
    return evaluatedObject;
  }

  private evaluateFunction(node: Node) {
    if (node.evaluated) {
      return node;
    }
    const fn = this.newNode(NodeTypeEnum.Function, node.value);
    fn.evaluated = true;
    fn.funcNode = {
      body: undefined,
      params: [],
      defaults: {},
      closures: {},
      isCoroutine: node.funcNode?.isCoroutine,
      originFilePath: node.funcNode?.originFilePath,
    };
    fn.class = node.class;
    var numParams = this.stack.pop();
    if (numParams.type === NodeTypeEnum.Object) {
      fn.schema = numParams;
      numParams = this.stack.pop();
    }
    for (let i = 0; i < numParams.value; i++) {
      const param = this.stack.pop();
      if (param.type === NodeTypeEnum.DefaultParam) {
        fn.funcNode.params.unshift(param.left);
        fn.funcNode.defaults[param.left.value] = param.right;
      } else {
        fn.funcNode.params.unshift(param);
      }
    }

    // TODD: optimise this, coz we're bringing EVERYTHING in

    for (const symbol in this.symbols) {
      fn.funcNode.closures[symbol] = this.symbols[symbol];
    }

    return fn;
  }

  private evaluateNode(node: Node) {
    switch (node.type) {
      case NodeTypeEnum.String:
      case NodeTypeEnum.Number:
      case NodeTypeEnum.Boolean:
      case NodeTypeEnum.Native:
      case NodeTypeEnum.ListBegin:
      case NodeTypeEnum.FunctionCallBegin:
      case NodeTypeEnum.CatchAllParam:
      case NodeTypeEnum.Error:
      case NodeTypeEnum.Raw: {
        return node;
      }
      case NodeTypeEnum.ID: {
        const res = this.evaluateID(node);
        return res;
      }
      case NodeTypeEnum.Operator: {
        return this.evaluateOperator(node);
      }
      case NodeTypeEnum.List: {
        const res = this.evaluateList(node);
        return res;
      }
      case NodeTypeEnum.Object: {
        const res = this.evaluateObject(node);
        return res;
      }
      case NodeTypeEnum.Decl: {
        const res = this.evaluateDecl(node);
        return res;
      }
      case NodeTypeEnum.Function: {
        const res = this.evaluateFunction(node);
        return res;
      }
      case NodeTypeEnum.FunctionCall: {
        const res = this.evaluateFunctionCall(node);
        return res;
      }
      case NodeTypeEnum.MethodCall: {
        const res = this.evaluateFunctionCall(node, true);
        return res;
      }
      case NodeTypeEnum.StartForLoop: {
        this.evaluateForLoop(node);
        return;
      }
      case NodeTypeEnum.ForStatement: {
        const startIndex = node.value;
        this.index = startIndex - 1;
        return;
      }
      case NodeTypeEnum.DefaultParam: {
        const value = this.stack.pop();
        const name = this.stack.pop();
        const res = this.newNode(NodeTypeEnum.DefaultParam);
        res.left = name;
        res.right = value;
        return res;
      }
      case NodeTypeEnum.NamedArg: {
        const value = this.stack.pop();
        const name = this.stack.pop();
        const res = this.newNode(NodeTypeEnum.NamedArg);
        res.left = name;
        res.right = value;
        return res;
      }
      case NodeTypeEnum.Return: {
        const res = this.stack.pop();
        // this.evaluateBreak(true);
        this.resetLoops();
        return this.newNode(NodeTypeEnum.Return, res);
      }
      case NodeTypeEnum.Yield: {
        const res = this.stack.pop();
        return this.newNode(NodeTypeEnum.Yield, res);
      }
      case NodeTypeEnum.Break: {
        // var loopCount = 1;
        // while (this.node) {
        //   if (
        //     this.node.type === NodeTypeEnum.StartForLoop ||
        //     this.node.type === NodeTypeEnum.StartWhileLoop
        //   ) {
        //     loopCount++;
        //   } else if (
        //     this.node.type === NodeTypeEnum.ForStatement ||
        //     this.node.type === NodeTypeEnum.WhileStatement
        //   ) {
        //     loopCount--;
        //     if (loopCount === 0) {
        //       // reset the start loop
        //       if (this.node.type === NodeTypeEnum.ForStatement) {
        //         this.nodes[this.node.value].forLoopStartNode.count = 0;
        //         this.nodes[this.node.value].forLoopStartNode.arr = undefined;
        //       }
        //       break;
        //     }
        //   }
        //   this.advance();
        // }
        this.evaluateBreak();
        return;
      }
      case NodeTypeEnum.Continue: {
        var loopCount = 1;
        while (this.node) {
          if (
            this.node.type === NodeTypeEnum.StartForLoop ||
            this.node.type === NodeTypeEnum.StartWhileLoop
          ) {
            loopCount--;
            if (loopCount === 0) {
              this.index--;
              break;
            }
          } else if (
            this.node.type === NodeTypeEnum.ForStatement ||
            this.node.type === NodeTypeEnum.WhileStatement
          ) {
            loopCount++;
          }
          this.back();
        }
        return;
      }
      case NodeTypeEnum.Jump: {
        this.index = node.value;
        return;
      }
      case NodeTypeEnum.JumpIfTrue: {
        var statement = this.stack.at(-1);
        if (statement.type === NodeTypeEnum.ID) {
          statement = this.evaluateID(statement);
        }
        if (statement.type === NodeTypeEnum.Error) {
          this.errorAndContinue(statement.value);
          this.index = node.value;
          return;
        }
        const truthy =
          statement.type === NodeTypeEnum.Boolean
            ? statement.value
            : statement.type !== NodeTypeEnum.Undefined;
        if (truthy) {
          this.index = node.value;
        }
        return;
      }
      case NodeTypeEnum.JumpIfFalse: {
        var statement = this.stack.at(-1);
        if (statement.type === NodeTypeEnum.ID) {
          statement = this.evaluateID(statement);
        }
        if (statement.type === NodeTypeEnum.Error) {
          this.errorAndContinue(statement.value);
          this.index = node.value;
          return;
        }
        const truthy =
          statement.type === NodeTypeEnum.Boolean
            ? statement.value
            : statement.type !== NodeTypeEnum.Undefined;
        if (!truthy) {
          this.index = node.value;
        }
        return;
      }
      case NodeTypeEnum.JumpIfFalsePop: {
        var statement = this.stack.pop();
        if (statement.type === NodeTypeEnum.ID) {
          statement = this.evaluateID(statement);
        }
        if (statement.type === NodeTypeEnum.Error) {
          this.errorAndContinue(statement.value);
          this.index = node.value;
          return;
        }
        const truthy =
          statement.type === NodeTypeEnum.Boolean
            ? statement.value
            : statement.type !== NodeTypeEnum.Undefined;
        if (!truthy) {
          this.index = node.value;
        }
        return;
      }
      case NodeTypeEnum.Accessor: {
        const accessor = this.stack.pop();
        const toAccess = this.stack.pop();
        if (
          toAccess.type === NodeTypeEnum.Object &&
          accessor.type === NodeTypeEnum.String
        ) {
          const value = toAccess.value[accessor.value] ?? this.newNode();
          const intercept =
            toAccess.handler?.value?.get?.value?.[accessor.value];
          const generalIntercept = toAccess.handler?.value?.get?.value?.["_"];
          if (intercept && intercept.type === NodeTypeEnum.Function) {
            return this.evaluateFunctionWithArgs(intercept, [value]);
          }
          if (
            generalIntercept &&
            generalIntercept.type === NodeTypeEnum.Function
          ) {
            return this.evaluateFunctionWithArgs(generalIntercept, [value]);
          }
          return toAccess.value[accessor.value] ?? this.newNode();
        }
        if (
          toAccess.type === NodeTypeEnum.List &&
          accessor.type === NodeTypeEnum.Number
        ) {
          return toAccess.nodes.at(accessor.value) ?? this.newNode();
        }
        if (
          toAccess.type === NodeTypeEnum.String &&
          accessor.type === NodeTypeEnum.Number
        ) {
          const char = toAccess.value[accessor.value];
          if (!char) {
            return this.newNode();
          }
          return this.newNode(NodeTypeEnum.String, char);
        }
        return this.newNode();
      }
      case NodeTypeEnum.ModifyProperty: {
        const accessor = this.stack.pop();
        const value = this.stack.pop();
        const toModify = this.stack.pop();

        if (
          toModify.type === NodeTypeEnum.List &&
          accessor.type === NodeTypeEnum.Number
        ) {
          toModify.nodes[accessor.value] = value;
          return value;
        }
        if (
          toModify.type === NodeTypeEnum.Object &&
          accessor.type === NodeTypeEnum.String
        ) {
          const intercept =
            toModify.handler?.value?.set?.value?.[accessor.value];
          const generalIntercept = toModify.handler?.value?.set?.value?.["_"];
          if (intercept && intercept.type === NodeTypeEnum.Function) {
            const res = this.evaluateFunctionWithArgs(intercept, [
              value,
              toModify.value[accessor.value] ?? this.newNode(),
            ]);
            toModify.value[accessor.value] = res;
            if (res.type === NodeTypeEnum.Error) {
              return res;
            }
            return res;
          }
          if (
            generalIntercept &&
            generalIntercept.type === NodeTypeEnum.Function
          ) {
            const res = this.evaluateFunctionWithArgs(generalIntercept, [
              toModify,
              accessor,
              value,
              toModify.value[accessor.value] ?? this.newNode(),
            ]);
            if (res.type === NodeTypeEnum.Error) {
              return res;
            }
            toModify.value[accessor.value] = res;
            return res;
          }

          toModify.value[accessor.value] = value;
          return value;
        }
        return this.newNode();
      }
      case NodeTypeEnum.Pop: {
        this.stack.pop();
        return;
      }
      case NodeTypeEnum.WhileStatement:
      case NodeTypeEnum.StartWhileLoop: {
        return;
      }
      case NodeTypeEnum.SwapStack: {
        const a = this.stack.pop();
        const b = this.stack.pop();
        this.stack.push(a);
        this.stack.push(b);
        return;
      }
      case NodeTypeEnum.Eval: {
        const res = this.eval(node.value);
        return this.newNode(NodeTypeEnum.String, this.toString(res));
      }
      case NodeTypeEnum.Import: {
        const importFrom = this.stack.pop();
        const lexer = new Lexer(importFrom.value);
        lexer.tokenize();
        const parser = new Parser(lexer.nodes, lexer.filePath);
        parser.parse();
        const generator = new Generator(parser.nodes, parser.filePath);
        generator.generate();

        const vm = new VM(generator.generatedNodes, generator.filePath);
        vm.operators = this.operators;
        vm.parentVM = this;

        Object.keys(this.symbols).forEach((k) => {
          const symbol = this.symbols[k];
          if (symbol.isGlobal) {
            vm.symbols[k] = symbol;
          }
        });

        const resolvedPath = path.resolve(importFrom.value);
        const currentDirPath = process.cwd();

        process.chdir(path.dirname(resolvedPath));

        vm.evaluate();

        process.chdir(currentDirPath);

        if (node.value === 0) {
          const moduleName = this.stack.pop();

          const cachedObject = this.cachedImports[resolvedPath];
          if (cachedObject) {
            this.symbols[moduleName.value] = {
              node: cachedObject,
              const: false,
            };
            return;
          }

          const moduleObject = this.newNode(NodeTypeEnum.Object, {});
          moduleObject.evaluated = true;
          Object.keys(vm.symbols).forEach((key) => {
            moduleObject.value[key] = {
              ...vm.symbols[key].node,
              meta: { hiddenProp: vm.symbols[key].isGlobal },
            };
          });
          this.symbols[moduleName.value] = { node: moduleObject, const: false };

          this.cachedImports[resolvedPath] = moduleObject;

          return;
        }

        for (let i = 0; i < node.value; i++) {
          const name = this.stack.pop();
          if (vm.symbols[name.value]) {
            this.symbols[name.value] = {
              node: vm.symbols[name.value].node,
              const: false,
            };
          } else {
            this.errorAndContinue(
              `Variable '${name.value}' does not exist in '${resolvedPath}'`
            );
          }
        }
        return;
      }
      default: {
        return this.newNode();
      }
    }
  }

  public evaluate() {
    while (this.node) {
      const res = this.evaluateNode(this.node);
      if (res?.type === NodeTypeEnum.Return) {
        return res.value;
      }
      if (res?.type === NodeTypeEnum.Yield) {
        return res.value;
      }
      if (res) {
        this.stack.push(res);
      }
      if (res?.type === NodeTypeEnum.Error) {
        this.errorAndContinue(res.value);
      }
      this.advance();
    }
    return this.stack.pop() ?? this.newNode();
  }
}
