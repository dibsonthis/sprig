// export enum NodeTypeEnum {
//   ID = "ID",
//   Number = "Number",
//   Boolean = "Boolean",
//   String = "String",
//   List = "List",
//   Object = "Object",
//   Function = "Function",
//   Operator = "Operator",
//   Paren = "Paren",
//   Decl = "Decl",
//   Block = "Block",
//   FunctionCall = "FunctionCall",
//   Accessor = "Accessor",
//   Modifier = "Modifier",
//   Undefined = "Undefined",
//   Return = "Return",
//   Yield = "Yield",
//   IfStatement = "IfStatement",
//   ForStatement = "ForStatement",
//   WhileStatement = "WhileStatement",
//   LoopStatement = "LoopStatement",
//   Break = "Break",
//   Continue = "Continue",
//   Eval = "Eval",
//   Import = "Import",
//   Library = "Library",
//   Error = "Error",
//   Native = "Native",
//   Raw = "Raw",

//   // Operators
//   Add = "Add",
//   Sub = "Sub",
//   Mul = "Mul",
//   Div = "Div",
//   Pos = "Pos",
//   Neg = "Neg",
//   Percent = "Percent",
//   Exclamation = "Exclamation",
//   Question = "Question",
//   Colon = "Colon",
//   Semicolon = "Semicolon",
//   Caret = "Caret",
//   Ampersand = "Ampersand",
//   Pipe = "Pipe",
//   Equal = "Equal",
//   EqualEqual = "EqualEqual",
//   NotEqual = "NotEqual",
//   LessThan = "LessThan",
//   LessThanOrEqual = "LessThanOrEqual",
//   GreaterThan = "GreaterThan",
//   GreaterThanOrEqual = "GreaterThanOrEqual",
//   Dot = "Dot",
//   DoubleDot = "DoubleDot",
//   TripleDot = "TripleDot",
//   UnaryTripleDot = "UnaryTripleDot",
//   Comma = "Comma",

//   // Generator
//   StartForLoop = "StartForLoop",
//   StartWhileLoop = "StartWhileLoop",
//   DefaultParam = "DefaultParam",
//   NamedArg = "NamedArg",
//   Pop = "Pop",
//   Jump = "Jump",
//   JumpIfTrue = "JumpIfTrue",
//   JumpIfFalse = "JumpIfFalse",
//   JumpIfFalsePop = "JumpIfFalsePop",
//   ListAccess = "ListAccess",
//   ObjectAccess = "ObjectAccess",
//   StringAccess = "StringAccess",
//   ModifyProperty = "ModifyProperty",
//   ToString = "ToString",
//   MethodCall = "MethodCall",
//   ListBegin = "ListBegin",
//   FunctionCallBegin = "FunctionCallBegin",
//   SwapStack = "SwapStack",
//   CatchAllParam = "CatchAllParam",
// }

export enum NodeTypeEnum {
  Any,
  ID,
  Number,
  Boolean,
  String,
  List,
  Object,
  Function,
  Operator,
  Paren,
  Decl,
  Block,
  FunctionCall,
  Accessor,
  Modifier,
  Undefined,
  Return,
  Yield,
  IfStatement,
  ForStatement,
  WhileStatement,
  LoopStatement,
  Break,
  Continue,
  Eval,
  Import,
  Library,
  Error,
  Native,
  Raw,

  // Operators
  Add,
  Sub,
  Mul,
  Div,
  Pos,
  Neg,
  Percent,
  Exclamation,
  Question,
  Colon,
  Semicolon,
  Caret,
  Ampersand,
  Pipe,
  Equal,
  EqualEqual,
  NotEqual,
  LessThan,
  LessThanOrEqual,
  GreaterThan,
  GreaterThanOrEqual,
  Dot,
  DoubleDot,
  TripleDot,
  UnaryTripleDot,
  Comma,

  // Generator
  StartForLoop,
  StartWhileLoop,
  DefaultParam,
  NamedArg,
  Pop,
  Jump,
  JumpIfTrue,
  JumpIfFalse,
  JumpIfFalsePop,
  ListAccess,
  ObjectAccess,
  StringAccess,
  ModifyProperty,
  ToString,
  MethodCall,
  ListBegin,
  FunctionCallBegin,
  SwapStack,
  CatchAllParam,
  LoadTemp,
  Load,
  LoadSymbol,
  Store,
  AddAssign,

  // Typechecking
  TypeList,
  Generic,
}

export const NodeTypes = [
  "ID",
  "Number",
  "Boolean",
  "String",
  "List",
  "Object",
  "Function",
  "Operator",
  "Paren",
  "Decl",
  "Block",
  "FunctionCall",
  "Accessor",
  "Modifier",
  "Undefined",
  "Return",
  "Yield",
  "IfStatement",
  "ForStatement",
  "WhileStatement",
  "LoopStatement",
  "Break",
  "Continue",
  "Eval",
  "Import",
  "Library",
  "Error",
  "Native",
  "Raw",

  // Generator
  "StartForLoop",
  "StartWhileLoop",
  "DefaultParam",
  "NamedArg",
  "Pop",
  "Jump",
  "JumpIfTrue",
  "JumpIfFalse",
  "JumpIfFalsePop",
  "ListAccess",
  "ObjectAccess",
  "StringAccess",
  "ModifyProperty",
  "ToString",
  "MethodCall",
  "ListBegin",
  "FunctionCallBegin",
  "SwapStack",
  "CatchAllParam",
] as const;

export type NodeType = (typeof NodeTypes)[number];

export type NodeArray = {
  id?: string;
  node: Node;
  const: boolean;
  canChange?: boolean;
  isGlobal?: boolean;
  isClosure?: boolean;
}[];

export type CallFrame = {
  name?: string;
  class?: Node;
  filePath: string;
  parentFrame?: CallFrame;
  capturedIds?: Set<string>;
  stack: Node[];
  instructions: Node[];
  instruction: Node;
  index: number;
  symbols: SymbolTable;
  symbolsArray: NodeArray;
  tempVarsArray: NodeArray;
  variables: { id: string; type: string }[];
  tempVariables: { id: string; type: string }[];
  variableMap: Record<string, number>;
  tempVars: SymbolTable;
  coroutine?: Node;
};

export type SymbolTable = Record<
  string,
  {
    node: Node;
    const: boolean;
    canChange?: boolean;
    isGlobal?: boolean;
    isClosure?: boolean;
  }
>;

type DeclNode = {
  id?: Node;
  value?: Node;
  isClass?: boolean;
  variableIndex?: number;
  variableIndices?: number[];
};

export type FuncNode = {
  name?: string;
  params: Node[];
  body: Node;
  paramTypes?: Node[];
  paramReqs?: boolean[];
  paramNames?: string[];
  calculatedReturnType?: Node;
  typeDef?: Node;
  closures?: SymbolTable;
  defaults?: {};
  originFilePath?: string;
  isCoroutine?: boolean;
  coroutineIndex?: number;
  symbolsArray?: {
    node: Node;
    const: boolean;
    canChange?: boolean;
    isGlobal?: boolean;
    isClosure?: boolean;
  }[];
  variableMap?: Record<string, number>;
  meta?: {};
};

export type NativeNode = {
  name?: string;
  function: Function;
  builtin?: boolean;
};

export type LibNode = {
  exports: Record<string, any>;
};

export type ForLoopStartNode = {
  count: number;
  endIndex: number;
  arr?: Node[];
  valueName?: string;
  indexName?: string;
  valueIndex?: number;
  indexIndex?: number;
};

export type Node = {
  type: NodeTypeEnum;
  left?: Node;
  right?: Node;
  node?: Node;
  nodes?: Node[];
  value?: any;
  line: number;
  col: number;
  declNode?: DeclNode;
  funcNode?: FuncNode;
  nativeNode?: NativeNode;
  libNode?: LibNode;
  forLoopStartNode?: ForLoopStartNode;
  schema?: Node;
  handler?: Node;
  class?: Node;
  index?: number;
  meta?: {
    readonly?: boolean;
    stringType?: "double" | "single" | "special";
    unary?: boolean;
    runtimeChecks?: any[];
    capturedIds?: Set<string>;
    swapTos?: boolean;
    hiddenProp?: boolean;
    typeAlias?: string;
    name?: string;
  };
  evaluated?: boolean;
  isType?: boolean;
  isGeneric?: boolean;
  concreteType?: Node;
};

export type NodePayload = {
  left?: Node;
  right: Node;
  token?: string;
  col: number;
  line: number;
};
