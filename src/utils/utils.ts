import { Node, NodeTypeEnum } from "../types";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Generator } from "../generator/generator";
import { VM } from "../vm/vm";
import fs from "fs";
import path from "path";

export const node = (
  type: NodeTypeEnum = NodeTypeEnum.Undefined,
  value: any = undefined,
  col: number = 0,
  line: number = 0
): Node => ({
  col: col,
  line: line,
  type,
  value,
  evaluated: true,
});

export type Schema = {
  name: string;
  // parameters: Record<string, NodeType | NodeType[]>;
  parameters: Record<string, string | string[]>;
};

export const validate = (args: Node[], schema: Schema) => {
  const numArgs = Object.keys(schema.parameters).length;
  if (args.length !== numArgs) {
    return {
      success: false,
      message: `Function '${schema.name}' expects ${numArgs} argument(s) but was provided ${args.length}`,
    };
  }

  var error;

  Object.entries(schema.parameters).forEach(([param, type], index) => {
    const arg = args[index];
    const isArray = Array.isArray(type);
    if (
      isArray
        ? !type.includes(NodeTypeEnum[arg.type])
        : NodeTypeEnum[arg.type] !== type
    ) {
      !error &&
        (error = `Function '${
          schema.name
        }' expects paramater '${param}' to be of type ${
          isArray ? type.join(" | ") : type
        } but was provided with value of type ${arg.type}`);
    }
  });

  if (error) {
    return { success: false, message: error };
  }

  return { success: true, message: "" };
};

export const getParamNames = (func: Function) => {
  // Convert the function to a string
  const funcStr = func.toString();

  // Match the parameters inside the parentheses
  const result =
    funcStr.match(/function\s*[^(]*\(\s*([^)]*)\)/) ||
    funcStr.match(/\(([^)]*)\)\s*=>/);

  if (!result) return [];

  // Split the parameters by commas and trim them
  return result[1]
    .split(",")
    .map((param) => param.trim())
    .filter((param) => param) // Filter out any empty strings
    .join(", ");
};

export const injectCommonAndModules = (
  vm: VM,
  commonPath: string,
  modulesPath: string
) => {
  // Common
  try {
    const common = fs.readFileSync(commonPath);
    const commonLexer = new Lexer(common.toString(), true);
    commonLexer.filePath = commonPath;
    commonLexer.tokenize();

    const commonParser = new Parser(commonLexer.nodes, commonLexer.filePath);
    const parserResult = commonParser.parse();

    if (parserResult) {
      return;
    }

    const commonGenerator = new Generator(
      commonParser.nodes,
      commonParser.filePath
    );

    const generatorResult = commonGenerator.generate();

    if (generatorResult == -1) {
      return;
    }

    const commonVM = new VM(
      commonGenerator.generatedNodes,
      commonParser.filePath
    );

    commonVM.callFrame.variableMap = commonGenerator.variableMap;
    commonVM.callFrame.variables = commonGenerator.variables;
    commonVM.callFrame.tempVariables = commonGenerator.tempVariables;

    commonVM.evaluate();

    Object.keys(commonVM.callFrame.variableMap).forEach((k) => {
      const index = commonVM.callFrame.variableMap[k];
      const symbol = commonVM.callFrame.symbolsArray[index];
      symbol.isGlobal = true;
      vm.callFrame.symbols[k] = symbol;
    });

    const moduleObject = commonParser.newNode(NodeTypeEnum.Object, {});
    moduleObject.evaluated = true;
    Object.keys(commonVM.callFrame.symbols).forEach((key) => {
      moduleObject.value[key] = commonVM.callFrame.symbols[key].node;
    });
    Object.keys(commonVM.callFrame.variableMap).forEach((key) => {
      const index = commonVM.callFrame.variableMap[key];
      moduleObject.value[key] = commonVM.callFrame.symbolsArray[index].node;
    });
    vm.callFrame.symbols.__common = {
      node: moduleObject,
      const: false,
      isGlobal: true,
    };
  } catch (e) {
    console.warn(
      "Warning: File not found: 'common.sp' - common functions have not been imported"
    );
  }

  // Modules
  try {
    const moduleNames = fs.readdirSync(modulesPath);

    const moduleNameMap = {
      io: "Io",
      string: "Str",
      json: "Json",
      websocket: "Websocket",
      server: "Server",
      testing: "Testing",
      core: "Core",
    };

    moduleNames.forEach((moduleName) => {
      const modulePath = path.join(
        modulesPath,
        `${moduleName}/${moduleName}.sp`
      );
      // const modulePath = __dirname + `/modules/${moduleName}/${moduleName}.sp`;
      const module = fs.readFileSync(modulePath);

      const moduleLexer = new Lexer(module.toString(), true);
      moduleLexer.filePath = modulePath;
      moduleLexer.tokenize();

      const moduleParser = new Parser(moduleLexer.nodes, moduleLexer.filePath);
      const moduleParserResult = moduleParser.parse();

      if (moduleParserResult) {
        return;
      }

      const moduleGenerator = new Generator(
        moduleParser.nodes,
        moduleParser.filePath
      );
      const moduleGeneratorResult = moduleGenerator.generate();

      if (moduleParserResult == -1) {
        return;
      }

      const moduleVM = new VM(
        moduleGenerator.generatedNodes,
        moduleParser.filePath
      );

      moduleVM.callFrame.variableMap = moduleGenerator.variableMap;
      moduleVM.callFrame.variables = moduleGenerator.variables;
      moduleVM.callFrame.tempVariables = moduleGenerator.tempVariables;

      Object.keys(vm.callFrame.symbols).forEach((key) => {
        const symbol = vm.callFrame.symbols[key];
        if (symbol.isGlobal) {
          moduleVM.callFrame.symbols[key] = symbol;
        }
      });

      try {
        moduleVM.evaluate();
      } catch (e) {
        console.log(`Error in module: ${moduleName}: ${e.message}`);
      }

      const moduleObject = moduleParser.newNode(NodeTypeEnum.Object, {});
      moduleObject.evaluated = true;
      Object.keys(moduleVM.callFrame.variableMap).forEach((key) => {
        const index = moduleVM.callFrame.variableMap[key];
        const symbol = moduleVM.callFrame.symbolsArray[index];
        moduleObject.value[key] = {
          ...symbol.node,
          meta: { hiddenProp: symbol.isGlobal },
        };
      });
      vm.callFrame.symbols[moduleNameMap[moduleName]] = {
        node: moduleObject,
        const: false,
        isGlobal: true,
      };

      vm.callFrame.symbols.__common.node.value[moduleNameMap[moduleName]] =
        vm.callFrame.symbols[moduleNameMap[moduleName]].node;
    });
  } catch (e) {
    console.warn("Warning: Encountered an error while loading builtin modules");
  }
};

export const injectConfig = (vm: VM, cwd: string) => {
  // Config
  try {
    let config;
    try {
      config = fs.readFileSync("./config.sp").toString();
    } catch (e) {
      config = "";
    }
    const configLexer = new Lexer(config.toString(), true);
    configLexer.tokenize();

    const configParser = new Parser(configLexer.nodes, configLexer.filePath);
    const parserResult = configParser.parse();

    if (parserResult) {
      return;
    }

    const configGenerator = new Generator(
      configParser.nodes,
      configParser.filePath
    );

    const generatorResult = configGenerator.generate();

    if (generatorResult == -1) {
      return;
    }

    const configVM = new VM(
      configGenerator.generatedNodes,
      configParser.filePath
    );

    configVM.callFrame.variables = configGenerator.variables;
    configVM.callFrame.tempVariables = configGenerator.tempVariables;
    configVM.callFrame.variableMap = configGenerator.variableMap;

    configVM.evaluate();

    const globals =
      configVM.callFrame.symbolsArray[configVM.callFrame.variableMap.globals];
    const operators =
      configVM.callFrame.symbolsArray[configVM.callFrame.variableMap.operators];
    const paths =
      configVM.callFrame.symbolsArray[configVM.callFrame.variableMap.paths];
    const node =
      configVM.callFrame.symbolsArray[configVM.callFrame.variableMap.node];

    for (const key of Object.keys(globals?.node?.value ?? {})) {
      vm.callFrame.symbols[key] = {
        node: globals.node.value[key],
        const: true,
        isGlobal: true,
      };
    }

    for (const key of Object.keys(operators?.node?.value ?? {})) {
      const operation = operators.node.value[key];
      if (operation.funcNode.params?.length == 1) {
        vm.operators[`unary${key}`] = operation;
      } else {
        vm.operators[key] = operation;
      }
    }

    for (const key of Object.keys(paths?.node?.value ?? {})) {
      const resolvedPath = path.resolve(paths.node.value[key].value);
      vm.paths[key] = resolvedPath;
    }

    const moduleObject = configParser.newNode(NodeTypeEnum.Object, {});

    moduleObject.evaluated = true;

    Object.entries(configVM.callFrame.variableMap ?? {}).forEach(
      ([name, index]) => {
        const symbol = configVM.callFrame.symbolsArray[index];
        moduleObject.value[name] = symbol.node;
      }
    );

    vm.callFrame.symbols.__config = {
      node: moduleObject,
      const: false,
      isGlobal: true,
    };

    const modulePaths = require("module").globalPaths;

    const localModulesPath = path.join(cwd, "node_modules");
    modulePaths.push(localModulesPath);

    if (process.platform === "win32") {
      // todo: Add global node_modules path for win
    } else {
      modulePaths.push("/usr/local/lib/node_modules");
    }

    const providedPaths =
      node?.node?.value?.["paths"]?.nodes?.map((e) =>
        path.resolve(e?.value ?? "")
      ) ?? [];

    process.env.NODE_PATH = [...modulePaths, ...providedPaths].join(
      path.delimiter
    );

    require("module").Module._initPaths();
  } catch (e) {}
};
