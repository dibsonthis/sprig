import { Node, NodeTypeEnum, CallFrame } from "../types";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Generator } from "../generator/generator";
import { getParamNames, injectConfig } from "../utils/utils";
import path from "path";
import fs from "fs";

const newCallFrame = (instructions = []): CallFrame => {
  return {
    filePath: "",
    stack: [],
    instructions,
    instruction: undefined,
    index: -1,
    symbols: new Map(),
    symbolsArray: [],
    tempVarsArray: [],
    variables: [],
    tempVariables: [],
    variableMap: new Map(),
    tempVars: new Map(),
    capturedIds: new Set<string>([]),
  };
};

export class VM {
  public callFrame: CallFrame = newCallFrame();
  public callFrames: CallFrame[] = [this.callFrame];

  public operators: Record<string, Node> = {};
  public paths: Record<string, string> = {};
  public cachedImports = {};
  public filePath: string;
  public functionName: string;
  public meta: object = {};
  public hasError = false;

  // flags
  public injectBuiltins: boolean;
  public parentVM: VM;

  private errorAndContinue(message: string, node?: Node) {
    const errorNode = node ? node : this.callFrame.instruction;
    const resolved = path.resolve(this.callFrame.filePath);
    console.error(
      "\x1b[31m%s\x1b[0m",
      `Error in '${this.callFrame.name}' (${resolved}:${errorNode.line}:${errorNode.col}): ${message}`
    );
  }

  private errorAndExit(message: string, node?: Node) {
    this.errorAndContinue(message, node);
    this.hasError = true;
  }

  constructor(nodes: Node[], filePath: string = ".", restricted = false) {
    this.filePath = filePath;
    this.callFrame.instructions = nodes;
    this.callFrame.instruction = nodes?.[0];
    this.callFrame.index = 0;
    this.callFrame.name = filePath;
    this.callFrame.filePath = filePath;

    if (restricted) {
      const vm = require("vm");

      const restrictedModules = [
        "fs",
        "path",
        "child_process",
        "net",
        "http",
        "https",
        "os",
        "vm",
        "crypto",
      ];

      const customRequire = (module) => {
        if (restrictedModules.includes(module)) {
          return {};
        }
        return require(module);
      };

      global.eval = (code) => {
        let context = {};

        Object.getOwnPropertyNames(global).forEach((prop) => {
          context[prop] = global[prop];
        });

        context = { ...context, require: customRequire };
        vm.createContext(context);
        const result = vm.runInContext(code, context);
        return result;
      };
    }
  }

  private advance() {
    this.callFrame.index++;
    this.callFrame.instruction =
      this.callFrame.instructions[this.callFrame.index];
  }

  private newNode(
    type: NodeTypeEnum = NodeTypeEnum.Undefined,
    value?: any,
    evaluated = false
  ): Node {
    return {
      col: this.callFrame.instruction?.col ?? 0,
      line: this.callFrame.instruction?.line ?? 0,
      type,
      value,
      evaluated,
    };
  }

  private newError = (message: string): Node => ({
    type: NodeTypeEnum.Error,
    value: message,
    line: this.callFrame.instruction?.line ?? 0,
    col: this.callFrame.instruction?.col ?? 0,
    evaluated: true,
  });

  public back() {
    this.callFrame.index -= 1;
    this.callFrame.instruction =
      this.callFrame.instructions[this.callFrame.index];
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
            if (value.meta?.hiddenProp) {
              continue;
            }
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
        const params = (node.funcNode.params ?? [])
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
        return `${NodeTypeEnum[node.type]} ${
          typeof node.value === "number" ? node.value : ""
        }`;
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

  private eval(str: string, env?: Node) {
    const lexer = new Lexer(str, true);
    lexer.tokenize();
    const parser = new Parser(lexer.nodes, "eval");
    const parserResult = parser.parse();
    if (parserResult) {
      return this.newNode();
    }
    const generator = new Generator(parser.nodes, parser.filePath);
    const generatorResult = generator.generate(true);
    if (generatorResult == -1) {
      return this.newNode();
    }

    if (generator.generatedNodes.at(-1)?.type === NodeTypeEnum.Pop) {
      generator.generatedNodes.pop();
    }

    const evalVM = new VM(generator.generatedNodes, this.filePath);

    evalVM.builtins = new Map([
      ...this.builtins,
      ["__frame", evalVM.builtins.get("__frame")],
      ["__builtins", evalVM.builtins.get("__builtins")],
      ["exec", evalVM.builtins.get("exec")],
      ["break", evalVM.builtins.get("break")],
    ]);

    evalVM.callFrame.variables = generator.variables;
    evalVM.callFrame.tempVariables = generator.tempVariables;
    evalVM.callFrame.variableMap = generator.variableMap;
    evalVM.callFrame.capturedIds = generator.capturedIds;
    evalVM.callFrame.capturedIds = new Set([
      ...(this.callFrame.capturedIds ?? new Set<string>()),
      ...evalVM.callFrame.capturedIds,
    ]);
    for (const [key] of this.callFrame.variableMap) {
      const index = this.callFrame.variableMap.get(key);
      const symbol = this.callFrame.symbolsArray[index];
      evalVM.callFrame.symbols.set(key, symbol);
    }

    if (env) {
      for (const prop in env.value) {
        evalVM.callFrame.symbols.set(prop, {
          node: env.value[prop],
          const: false,
        });
      }
    } else {
      evalVM.callFrame.symbols = new Map([
        ...this.callFrame.symbols,
        ...evalVM.callFrame.symbols,
      ]);
      evalVM.callFrame.tempVars = new Map(this.callFrame.tempVars);
      evalVM.callFrame.symbolsArray = [...this.callFrame.symbolsArray];
      evalVM.callFrame.tempVarsArray = this.callFrame.tempVarsArray;
    }

    const res = evalVM.evaluate();

    for (const [key] of evalVM.callFrame.variableMap) {
      const index = evalVM.callFrame.variableMap.get(key);
      const symbol = evalVM.callFrame.symbolsArray[index];
      this.callFrame.symbols.set(key, symbol);
    }

    return res;
  }

  private evalInline(str: string) {
    const lexer = new Lexer(str, true);
    lexer.tokenize();
    const parser = new Parser(lexer.nodes, "eval");
    const parserResult = parser.parse();
    if (parserResult) {
      return this.newNode();
    }
    const generator = new Generator(parser.nodes, parser.filePath);
    generator.variables = this.callFrame.variables;
    generator.tempVariables = this.callFrame.tempVariables;
    const generatorResult = generator.generate(true);
    if (generatorResult == -1) {
      return this.newNode();
    }

    if (generator.generatedNodes.at(-1)?.type === NodeTypeEnum.Pop) {
      generator.generatedNodes.pop();
    }

    const evalFrame = newCallFrame(generator.generatedNodes);
    evalFrame.parentFrame = this.callFrame;
    evalFrame.name = "eval";
    evalFrame.filePath = this.filePath;
    evalFrame.variableMap = generator.variableMap;
    evalFrame.capturedIds = generator.capturedIds;
    evalFrame.capturedIds = new Set([
      ...(this.callFrame.capturedIds ?? new Set<string>()),
      ...evalFrame.capturedIds,
    ]);

    generator.capturedIds.forEach((id) => {
      const symbol = this.findSymbol_(id);
      if (symbol) {
        evalFrame.symbols.set(id, symbol);
      } else {
        const closure = this.findClosure(id);
        if (closure) {
          evalFrame.symbols.set(id, closure);
        }
      }
    });

    this.callFrame.tempVarsArray.forEach((variable) => {
      evalFrame.symbols.set(variable.id, variable);
    });

    evalFrame.symbols = new Map([
      ...this.callFrame.symbols,
      ...evalFrame.symbols,
    ]);

    evalFrame.tempVars = this.callFrame.tempVars;
    evalFrame.symbolsArray = this.callFrame.symbolsArray;

    this.advance();
    this.callFrames.push(evalFrame);
    this.callFrame = evalFrame;
  }

  public evaluateFunctionWithArgs(fn: Node, args: Node[]) {
    if (fn.type == NodeTypeEnum.Native) {
      if (fn.nativeNode.builtin) {
        return fn.nativeNode.function(args);
      }
      return this.run(fn, args);
    }
    if (fn.type == NodeTypeEnum.Function) {
      const vm = new VM(fn.value, this.filePath);
      vm.builtins = new Map([
        ...this.builtins,
        ["__frame", vm.builtins.get("__frame")],
        ["__builtins", vm.builtins.get("__builtins")],
        ["exec", vm.builtins.get("exec")],
        ["break", vm.builtins.get("break")],
      ]);
      args.forEach((arg) => {
        arg.evaluated = true;
        vm.callFrame.symbolsArray.push({ const: true, node: arg });
      });
      fn.funcNode?.closures.forEach((v, k) => {
        vm.callFrame.symbols.set(k, v);
      });

      for (const [key] of this.callFrame.variableMap) {
        const index = this.callFrame.variableMap.get(key);
        const symbol = this.callFrame.symbolsArray[index];
        vm.callFrame.symbols.set(key, symbol);
      }

      vm.callFrame.variableMap = fn.funcNode?.variableMap;
      const res = vm.evaluate();
      global._vm = this;
      return res;
    }

    return this.newNode();
  }

  public run(native: Node, args: Node[]) {
    if (native.type !== NodeTypeEnum.Native) {
      return this.newNode();
    }

    const nativeArgs = args.map((elem) => this.nodeToJS(elem));
    const res = native.nativeNode.function(...nativeArgs);
    return this.jsToNode(res);
  }

  public builtins_ = {
    __builtins: (args: Node[]) => {
      const builtinsObject = this.newNode(NodeTypeEnum.Object, {}, true);
      this.builtins.forEach((_, key) => {
        const nativeNode = this.newNode(NodeTypeEnum.Native);
        nativeNode.nativeNode = {
          name: key,
          function: this.builtins.get(key),
          builtin: true,
        };
        builtinsObject.value.set(key, nativeNode);
      });
      return builtinsObject;
    },
    __frame: (args: Node[]) => {
      var n = 0;
      if (args.length == 1) {
        const node = args[0];
        if (node.type !== NodeTypeEnum.Number) {
          return this.newError(
            "Function '__frame' expects argument 'n' to be a Number"
          );
        }
        n = node.value;
      }

      let frame = this.callFrame;
      for (let i = 0; i < n; i++) {
        if (!frame.parentFrame) {
          break;
        }
        frame = frame.parentFrame;
      }

      const locals = this.newNode(NodeTypeEnum.Object, {}, true);

      frame.variableMap.forEach((_, key) => {
        const index = frame.variableMap.get(key);
        const symbol = frame.symbolsArray[index];
        symbol && (locals.value[key] = symbol.node);
      });

      return this.newNode(
        NodeTypeEnum.Object,
        {
          line: this.newNode(NodeTypeEnum.Number, frame.instruction?.line ?? 0),
          col: this.newNode(NodeTypeEnum.Number, frame.instruction?.col ?? 0),
          filePath: this.newNode(NodeTypeEnum.String, frame.filePath),
          name: this.newNode(NodeTypeEnum.String, frame.name ?? "anonymous"),
          vmPath: this.newNode(NodeTypeEnum.String, __dirname),
          locals,
        },
        true
      );
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
    exec: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'exec' expects 1 argument(s)");
      }

      const expr = args[0];
      if (expr.type !== NodeTypeEnum.String) {
        return this.newError(
          "Function 'exec' expects argument 'expr' to be a string"
        );
      }

      try {
        const res = eval(expr.value);
        return this.jsToNode(res);
      } catch (e) {
        return this.newError(e);
      }
    },
    raw: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'raw' expects 1 argument(s)");
      }

      const expr = args[0];
      return this.newNode(NodeTypeEnum.Raw, expr);
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
          "Function 'loadLib' expects argument 'filePath' to be a String"
        );
      }

      const lib = require(path.resolve(filePath.value));

      const libObj = this.newNode(NodeTypeEnum.Object);
      libObj.evaluated = true;
      libObj.value = {};

      for (const prop in lib) {
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
    dis: (args: Node[]) => {
      if (args.length !== 1) {
        return this.newError("Function 'dis' expects 1 argument");
      }
      let fn = args[0];
      if (fn.type !== NodeTypeEnum.Function) {
        return this.newError(
          "Function 'dis' expects argument 'fn' to be a Function"
        );
      }

      let startLine = 0;
      const dis = fn.value
        ?.map((node, i) => {
          if (i == 0) {
            startLine = node.line;
          }
          const nodeType = NodeTypeEnum[node.type];
          const nodeValue = this.toString(node);
          const currLine = node.line - startLine + 1;

          return `${i}\t[${currLine}]\t${this.toString(node)} ${
            !nodeValue.startsWith(nodeType) ? `(${nodeType})` : ""
          } `;
        })
        .join("\n");

      console.log(`---\n${fn.funcNode.name}:\n\n${dis}\n---`);
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
        case NodeTypeEnum.Native: {
          const res = this.newNode(NodeTypeEnum.Object, {}, true);
          const name = node.nativeNode?.name ?? "";
          const builtin = node.nativeNode?.builtin ?? false;

          res.value.name = this.newNode(NodeTypeEnum.String, name);
          res.value.builtin = this.newNode(NodeTypeEnum.Boolean, builtin);

          return res;
        }
        default: {
          return this.newNode();
        }
      }
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
    closures: (args: Node[]) => {
      const symbolObject = this.newNode(NodeTypeEnum.Object, {}, true);
      this.callFrame.symbols.forEach((_, key) => {
        const symbol = this.callFrame.symbols.get(key);
        !symbol?.isGlobal && (symbolObject.value[key] = symbol.node);
      });
      return symbolObject;
    },
    globals: (args: Node[]) => {
      const symbolObject = this.newNode(NodeTypeEnum.Object, {}, true);
      this.callFrame.symbols.forEach((_, key) => {
        const symbol = this.callFrame.symbols.get(key);
        symbol?.isGlobal && (symbolObject.value[key] = symbol.node);
      });
      return symbolObject;
    },
    locals: (args: Node[]) => {
      const symbolObject = this.newNode(NodeTypeEnum.Object, {}, true);
      this.callFrame.variableMap.forEach((_, key) => {
        const index = this.callFrame.variableMap.get(key);
        const symbol = this.callFrame.symbolsArray[index];
        symbol && (symbolObject.value[key] = symbol.node);
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
  };

  public builtins = new Map(Object.entries(this.builtins_));

  private evaluateOperator(node: Node) {
    var right = this.callFrame.stack.pop();

    const customOperation = this.operators[node.value];
    if (customOperation) {
      if (node.value.startsWith("unary")) {
        right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));
        if (right.type === NodeTypeEnum.Error) {
          return right;
        }
        return this.evaluateFunctionWithArgs(customOperation, [right]);
      }

      var left = this.callFrame.stack.pop();

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

    return this.newError(`Operator '${node.value}' is not defined`);
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
    const _symbol = this.callFrame.symbolsArray[node.index];
    return _symbol.node;
  }

  private resetLoops() {
    for (const node of this.callFrame.instructions) {
      if (node.type === NodeTypeEnum.StartForLoop) {
        node.forLoopStartNode.count = -1;
        node.forLoopStartNode.arr = undefined;
      }
    }
  }

  private evaluateBreak(breakAll: boolean = false) {
    var loopCount = 1;
    while (this.callFrame.instruction) {
      if (
        this.callFrame.instruction.type === NodeTypeEnum.StartForLoop ||
        this.callFrame.instruction.type === NodeTypeEnum.StartWhileLoop
      ) {
        loopCount++;
      } else if (
        this.callFrame.instruction.type === NodeTypeEnum.ForStatement ||
        this.callFrame.instruction.type === NodeTypeEnum.WhileStatement
      ) {
        loopCount--;
        if (loopCount === 0) {
          // reset the start loop
          if (this.callFrame.instruction.type === NodeTypeEnum.ForStatement) {
            this.callFrame.instructions[
              this.callFrame.instruction.value
            ].forLoopStartNode.count = -1;
            this.callFrame.instructions[
              this.callFrame.instruction.value
            ].forLoopStartNode.arr = undefined;
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
    const node = this.callFrame.instruction;
    var numberOfLoopsEncountered = 0;
    while (true) {
      if (!this.callFrame.instruction) {
        // We've gone too far back
        this.errorAndExit("Break count exceeds number of loops", node);
        return;
      }
      if (
        this.callFrame.instruction.type === NodeTypeEnum.StartForLoop ||
        this.callFrame.instruction.type === NodeTypeEnum.StartWhileLoop
      ) {
        numberOfLoopsEncountered++;
        if (this.callFrame.instruction.type === NodeTypeEnum.StartForLoop) {
          this.callFrame.instruction.forLoopStartNode.count = 0;
          this.callFrame.instruction.forLoopStartNode.arr = undefined;
        }
        if (numberOfLoopsEncountered === n) {
          if (this.callFrame.instruction.type === NodeTypeEnum.StartForLoop) {
            this.callFrame.index =
              this.callFrame.instruction.forLoopStartNode.endIndex;
            this.callFrame.instruction =
              this.callFrame.instructions[this.callFrame.index];
          } else if (
            this.callFrame.instruction.type === NodeTypeEnum.StartWhileLoop
          ) {
            this.callFrame.index = this.callFrame.instruction.value;
            this.callFrame.instruction =
              this.callFrame.instructions[this.callFrame.index];
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
      if (!this.callFrame.stack.at(-1)) {
        this.errorAndExit("For loops must have a valid array");
        node.forLoopStartNode.count = -1;
        node.forLoopStartNode.arr = undefined;
        if (node.forLoopStartNode.valueName) {
          this.callFrame.tempVarsArray.pop();
        }
        if (node.forLoopStartNode.indexName) {
          this.callFrame.tempVarsArray.pop();
        }
        return;
      }
      var arr = this.callFrame.stack.pop();
      if (arr.type === NodeTypeEnum.Undefined) {
        this.errorAndExit("For loops must have a valid array");
        node.forLoopStartNode.count = -1;
        node.forLoopStartNode.arr = undefined;
        if (node.forLoopStartNode.valueName) {
          this.callFrame.tempVarsArray.pop();
        }
        if (node.forLoopStartNode.indexName) {
          this.callFrame.tempVarsArray.pop();
        }
        return;
      }
      if (arr.type === NodeTypeEnum.ID) {
        arr = this.evaluateID(arr);
        if (arr.type === NodeTypeEnum.Error) {
          this.errorAndExit(arr.value);
          node.forLoopStartNode.count = -1;
          node.forLoopStartNode.arr = undefined;
          if (node.forLoopStartNode.valueName) {
            this.callFrame.tempVarsArray.pop();
          }
          if (node.forLoopStartNode.indexName) {
            this.callFrame.tempVarsArray.pop();
          }
          return;
        }
      }
      node.forLoopStartNode.arr = arr.nodes;
    }

    if (!node.forLoopStartNode.arr) {
      this.errorAndExit("For loops must have a valid array");
      node.forLoopStartNode.count = -1;
      node.forLoopStartNode.arr = undefined;
      if (node.forLoopStartNode.valueName) {
        this.callFrame.tempVarsArray.pop();
      }
      if (node.forLoopStartNode.indexName) {
        this.callFrame.tempVarsArray.pop();
      }
      return;
    }

    if (node.forLoopStartNode.count >= node.forLoopStartNode.arr.length) {
      node.forLoopStartNode.count = -1;
      node.forLoopStartNode.arr = undefined;
      this.callFrame.index = node.forLoopStartNode.endIndex;
      this.callFrame.instruction =
        this.callFrame.instructions[this.callFrame.index];

      if (node.forLoopStartNode.valueName) {
        this.callFrame.tempVarsArray.pop();
      }
      if (node.forLoopStartNode.indexName) {
        this.callFrame.tempVarsArray.pop();
      }
      return;
    }

    if (node.forLoopStartNode.valueName) {
      this.callFrame.tempVarsArray[node.forLoopStartNode.valueIndex] = {
        id: node.forLoopStartNode.valueName,
        node: node.forLoopStartNode.arr[node.forLoopStartNode.count],
        const: false,
      };
    }
    if (node.forLoopStartNode.indexName) {
      this.callFrame.tempVarsArray[node.forLoopStartNode.indexIndex] = {
        id: node.forLoopStartNode.indexName,
        node: this.newNode(NodeTypeEnum.Number, node.forLoopStartNode.count),
        const: false,
      };
    }
  }

  private evaluateDecl(node: Node) {
    var value = this.callFrame.stack.pop();
    var id = this.callFrame.stack.pop();

    if (!id) {
      return this.newError("Malformed declaration");
    }

    if (id?.type === NodeTypeEnum.List) {
      if (value.type === NodeTypeEnum.List) {
        var valueNodes = [...value.nodes];

        id.nodes.forEach((elem, i) => {
          if (i < id.nodes.length - 1) {
            const declNode = this.newNode(NodeTypeEnum.Decl, node.value);
            declNode.declNode = {
              variableIndex: node.declNode.variableIndices[i],
            };
            this.callFrame.stack.push(
              this.newNode(NodeTypeEnum.ID, elem.value)
            );
            this.callFrame.stack.push(valueNodes.shift() ?? this.newNode());
            this.evaluateDecl(declNode);
          }
        });

        if (valueNodes.length > 1) {
          const declNode = this.newNode(NodeTypeEnum.Decl, node.value);
          declNode.declNode = {
            variableIndex: node.declNode.variableIndices.at(-1),
          };
          this.callFrame.stack.push(
            this.newNode(NodeTypeEnum.ID, id.nodes.at(-1)?.value)
          );
          const restList = this.newNode(NodeTypeEnum.List);
          restList.evaluated = true;
          restList.nodes = valueNodes;
          this.callFrame.stack.push(restList);
          this.evaluateDecl(declNode);
        } else {
          const declNode = this.newNode(NodeTypeEnum.Decl, node.value);
          declNode.declNode = {
            variableIndex: node.declNode.variableIndices.at(-1),
          };
          this.callFrame.stack.push(
            this.newNode(NodeTypeEnum.ID, id.nodes.at(-1)?.value)
          );
          this.callFrame.stack.push(valueNodes[0] ?? this.newNode());
          this.evaluateDecl(declNode);
        }
      } else if (value.type === NodeTypeEnum.Object) {
        id.nodes.forEach((elem, i) => {
          const declNode = this.newNode(NodeTypeEnum.Decl, node.value);
          declNode.declNode = {
            variableIndex: node.declNode.variableIndices[i],
          };
          this.callFrame.stack.push(this.newNode(NodeTypeEnum.ID, elem.value));
          this.callFrame.stack.push(value.value[elem.value] ?? this.newNode());
          this.evaluateDecl(declNode);
        });
      }

      return this.newNode();
    }

    if (value.type === NodeTypeEnum.Function && !value.funcNode?.name) {
      value.funcNode.name = id.value;
    }

    if (node?.declNode?.isClass) {
      value.class = id;
    }

    this.callFrame.symbolsArray[node.declNode.variableIndex] = {
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
      fn = this.callFrame.stack.pop();
    }

    const args = [];
    const namedArgs = {};

    while (true) {
      const arg = this.callFrame.stack.pop();
      if (arg.type === NodeTypeEnum.FunctionCallBegin) {
        break;
      }
      if (arg.type === NodeTypeEnum.NamedArg) {
        namedArgs[arg.left.value] = arg.right;
      } else {
        args.unshift(arg);
      }
    }

    if (isMethod) {
      fn = this.callFrame.stack.pop();
    }

    if (fn.type === NodeTypeEnum.Undefined) {
      return fn;
    }

    if (fn.type === NodeTypeEnum.Native) {
      if (fn.nativeNode.builtin) {
        return fn.nativeNode.function(args);
      }
      return this.run(fn, args);
    }

    if (fn.type === NodeTypeEnum.String) {
      fnName = fn.value;
    }

    if (fnName && this.builtins.has(fnName)) {
      return this.builtins.get(fnName)(args);
    }

    fnName &&
      (fn =
        this.callFrame.symbolsArray[fn.index]?.node ??
        this.callFrame.symbols.get(fnName)?.node);

    if (!fn) {
      this.errorAndContinue(`Function '${fnName}' is undefined`);
      return this.newNode();
    }

    if (fn.type === NodeTypeEnum.Native) {
      if (fn.nativeNode.builtin) {
        return fn.nativeNode.function(args);
      }
      return this.run(fn, args);
    }

    if (fn.type !== NodeTypeEnum.Function) {
      return this.newNode();
    }

    const frame = newCallFrame(fn.value);
    frame.parentFrame = this.callFrame;
    frame.variableMap = fn.funcNode?.variableMap;
    frame.capturedIds = fn.funcNode?.capturedIds;
    frame.name = fn.funcNode?.name ?? "anonymous";
    frame.filePath = fn.funcNode.originFilePath;
    if (fn.class) {
      frame.class = fn;
    }

    // First call of coroutine
    if (fn.funcNode.isCoroutine && fn.funcNode.coroutineIndex === undefined) {
      frame.coroutine = fn;
      const newfn = { ...fn };
      const closures = newfn.funcNode.closures;
      newfn.funcNode.closures = new Map();
      fn = structuredClone(newfn);
      fn.funcNode.closures = closures;
      fn.funcNode.symbolsArray = [];
      fn.funcNode.coroutineIndex = 0;
      if (fn.funcNode.params.length > 0) {
        const initParam = fn.funcNode.params.shift();
        var initArg = args[0];
        if (!initArg) {
          initArg = fn.funcNode?.defaults[initParam.value] ?? this.newNode();
        }
        fn.funcNode.symbolsArray.push({
          node: initArg,
          const: false,
        });
      }
      return fn;
    }

    if (fn.funcNode.coroutineIndex !== undefined) {
      frame.coroutine = fn;
      for (const [key] of fn.funcNode.closures) {
        frame.symbols.set(key, fn.funcNode.closures.get(key));
      }

      frame.symbolsArray = fn.funcNode.symbolsArray;

      frame.index = fn.funcNode.coroutineIndex - 1;
      frame.instruction = frame.instructions[frame.index];
    } else {
      for (const [key] of fn.funcNode.closures) {
        frame.symbols.set(key, fn.funcNode.closures.get(key));
      }
    }

    if (fn.funcNode?.name && !frame.symbols.get(fn.funcNode?.name)) {
      frame.symbols.set(fn.funcNode.name, { node: fn, const: false });
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

        frame.symbolsArray.push({
          node: catchAll,
          const: false,
        });
      } else {
        const defaultParam = fn.funcNode.defaults[param.value];

        if (defaultParam) {
          paramValue = defaultParam;
        }

        if (args[index]) {
          paramValue = args[index];
        }

        frame.symbolsArray.push({
          node: paramValue,
          const: false,
        });
      }
    });

    for (const prop in namedArgs) {
      const index = frame.variableMap.get(prop);
      frame.symbolsArray[index] = {
        node: namedArgs[prop],
        const: false,
      };
    }

    !fnName && (fnName = fn.funcNode?.name);

    if (fn.schema) {
      Object.keys(fn.schema.value).forEach((key) => {
        const schemaProp = fn.schema.value[key];
        const index = frame.variableMap.get(key);
        const valueType = NodeTypeEnum[frame.symbolsArray[index].node.type];

        if (schemaProp.type === NodeTypeEnum.List && schemaProp.nodes) {
          if (!schemaProp.nodes.map((e) => e.value).includes(valueType)) {
            this.errorAndExit(
              `Function '${fnName}' expects parameter '${key}' to be of type ${this.toString(
                schemaProp
              )} but was provided with value of type ${valueType}`
            );
            return;
          }
        } else if (schemaProp.value !== valueType) {
          this.errorAndExit(
            `Function '${fnName}' expects parameter '${key}' to be of type ${schemaProp.value} but was provided with value of type ${valueType}`
          );
          return;
        }
      });
    }

    fn.value = fn.value.map((n) => {
      if (n.type === NodeTypeEnum.StartForLoop) {
        return {
          ...n,
          forLoopStartNode: {
            ...n.forLoopStartNode,
            arr: undefined,
            count: -1,
          },
        };
      }
      return n;
    });

    this.advance();
    this.callFrames.push(frame);
    this.callFrame = frame;

    // if (fn.funcNode?.isCoroutine) {
    //   fn.funcNode.coroutineIndex = frame.index + 1;
    //   fn.funcNode.coroutineSymbols = frame.symbols;
    //   Object.entries(frame.variableMap).forEach(([key, index]) => {
    //     const symbol = frame.symbolsArray[index];
    //     fn.funcNode.symbolsArray[index] = symbol;
    //   });
    // }
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
      arg = this.callFrame.stack.pop();
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
      const value = this.callFrame.stack.pop();
      var key = this.callFrame.stack.pop();

      if (key.type === NodeTypeEnum.List) {
        key = this.evaluateID(key.nodes[0]);
        if (key.type === NodeTypeEnum.Error) {
          this.errorAndContinue(key.value);
          continue;
        }
        key.value = this.toString(key);
      }

      if (value.type === NodeTypeEnum.Function) {
        value.funcNode.name = key.value;
        value.funcNode.closures.set("this", {
          node: evaluatedObject,
          const: false,
        });
      }

      evaluatedObject.value[key.value] = value;
    }
    return evaluatedObject;
  }

  public findClosure(id: string) {
    let frame = this.callFrame;
    while (frame) {
      if (frame.symbols.has(id)) {
        return frame.symbols.get(id);
      }
      frame = frame.parentFrame;
    }

    return undefined;
  }

  public findSymbol_(id: string) {
    let frame = this.callFrame;
    while (frame) {
      if (frame.variableMap.has(id)) {
        const index = frame.variableMap.get(id);
        return frame.symbolsArray[index];
      }
      frame = frame.parentFrame;
    }

    return undefined;
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
      closures: new Map(),
      isCoroutine: node.funcNode?.isCoroutine,
      originFilePath: node.funcNode?.originFilePath,
      variableMap: node.funcNode?.variableMap,
    };
    fn.meta = node.meta;
    fn.class = node.class;
    var numParams = this.callFrame.stack.pop();
    if (numParams.type === NodeTypeEnum.Object) {
      fn.schema = numParams;
      numParams = this.callFrame.stack.pop();
    }
    for (let i = 0; i < numParams.value; i++) {
      const param = this.callFrame.stack.pop();
      if (param.type === NodeTypeEnum.DefaultParam) {
        fn.funcNode.params.unshift(param.left);
        fn.funcNode.defaults[param.left.value] = param.right;
      } else {
        fn.funcNode.params.unshift(param);
      }
    }

    fn.meta?.capturedIds?.forEach((id) => {
      const symbol = this.findSymbol_(id);
      if (symbol) {
        fn.funcNode.closures.set(id, symbol);
      } else {
        const closure = this.findClosure(id);
        if (closure) {
          fn.funcNode.closures.set(id, closure);
        }
      }
    });

    // Inject globals

    this.callFrame.symbols.forEach((value, key) => {
      if (value.isGlobal) {
        fn.funcNode.closures.set(key, value);
      }
    });

    return fn;
  }

  nodeFunctions = {
    [NodeTypeEnum.Number]: (node: Node) => node,
    [NodeTypeEnum.Boolean]: (node: Node) => node,
    [NodeTypeEnum.String]: (node: Node) => node,
    [NodeTypeEnum.Native]: (node: Node) => node,
    [NodeTypeEnum.ListBegin]: (node: Node) => node,
    [NodeTypeEnum.FunctionCallBegin]: (node: Node) => node,
    [NodeTypeEnum.CatchAllParam]: (node: Node) => node,
    [NodeTypeEnum.Error]: (node: Node) => node,
    [NodeTypeEnum.Raw]: (node: Node) => node,
    [NodeTypeEnum.Undefined]: (node: Node) => this.newNode(),
    [NodeTypeEnum.ID]: (node: Node) => this.evaluateID(node),
    [NodeTypeEnum.Operator]: (node: Node) => this.evaluateOperator(node),
    [NodeTypeEnum.List]: (node: Node) => this.evaluateList(node),
    [NodeTypeEnum.Object]: (node: Node) => this.evaluateObject(node),
    [NodeTypeEnum.Decl]: (node: Node) => this.evaluateDecl(node),
    [NodeTypeEnum.Function]: (node: Node) => this.evaluateFunction(node),
    [NodeTypeEnum.FunctionCall]: (node: Node) =>
      this.evaluateFunctionCall(node),
    [NodeTypeEnum.MethodCall]: (node: Node) =>
      this.evaluateFunctionCall(node, true),
    [NodeTypeEnum.StartForLoop]: (node: Node) => {
      this.evaluateForLoop(node);
      return;
    },
    [NodeTypeEnum.ForStatement]: (node: Node) => {
      const startIndex = node.value;
      this.callFrame.index = startIndex - 1;
      return;
    },
    [NodeTypeEnum.DefaultParam]: (node: Node) => {
      const value = this.callFrame.stack.pop();
      const name = this.callFrame.stack.pop();
      const res = this.newNode(NodeTypeEnum.DefaultParam);
      res.left = name;
      res.right = value;
      return res;
    },
    [NodeTypeEnum.NamedArg]: (node: Node) => {
      const value = this.callFrame.stack.pop();
      const name = this.callFrame.stack.pop();
      const res = this.newNode(NodeTypeEnum.NamedArg);
      res.left = name;
      res.right = value;
      return res;
    },
    [NodeTypeEnum.Return]: (node: Node) => {
      const res = this.callFrame.stack.pop();
      this.resetLoops();
      return this.newNode(NodeTypeEnum.Return, res);
    },
    [NodeTypeEnum.Yield]: (node: Node) => {
      const res = this.callFrame.stack.pop();
      return this.newNode(NodeTypeEnum.Yield, res);
    },
    [NodeTypeEnum.Break]: (node: Node) => {
      this.evaluateBreak();
      return;
    },
    [NodeTypeEnum.Continue]: (node: Node) => {
      var loopCount = 1;
      while (this.callFrame.instruction) {
        if (
          this.callFrame.instruction.type === NodeTypeEnum.StartForLoop ||
          this.callFrame.instruction.type === NodeTypeEnum.StartWhileLoop
        ) {
          loopCount--;
          if (loopCount === 0) {
            this.callFrame.index--;
            break;
          }
        } else if (
          this.callFrame.instruction.type === NodeTypeEnum.ForStatement ||
          this.callFrame.instruction.type === NodeTypeEnum.WhileStatement
        ) {
          loopCount++;
        }
        this.back();
      }
      return;
    },
    [NodeTypeEnum.Jump]: (node: Node) => {
      this.callFrame.index = node.value;
      return;
    },
    [NodeTypeEnum.JumpIfTrue]: (node: Node) => {
      var statement = this.callFrame.stack.at(-1);
      if (statement.type === NodeTypeEnum.ID) {
        statement = this.evaluateID(statement);
      }
      if (statement.type === NodeTypeEnum.Error) {
        this.errorAndContinue(statement.value);
        this.callFrame.index = node.value;
        return;
      }
      const truthy =
        statement.type === NodeTypeEnum.Boolean
          ? statement.value
          : statement.type !== NodeTypeEnum.Undefined;
      if (truthy) {
        this.callFrame.index = node.value;
      }
      return;
    },
    [NodeTypeEnum.JumpIfFalse]: (node: Node) => {
      var statement = this.callFrame.stack.at(-1);
      if (statement.type === NodeTypeEnum.ID) {
        statement = this.evaluateID(statement);
      }
      if (statement.type === NodeTypeEnum.Error) {
        this.errorAndContinue(statement.value);
        this.callFrame.index = node.value;
        return;
      }
      const truthy =
        statement.type === NodeTypeEnum.Boolean
          ? statement.value
          : statement.type !== NodeTypeEnum.Undefined;
      if (!truthy) {
        this.callFrame.index = node.value;
      }
      return;
    },
    [NodeTypeEnum.JumpIfFalsePop]: (node: Node) => {
      var statement = this.callFrame.stack.pop();
      if (statement.type === NodeTypeEnum.ID) {
        statement = this.evaluateID(statement);
      }
      if (statement.type === NodeTypeEnum.Error) {
        this.errorAndContinue(statement.value);
        this.callFrame.index = node.value;
        return;
      }
      const truthy =
        statement.type === NodeTypeEnum.Boolean
          ? statement.value
          : statement.type !== NodeTypeEnum.Undefined;
      if (!truthy) {
        this.callFrame.index = node.value;
      }
      return;
    },
    [NodeTypeEnum.Accessor]: (node: Node) => {
      const accessor = this.callFrame.stack.pop();
      const toAccess = this.callFrame.stack.pop();
      if (
        toAccess.type === NodeTypeEnum.Object &&
        accessor.type === NodeTypeEnum.String
      ) {
        const value = toAccess.value[accessor.value] ?? this.newNode();
        const intercept = toAccess.handler?.value?.get?.value?.[accessor.value];
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
    },
    [NodeTypeEnum.ModifyProperty]: (node: Node) => {
      const accessor = this.callFrame.stack.pop();
      const value = this.callFrame.stack.pop();
      const toModify = this.callFrame.stack.pop();

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
        const intercept = toModify.handler?.value?.set?.value?.[accessor.value];
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
    },
    [NodeTypeEnum.Pop]: (node: Node) => {
      this.callFrame.stack.pop();
      return;
    },
    [NodeTypeEnum.WhileStatement]: (node: Node) => {
      return;
    },
    [NodeTypeEnum.StartWhileLoop]: (node: Node) => {
      return;
    },
    [NodeTypeEnum.SwapStack]: (node: Node) => {
      const a = this.callFrame.stack.pop();
      const b = this.callFrame.stack.pop();
      this.callFrame.stack.push(a);
      this.callFrame.stack.push(b);
      return;
    },
    [NodeTypeEnum.Eval]: (node: Node) => {
      this.evalInline(node.value);
      return;
    },
    [NodeTypeEnum.Import]: (node: Node) => {
      const importFrom = this.callFrame.stack.pop();
      let importFromResolved: string = importFrom.value;
      for (const p in this.paths) {
        importFromResolved = importFromResolved.replace(
          new RegExp(p, "g"),
          this.paths[p]
        );
      }
      const isDir =
        fs.existsSync(importFromResolved) &&
        fs.lstatSync(importFromResolved).isDirectory();

      if (isDir) {
        importFromResolved = path.join(importFromResolved, "index.sp");
      } else {
        const extName = path.extname(importFromResolved);
        if (!extName.length) {
          importFromResolved += ".sp";
        }
      }
      const lexer = new Lexer(importFromResolved);
      lexer.tokenize();
      if (!lexer.nodes.length) {
        return;
      }
      const parser = new Parser(lexer.nodes, lexer.filePath);
      parser.parse();
      const generator = new Generator(parser.nodes, parser.filePath);
      generator.generate();

      const vm = new VM(generator.generatedNodes, generator.filePath);

      vm.builtins = new Map([
        ...this.builtins,
        ["__frame", vm.builtins.get("__frame")],
        ["__builtins", vm.builtins.get("__builtins")],
        ["exec", vm.builtins.get("exec")],
        ["break", vm.builtins.get("break")],
      ]);

      vm.callFrame.variables = generator.variables;
      vm.callFrame.tempVariables = generator.tempVariables;
      vm.callFrame.variableMap = generator.variableMap;

      vm.operators = this.operators;
      vm.parentVM = this;
      vm.injectBuiltins = this.injectBuiltins;

      this.callFrame.symbols.forEach((_, k) => {
        const symbol = this.callFrame.symbols.get(k);
        if (symbol.isGlobal) {
          vm.callFrame.symbols.set(k, symbol);
        }
      });

      const resolvedPath = path.resolve(importFromResolved);
      const currentDirPath = process.cwd();

      process.chdir(path.dirname(resolvedPath));

      injectConfig(vm, process.cwd());

      vm.evaluate();

      process.chdir(currentDirPath);

      if (node.value === 0) {
        const moduleName = this.callFrame.stack.pop();

        const cachedObject = this.cachedImports[resolvedPath];
        if (cachedObject) {
          this.callFrame.symbols.set(moduleName.value, {
            node: cachedObject,
            const: false,
          });
          return;
        }

        const moduleObject = this.newNode(NodeTypeEnum.Object, {});
        moduleObject.evaluated = true;
        vm.callFrame.symbols.forEach((_, key) => {
          const symbol = vm.callFrame.symbols.get(key);
          moduleObject.value[key] = {
            ...symbol.node,
            meta: { hiddenProp: symbol.isGlobal },
          };
        });
        vm.callFrame.variableMap.forEach((_, key) => {
          const index = vm.callFrame.variableMap.get(key);
          const symbol = vm.callFrame.symbolsArray[index];
          moduleObject.value[key] = {
            ...symbol.node,
            meta: { hiddenProp: symbol.isGlobal },
          };
        });
        this.callFrame.symbols.set(moduleName.value, {
          node: moduleObject,
          const: false,
        });

        this.cachedImports[resolvedPath] = moduleObject;

        return;
      }

      for (let i = 0; i < node.value; i++) {
        const name = this.callFrame.stack.pop();
        if (vm.callFrame.variableMap.get(name.value) !== undefined) {
          this.callFrame.symbols.set(name.value, {
            node: vm.callFrame.symbolsArray[
              vm.callFrame.variableMap.get(name.value)
            ].node,
            const: false,
          });
        } else {
          this.errorAndContinue(
            `Variable '${name.value}' does not exist in '${resolvedPath}'`
          );
        }
      }
      return;
    },
    [NodeTypeEnum.Pos]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));
      return right;
    },
    [NodeTypeEnum.Neg]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      right.type === NodeTypeEnum.ID && (right = this.evaluateID(right));
      if (right.type === NodeTypeEnum.Error) {
        return right;
      }
      if (right.type === NodeTypeEnum.Number) {
        return { ...right, value: -right.value };
      }
      return this.newNode();
    },
    [NodeTypeEnum.Exclamation]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      const truthy =
        right.type === NodeTypeEnum.Boolean
          ? right.value
          : right.type !== NodeTypeEnum.Undefined;
      return this.newNode(NodeTypeEnum.Boolean, !truthy);
    },
    [NodeTypeEnum.UnaryTripleDot]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      if (right.type === NodeTypeEnum.List) {
        right.nodes?.forEach((elem) => this.callFrame.stack.push(elem));
        return;
      }
      return this.newNode();
    },
    [NodeTypeEnum.Add]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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

      if (left.type === NodeTypeEnum.String) {
        if (right.type === NodeTypeEnum.String) {
          return this.newNode(NodeTypeEnum.String, left.value + right.value);
        }
        return this.newNode(
          NodeTypeEnum.String,
          left.value + this.toString(right)
        );
      }
      if (left.type === NodeTypeEnum.List && right.type === NodeTypeEnum.List) {
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
    },
    [NodeTypeEnum.Sub]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.Mul]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.Div]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.Percent]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.Caret]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.Equal]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

      if (right.type === NodeTypeEnum.Error) {
        return right;
      }

      if (left.index >= 0) {
        this.callFrame.symbolsArray[left.index].node = right;
        return right;
      }

      if (this.callFrame.symbols.has(left.value)) {
        this.callFrame.symbols.get(left.value).node = right;
        return right;
      }

      return this.newNode();
    },
    [NodeTypeEnum.TripleDot]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.DoubleDot]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.Pipe]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.EqualEqual]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.NotEqual]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.LessThan]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.GreaterThan]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.LessThanOrEqual]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.GreaterThanOrEqual]: (node: Node) => {
      var right = this.callFrame.stack.pop();
      var left = this.callFrame.stack.pop();

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
    },
    [NodeTypeEnum.Load]: (node: Node) => {
      return this.callFrame.symbolsArray[node.value].node;
    },
    [NodeTypeEnum.LoadTemp]: (node: Node) => {
      const index = node.value;
      return this.callFrame.tempVarsArray[index].node;
    },
    [NodeTypeEnum.LoadSymbol]: (node: Node) => {
      const name = node.value;
      if (this.callFrame.symbols.has(name)) {
        return this.callFrame.symbols.get(name).node;
      }
      if (this.builtins.has(name)) {
        const native = this.newNode(NodeTypeEnum.Native);
        native.nativeNode = {
          name,
          function: this.builtins.get(name),
          builtin: true,
        };
        return native;
      }
      return this.newError(`Variable '${name}' is undefined`);
    },
    [NodeTypeEnum.Store]: (node: Node) => {
      const value = this.callFrame.stack.pop();
      this.callFrame.symbolsArray[node.value].node = value;
      return value;
    },
    [NodeTypeEnum.AddAssign]: (node: Node) => {
      const right = this.callFrame.stack.pop();
      const left = this.callFrame.symbolsArray[node.value].node;
      // TODO: replace with function
      if (
        left.type === NodeTypeEnum.Number &&
        right.type === NodeTypeEnum.Number
      ) {
        this.callFrame.symbolsArray[node.value].node = this.newNode(
          NodeTypeEnum.Number,
          left.value + right.value
        );
        return this.callFrame.symbolsArray[node.value].node;
      }

      if (
        left.type === NodeTypeEnum.String &&
        right.type === NodeTypeEnum.String
      ) {
        this.callFrame.symbolsArray[node.value].node = this.newNode(
          NodeTypeEnum.Number,
          left.value + right.value
        );
        return this.callFrame.symbolsArray[node.value].node;
      }

      if (left.type === NodeTypeEnum.List && right.type === NodeTypeEnum.List) {
        this.callFrame.symbolsArray[node.value].node = this.newNode(
          NodeTypeEnum.List,
          undefined,
          true
        );
        this.callFrame.symbolsArray[node.value].node.nodes = [
          ...left?.nodes,
          ...right?.nodes,
        ];
        return this.callFrame.symbolsArray[node.value].node;
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
        this.callFrame.symbolsArray[node.value].node = newObject;
        return this.callFrame.symbolsArray[node.value].node;
      }
    },
  };

  nodeMap = new Map(
    Object.entries(this.nodeFunctions).map(([key, value]) => [
      Number(key),
      value,
    ])
  );

  public evaluate() {
    global._vm = this;
    while (true) {
      if (this.hasError) {
        this.hasError = false;
        this.callFrames.splice(1);
        this.callFrame = this.callFrames[0];
        this.callFrame.index = -1;
        this.resetLoops();
        return this.newNode();
      }
      while (!this.callFrame.instruction) {
        if (this.callFrame.parentFrame) {
          const result = this.callFrame.stack.pop() ?? this.newNode();
          this.callFrame = this.callFrame.parentFrame;
          this.callFrames.pop();
          this.callFrame.stack.push(result);
        } else {
          return this.callFrame.stack.pop() ?? this.newNode();
        }
      }

      // const res = this.nodeFunctions[this.callFrame.instruction.type](
      //   this.callFrame.instruction
      // );

      const res = this.nodeMap.get(this.callFrame.instruction.type)(
        this.callFrame.instruction
      );

      if (
        res?.type === NodeTypeEnum.Return ||
        res?.type === NodeTypeEnum.Yield
      ) {
        const returnValue = res.value;
        if (!returnValue.class) {
          returnValue.class = this.callFrame.class;
        }

        if (this.callFrame.coroutine) {
          this.callFrame.coroutine.funcNode.coroutineIndex =
            this.callFrame.index - 2;
          this.callFrame.variableMap.forEach((index) => {
            const symbol = this.callFrame.symbolsArray[index];
            this.callFrame.coroutine.funcNode.symbolsArray[index] = symbol;
          });
        }

        if (!this.callFrame.parentFrame) {
          return returnValue;
        }

        this.callFrame = this.callFrame.parentFrame;
        this.callFrames.pop();
        this.callFrame.stack.push(returnValue);
        continue;
      }
      if (res) {
        this.callFrame.stack.push(res);
      }
      if (res?.type === NodeTypeEnum.Error) {
        this.errorAndContinue(res.value);
      }

      this.advance();
    }
  }
}
