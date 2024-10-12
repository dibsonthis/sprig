import { Lexer } from "./lexer/lexer";
import { Parser } from "./parser/parser";
import { Generator } from "./generator/generator";
import { VM } from "./vm/vm";
import path from "path";
import fs from "fs";
import { NodeTypeEnum } from "./types";

const debug = false;

const filePath = debug ? "testing/tests.sp" : process.argv[2];

if (!filePath) {
  console.error("Sprig expects an entry point filepath - i.e sprig main.sp");
  process.exit(1);
}

const lexer = new Lexer(filePath);
lexer.tokenize();

const parser = new Parser(lexer.nodes, lexer.filePath);
parser.filePath = path.basename(parser.filePath);
parser.parse();

const generator = new Generator(parser.nodes, parser.filePath);
generator.generate();

const vm = new VM(generator.generatedNodes, parser.filePath);
vm.functionName = "main";

const commonPath = debug
  ? path.resolve("common.sp")
  : path.resolve(__dirname + "/common.sp");

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

  commonVM.evaluate();

  Object.keys(commonVM.symbols).forEach((k) => {
    commonVM.symbols[k].isGlobal = true;
  });

  vm.symbols = { ...vm.symbols, ...commonVM.symbols };

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
  const moduleNames = fs.readdirSync(__dirname + "/modules");

  const moduleNameMap = {
    io: "Io",
    string: "Str",
    json: "Json",
    websocket: "Websocket",
    server: "Server",
    testing: "Testing",
  };

  moduleNames.forEach((moduleName) => {
    const modulePath = __dirname + `/modules/${moduleName}/${moduleName}.sp`;
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

    Object.keys(vm.symbols).forEach((key) => {
      const symbol = vm.symbols[key];
      if (symbol.isGlobal) {
        moduleVM.symbols[key] = symbol;
      }
    });

    moduleVM.evaluate();

    const moduleObject = moduleParser.newNode(NodeTypeEnum.Object, {});
    moduleObject.evaluated = true;
    Object.keys(moduleVM.symbols).forEach((key) => {
      moduleObject.value[key] = {
        ...moduleVM.symbols[key].node,
        meta: { hiddenProp: moduleVM.symbols[key].isGlobal },
      };
    });
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
  configVM.evaluate();
  for (const key of Object.keys(configVM.symbols.globals?.node?.value ?? {})) {
    vm.symbols[key] = {
      node: configVM.symbols.globals.node.value[key],
      const: true,
      isGlobal: true,
    };
  }
  for (const key of Object.keys(
    configVM.symbols.operators?.node?.value ?? {}
  )) {
    const operation = configVM.symbols.operators.node.value[key];
    if (operation.funcNode.params?.length == 1) {
      vm.operators[`unary${key}`] = operation;
    } else {
      vm.operators[key] = operation;
    }
  }

  const moduleObject = configParser.newNode(NodeTypeEnum.Object, {});
  moduleObject.evaluated = true;
  Object.keys(configVM.symbols).forEach((key) => {
    moduleObject.value[key] = configVM.symbols[key].node;
  });
  vm.symbols.__config = { node: moduleObject, const: false, isGlobal: true };
} catch (e) {}

vm.evaluate();

// const evaluator = new Evaluator(parser.nodes, parser.filePath);
// process.chdir(path.dirname(filePath));
// evaluator.evaluate();
