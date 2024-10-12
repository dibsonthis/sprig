import { Node, NodeTypeEnum, NodeTypes } from "../types";
import fs from "fs";
import path from "path";

export class Lexer {
  private source: string = "";
  private char: string;
  private index: number = 0;
  private line: number = 1;
  private col: number = 1;

  private bracketTokens = ["(", ")", "[", "]", "{", "}"];

  private singleOperators = [
    ...this.bracketTokens,
    "+",
    "-",
    "*",
    "/",
    ".",
    "<",
    ">",
    "!",
    "=",
    "^",
    "%",
  ];
  private doubleOperators = [
    "||",
    "&&",
    "!=",
    "==",
    "<=",
    ">=",
    "=>",
    "+=",
    "-=",
    "*=",
    "/=",
    "->",
  ];
  private multiOperators = ["...", ".."];

  public filePath: string;
  public nodes: Node[] = [];

  private errorAndExit(message: string) {
    console.error(
      "\x1b[31m%s\x1b[0m",
      `Error at (${this.line}:${this.col}) in '${path.resolve(
        this.filePath
      )}': ${message}`
    );
    process.exit();
  }

  constructor(filePath: string, isSource = false) {
    if (isSource) {
      this.source = filePath;
      this.filePath = "<eval>";
    } else {
      this.filePath = filePath;
      try {
        this.source = fs.readFileSync(this.filePath).toString();
      } catch (e) {
        this.errorAndExit(e as string);
      }
    }
    this.char = this.source[this.index];
    if (this.char === "\n") {
      this.line += 1;
      this.col = 0;
    }
  }

  public advance() {
    this.index += 1;
    this.char = this.source[this.index];
    this.col += 1;
    if (this.char === "\n") {
      this.line += 1;
      this.col = 0;
    }
  }

  private buildID() {
    const node: Node = {
      type: NodeTypeEnum.ID,
      value: this.char,
      line: this.line,
      col: this.col,
    };

    this.advance();

    while (this.char && this.char.match(/^[0-9a-zA-Z_]+$/)) {
      node.value += this.char;
      this.advance();
    }

    if (node.value === "true" || node.value === "false") {
      node.type = NodeTypeEnum.Boolean;
      node.value = node.value === "true";
    }

    if (node.value === "undefined") {
      node.type = NodeTypeEnum.Undefined;
      node.value = undefined;
    }

    if (node.value === "return") {
      node.type = NodeTypeEnum.Return;
    }

    if (node.value === "yield") {
      node.type = NodeTypeEnum.Yield;
    }

    if (node.value === "else") {
      node.type = NodeTypeEnum.Operator;
    }

    if (node.value === "break") {
      node.type = NodeTypeEnum.Break;
    }

    if (node.value === "continue") {
      node.type = NodeTypeEnum.Continue;
    }

    if (node.value === "import") {
      node.type = NodeTypeEnum.Import;
    }

    if (NodeTypes.includes(node.value)) {
      node.type = NodeTypeEnum.String;
    }

    this.nodes.push(node);
  }

  private buildNumber() {
    const node: Node = {
      type: NodeTypeEnum.Number,
      value: this.char,
      line: this.line,
      col: this.col,
    };

    this.advance();

    let numDots = 0;

    while (this.char && this.char.match(/[0-9._]/)) {
      if (this.char === ".") {
        numDots += 1;
        if (this.source[this.index + 1] === ".") {
          node.value = +node.value;
          this.nodes.push(node);
          return;
        }
      }
      node.value += this.char;
      this.advance();
    }

    // TODO: error
    if (numDots > 1) {
      return;
    }

    node.value = +node.value;

    this.nodes.push(node);
  }

  private buildString(endToken: string = '"') {
    const node: Node = {
      type: NodeTypeEnum.String,
      value: "",
      line: this.line,
      col: this.col,
    };

    switch (endToken) {
      case '"': {
        node.meta = { stringType: "double" };
        break;
      }
      case "'": {
        node.meta = { stringType: "single" };
        break;
      }
      case "`": {
        node.meta = { stringType: "special" };
        break;
      }
    }

    this.advance();

    while (this.char && this.char !== endToken) {
      if (this.char == "\\" && this.source[this.index + 1] == "n") {
        node.value += "\n";
        this.advance();
      } else if (this.char == "\\" && this.source[this.index + 1] == "t") {
        node.value += "\t";
        this.advance();
      } else if (this.char == "\\" && this.source[this.index + 1] == "r") {
        node.value += "\r";
        this.advance();
      } else if (this.char == "\\" && this.source[this.index + 1] == "b") {
        node.value += "\b";
        this.advance();
      } else if (this.char == "\\" && this.source[this.index + 1] == "a") {
        node.value += "\x07";
        this.advance();
      } else if (this.char == "\\" && this.source[this.index + 1] == '"') {
        node.value += "\x22";
        this.advance();
      } else if (this.char == "\\" && this.source[this.index + 1] == "'") {
        node.value += "\x27";
        this.advance();
      } else if (this.char == "\\" && this.source[this.index + 1] == "\\") {
        node.value += "\\";
        this.advance();
      } else if (
        this.char == "\\" &&
        this.source[this.index + 1] == "u" &&
        this.source[this.index + 2].match(/[0-9A-Fa-f]/g) &&
        this.source[this.index + 3].match(/[0-9A-Fa-f]/g) &&
        this.source[this.index + 4].match(/[0-9A-Fa-f]/g) &&
        this.source[this.index + 5].match(/[0-9A-Fa-f]/g) &&
        this.source[this.index + 5].match(/[0-9A-Fa-f]/g)
      ) {
        const unicode = String.fromCodePoint(
          parseInt(
            this.source[this.index + 2] +
              this.source[this.index + 3] +
              this.source[this.index + 4] +
              this.source[this.index + 5] +
              this.source[this.index + 6],
            16
          )
        );
        node.value += unicode;
        this.advance();
        this.advance();
        this.advance();
        this.advance();
        this.advance();
        this.advance();
      } else if (this.char == "\\" && this.source[this.index + 1] == "e") {
        node.value += "\x1b";
        this.advance();
      } else {
        node.value += this.char;
      }
      this.advance();
    }
    this.advance();

    if (node.meta?.stringType === "special") {
      const parentStart: Node = {
        type: NodeTypeEnum.Operator,
        value: "(",
        line: this.line,
        col: this.col,
      };
      this.nodes.push(parentStart);
      const splitStr: string[] = node.value.split(/({{.*?}})/);
      splitStr.forEach((e, i) => {
        if (e.match(/({{.*?}})/)) {
          const evalNode: Node = {
            type: NodeTypeEnum.Eval,
            value: e.replace(/{{|}}/g, ""),
            line: this.line,
            col: this.col,
          };
          this.nodes.push(evalNode);
        } else {
          const stringNode: Node = {
            type: NodeTypeEnum.String,
            value: e,
            line: this.line,
            col: this.col,
          };
          this.nodes.push(stringNode);
        }
        if (i < splitStr.length - 1) {
          const plusNode: Node = {
            type: NodeTypeEnum.Operator,
            value: "+",
            line: this.line,
            col: this.col,
          };
          this.nodes.push(plusNode);
        }
      });
      const parenEnd: Node = {
        type: NodeTypeEnum.Operator,
        value: ")",
        line: this.line,
        col: this.col,
      };
      this.nodes.push(parenEnd);
    } else {
      this.nodes.push(node);
    }
  }

  private buildOperator() {
    const node: Node = {
      type: NodeTypeEnum.Operator,
      value: this.char,
      line: this.line,
      col: this.col,
    };

    this.advance();

    while (this.char && this.char.match(/[^^a-zA-Z0-9\s()[\]{}\s"\'`]/g)) {
      node.value += this.char;
      this.advance();
    }

    const lastNode = this.nodes.at(-1);

    if (
      lastNode?.type === NodeTypeEnum.Modifier ||
      (lastNode?.type === NodeTypeEnum.Operator &&
        ![")", "]", "}"].includes(lastNode.value)) ||
      this.nodes.length === 0
    ) {
      node.meta = {
        unary: true,
      };
    }

    this.nodes.push(node);
  }

  private singleComment() {
    while (this.char && this.char !== "\n") {
      this.advance();
    }

    this.advance();
  }

  private multiComment() {
    while (true) {
      if (this.char === "*" && this.source[this.index + 1] === "/") {
        break;
      }
      this.advance();

      if (this.char === "/" && this.source[this.index + 1] === "*") {
        this.multiComment();
      }
    }

    this.advance();
    this.advance();
  }

  private buildSingleOperator() {
    const node: Node = {
      type: NodeTypeEnum.Operator,
      value: this.char,
      line: this.line,
      col: this.col,
    };

    this.advance();

    const lastNode = this.nodes.at(-1);

    if (
      lastNode?.type === NodeTypeEnum.Modifier ||
      (lastNode?.type === NodeTypeEnum.Operator &&
        ![")", "]", "}"].includes(lastNode.value)) ||
      this.nodes.length === 0
    ) {
      node.meta = {
        unary: !this.bracketTokens.includes(node.value),
      };
    }

    this.nodes.push(node);
  }

  public tokenize() {
    // const configOperationKeys = Object.keys(config.operators);
    // const configModifierKeys = Object.keys(config.modifiers).map(
    //   (key) => `mod_${key}`
    // );
    while (this.char) {
      if (this.doubleOperators.map((op) => op[0]).includes(this.char)) {
        for (let i = 0; i < this.doubleOperators.length; i++) {
          const op = this.doubleOperators[i];
          const nextChar = this.source[this.index + 1];
          if (this.char === op[0] && nextChar === op[1]) {
            const node: Node = {
              type: NodeTypeEnum.Operator,
              value: this.char + nextChar,
              line: this.line,
              col: this.col,
            };

            this.nodes.push(node);
            this.advance();
            this.advance();
            break;
          }
        }
      }
      // for (let key of [...configOperationKeys, ...configModifierKeys]) {
      //   const isModifier = key.substring(0, 4) === "mod_";
      //   isModifier && (key = key.substring(4));
      //   if (this.char === key[0]) {
      //     const substr = this.source.substring(
      //       this.index,
      //       this.index + key.length
      //     );
      //     if (substr === key) {
      //       const node: Node = {
      //         type: isModifier ? NodeTypeEnum.Modifier : NodeTypeEnum.Operator,
      //         value: key,
      //         line: this.line,
      //         col: this.col,
      //       };

      //       const lastNode = this.nodes.at(-1);

      //       if (
      //         lastNode?.type === NodeTypeEnum.Modifier ||
      //         (lastNode?.type === NodeTypeEnum.Operator &&
      //           ![")", "]", "}"].includes(lastNode.value)) ||
      //         this.nodes.length === 0
      //       ) {
      //         node.meta = {
      //           unary: true,
      //         };
      //       }

      //       this.nodes.push(node);
      //       for (let i = 0; i < key.length; i++) {
      //         this.advance();
      //       }
      //       break;
      //     }
      //   }
      // }
      for (let key of this.multiOperators) {
        const isModifier = key.substring(0, 4) === "mod_";
        isModifier && (key = key.substring(4));
        if (this.char === key[0]) {
          const substr = this.source.substring(
            this.index,
            this.index + key.length
          );
          if (substr === key) {
            const node: Node = {
              type: isModifier ? NodeTypeEnum.Modifier : NodeTypeEnum.Operator,
              value: key,
              line: this.line,
              col: this.col,
            };

            const lastNode = this.nodes.at(-1);

            if (
              lastNode?.type === NodeTypeEnum.Modifier ||
              (lastNode?.type === NodeTypeEnum.Operator &&
                ![")", "]", "}"].includes(lastNode.value)) ||
              this.nodes.length === 0
            ) {
              node.meta = {
                unary: true,
              };
            }

            this.nodes.push(node);
            for (let i = 0; i < key.length; i++) {
              this.advance();
            }
            break;
          }
        }
      }
      if (this.char.match(/^[a-zA-Z_]+$/)) {
        this.buildID();
        continue;
      }
      if (this.char.match(/[0-9]/)) {
        this.buildNumber();
        continue;
      }
      if (this.char === '"') {
        this.buildString();
        continue;
      }
      if (this.char === "'") {
        this.buildString("'");
        continue;
      }
      if (this.char === "`") {
        this.buildString("`");
        continue;
      }
      if (this.char === "/" && this.source[this.index + 1] === "/") {
        this.singleComment();
        continue;
      }
      if (this.char === "/" && this.source[this.index + 1] === "*") {
        this.multiComment();
        continue;
      }
      if (this.singleOperators.includes(this.char)) {
        this.buildSingleOperator();
        continue;
      }
      if (this.char.match(/[^a-zA-Z0-9\s]/g)) {
        this.buildOperator();
        continue;
      }
      this.advance();
    }
  }
}
