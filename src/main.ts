import { Lexer } from "./lexer/lexer";
import { Parser } from "./parser/parser";
import { Generator } from "./generator/generator";
import { VM } from "./vm/vm";
import path from "path";
import { injectCommonAndModules, injectConfig } from "./utils/utils";

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
var parserResult = parser.parse();

if (!parserResult) {
  const generator = new Generator(parser.nodes, parser.filePath);
  const generatorResult = generator.generate();

  if (generatorResult !== -1) {
    const vm = new VM(generator.generatedNodes, parser.filePath);
    vm.callFrame.variables = generator.variables;
    vm.callFrame.tempVariables = generator.tempVariables;
    vm.callFrame.variableMap = generator.variableMap;
    vm.callFrame.name = "main";

    const commonPath = debug
      ? path.resolve("common.sp")
      : path.join(__dirname, "common.sp");

    const modulesPath = path.join(__dirname, "modules");

    // Common + Modules
    // injectCommonAndModules(vm, commonPath, modulesPath);

    process.chdir(path.dirname(filePath));

    // Config
    // injectConfig(vm, process.cwd());

    vm.evaluate();
  }
}
