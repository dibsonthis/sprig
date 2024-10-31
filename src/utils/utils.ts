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
    commonParser.parse();

    const commonGenerator = new Generator(
      commonParser.nodes,
      commonParser.filePath
    );

    commonGenerator.generate();

    const commonVM = new VM(
      commonGenerator.generatedNodes,
      commonParser.filePath
    );

    commonVM.variableMap = commonGenerator.variableMap;
    commonVM.variables = commonGenerator.variables;
    commonVM.tempVariables = commonGenerator.tempVariables;

    commonVM.evaluate();

    Object.keys(commonVM.variableMap).forEach((k) => {
      const index = commonVM.variableMap[k];
      const symbol = commonVM.symbolsArray[index];
      symbol.isGlobal = true;
      vm.symbols[k] = symbol;
    });

    const moduleObject = commonParser.newNode(NodeTypeEnum.Object, {});
    moduleObject.evaluated = true;
    Object.keys(commonVM.symbols).forEach((key) => {
      moduleObject.value[key] = commonVM.symbols[key].node;
    });
    vm.symbols.__common = { node: moduleObject, const: false, isGlobal: true };
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
      moduleParser.parse();

      const moduleGenerator = new Generator(
        moduleParser.nodes,
        moduleParser.filePath
      );
      moduleGenerator.generate();

      const moduleVM = new VM(
        moduleGenerator.generatedNodes,
        moduleParser.filePath
      );

      moduleVM.variableMap = moduleGenerator.variableMap;
      moduleVM.variables = moduleGenerator.variables;
      moduleVM.tempVariables = moduleGenerator.tempVariables;

      Object.keys(vm.symbols).forEach((key) => {
        const symbol = vm.symbols[key];
        if (symbol.isGlobal) {
          moduleVM.symbols[key] = symbol;
        }
      });

      try {
        moduleVM.evaluate();
      } catch (e) {
        console.log(`Error in module: ${moduleName}: ${e.message}`);
      }

      const moduleObject = moduleParser.newNode(NodeTypeEnum.Object, {});
      moduleObject.evaluated = true;
      Object.keys(moduleVM.variableMap).forEach((key) => {
        const index = moduleVM.variableMap[key];
        const symbol = moduleVM.symbolsArray[index];
        moduleObject.value[key] = {
          ...symbol.node,
          meta: { hiddenProp: symbol.isGlobal },
        };
      });
      // Object.keys(moduleVM.symbols).forEach((key) => {
      //   moduleObject.value[key] = {
      //     ...moduleVM.symbols[key].node,
      //     meta: { hiddenProp: moduleVM.symbols[key].isGlobal },
      //   };
      // });
      vm.symbols[moduleNameMap[moduleName]] = {
        node: moduleObject,
        const: false,
        isGlobal: true,
      };

      vm.symbols.__common.node.value[moduleNameMap[moduleName]] =
        vm.symbols[moduleNameMap[moduleName]].node;
    });
  } catch (e) {
    console.warn("Warning: Encountered an error while loading builtin modules");
  }
};
