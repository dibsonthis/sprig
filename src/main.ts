import { Lexer } from "./lexer/lexer";
import { Parser } from "./parser/parser";
import { Generator } from "./generator/generator";
import { VM } from "./vm/vm";
import path from "path";
import fs from "fs";
import { NodeTypeEnum } from "./types";
import { injectCommonAndModules } from "./utils/utils";

const debug = true;

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
vm.variables = generator.variables;
vm.tempVariables = generator.tempVariables;
vm.variableMap = generator.variableMap;
vm.functionName = "main";

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

  configVM.variables = configGenerator.variables;
  configVM.tempVariables = configGenerator.tempVariables;
  configVM.variableMap = configGenerator.variableMap;

  configVM.evaluate();

  const globals = configVM.symbolsArray[configVM.variableMap.globals];
  const operators = configVM.symbolsArray[configVM.variableMap.operators];

  for (const key of Object.keys(globals?.node?.value ?? {})) {
    vm.symbols[key] = {
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

  const moduleObject = configParser.newNode(NodeTypeEnum.Object, {});
  moduleObject.evaluated = true;
  Object.entries(configVM.variableMap).forEach(([name, index]) => {
    const symbol = configVM.symbolsArray[index];
    moduleObject.value[name] = symbol.node;
  });
  vm.symbols.__config = { node: moduleObject, const: false, isGlobal: true };
} catch (e) {
  console.log(e);
}

vm.evaluate();
