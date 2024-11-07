import { Lexer } from "./lexer/lexer";
import { Parser } from "./parser/parser";
import { Generator } from "./generator/generator";
import { VM } from "./vm/vm";
import path from "path";
import fs from "fs";
import { NodeTypeEnum } from "./types";
import { injectCommonAndModules } from "./utils/utils";

const debug = false;

const filePath = debug ? "testing/tests.sp" : process.argv[2];

const isSource = process.argv.includes("--eval") || process.argv.includes("-e");

if (!filePath) {
  console.error("Sprig expects an entry point filepath - i.e sprig main.sp");
  process.exit(1);
}

const lexer = new Lexer(filePath, isSource);
lexer.tokenize();

const parser = new Parser(lexer.nodes, lexer.filePath);
parser.filePath = path.basename(parser.filePath);
parser.parse();

const generator = new Generator(parser.nodes, parser.filePath);
generator.generate();

const vm = new VM(generator.generatedNodes, parser.filePath);
vm.callFrame.variables = generator.variables;
vm.callFrame.tempVariables = generator.tempVariables;
vm.callFrame.variableMap = generator.variableMap;
vm.callFrame.name = "main";

const commonPath = debug
  ? path.resolve("common.sp")
  : path.join(__dirname, "common.sp");

const modulesPath = path.join(__dirname, "modules");

injectCommonAndModules(vm, commonPath, modulesPath);

process.chdir(path.dirname(filePath));

// Config
try {
  const config = fs.readFileSync("./config.sp");
  const configLexer = new Lexer(config.toString(), true);
  configLexer.tokenize();

  const configParser = new Parser(configLexer.nodes, configLexer.filePath);
  configParser.parse();

  const configGenerator = new Generator(
    configParser.nodes,
    configParser.filePath
  );

  configGenerator.generate();

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
  Object.entries(configVM.callFrame.variableMap).forEach(([name, index]) => {
    const symbol = configVM.callFrame.symbolsArray[index];
    moduleObject.value[name] = symbol.node;
  });
  vm.callFrame.symbols.__config = {
    node: moduleObject,
    const: false,
    isGlobal: true,
  };
} catch (e) {}

vm.evaluate();
