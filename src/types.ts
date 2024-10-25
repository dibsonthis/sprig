export enum NodeTypeEnum {
  ID = "ID",
  Number = "Number",
  Boolean = "Boolean",
  String = "String",
  List = "List",
  Object = "Object",
  Function = "Function",
  Operator = "Operator",
  Paren = "Paren",
  Decl = "Decl",
  Block = "Block",
  FunctionCall = "FunctionCall",
  Accessor = "Accessor",
  Modifier = "Modifier",
  Undefined = "Undefined",
  Return = "Return",
  Yield = "Yield",
  IfStatement = "IfStatement",
  ForStatement = "ForStatement",
  WhileStatement = "WhileStatement",
  LoopStatement = "LoopStatement",
  Break = "Break",
  Continue = "Continue",
  Eval = "Eval",
  Import = "Import",
  Library = "Library",
  Error = "Error",
  Native = "Native",
  Raw = "Raw",

  // Generator
  StartForLoop = "StartForLoop",
  StartWhileLoop = "StartWhileLoop",
  DefaultParam = "DefaultParam",
  NamedArg = "NamedArg",
  Pop = "Pop",
  Jump = "Jump",
  JumpIfTrue = "JumpIfTrue",
  JumpIfFalse = "JumpIfFalse",
  JumpIfFalsePop = "JumpIfFalsePop",
  ListAccess = "ListAccess",
  ObjectAccess = "ObjectAccess",
  StringAccess = "StringAccess",
  ModifyProperty = "ModifyProperty",
  ToString = "ToString",
  MethodCall = "MethodCall",
  ListBegin = "ListBegin",
  FunctionCallBegin = "FunctionCallBegin",
  SwapStack = "SwapStack",
  CatchAllParam = "CatchAllParam",
}

// export enum NodeTypeEnum {
//   ID,
//   Number,
//   Boolean,
//   String,
//   List,
//   Object,
//   Function,
//   Operator,
//   Paren,
//   Decl,
//   Block,
//   FunctionCall,
//   Accessor,
//   Modifier,
//   Undefined,
//   Return,
//   Yield,
//   IfStatement,
//   ForStatement,
//   WhileStatement,
//   LoopStatement,
//   Break,
//   Continue,
//   Eval,
//   Import,
//   Library,
//   Error,
//   Native,
//   Raw,

//   // Generator
//   StartForLoop,
//   StartWhileLoop,
//   DefaultParam,
//   NamedArg,
//   Pop,
//   Jump,
//   JumpIfTrue,
//   JumpIfFalse,
//   JumpIfFalsePop,
//   ListAccess,
//   ObjectAccess,
//   StringAccess,
//   ModifyProperty,
//   ToString,
//   MethodCall,
//   ListBegin,
//   FunctionCallBegin,
//   SwapStack,
//   CatchAllParam,
// }

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
};

export type FuncNode = {
  name?: string;
  params: Node[];
  body: Node;
  closures?: SymbolTable;
  defaults?: {};
  originFilePath?: string;
  isCoroutine?: boolean;
  coroutineIndex?: number;
  coroutineSymbols?: SymbolTable;
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
};

export type Node = {
  // type: NodeType;
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
  meta?: {
    readonly?: boolean;
    stringType?: "double" | "single" | "special";
    unary?: boolean;
    runtimeChecks?: any[];
    capturedIds?: string[];
    swapTos?: boolean;
    hiddenProp?: boolean;
  };
  evaluated?: boolean;
};

export type NodePayload = {
  left?: Node;
  right: Node;
  token?: string;
  col: number;
  line: number;
};
