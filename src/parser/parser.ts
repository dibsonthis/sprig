import { Node, NodeTypeEnum } from "../types";
import path from "path";

export class Parser {
  private node: Node;
  private index: number = 0;

  public nodes: Node[];
  public filePath: string;

  constructor(nodes: Node[], filePath: string = ".") {
    this.nodes = nodes;
    this.node = this.nodes[0];
    this.filePath = filePath;
  }

  public newNode(type: NodeTypeEnum, value?): Node {
    return {
      col: this.node?.col ?? 0,
      line: this.node?.line ?? 0,
      type,
      value,
    };
  }

  private errorAndExit(message: string, node?: Node) {
    const errorNode = node ? node : this.node;
    console.error(
      "\x1b[31m%s\x1b[0m",
      `Error at (${errorNode.line}:${errorNode.col}) in '${path.resolve(
        this.filePath
      )}': ${message}`
    );
  }

  private reset(index: number = 0) {
    this.index = index;
    this.node = this.nodes[index];
  }

  public advance() {
    this.index += 1;
    this.node = this.nodes[this.index];
  }

  public back() {
    this.index -= 1;
    this.node = this.nodes[this.index];
  }

  private nextNode() {
    return this.nodes[this.index + 1];
  }

  private previousNode() {
    return this.nodes[this.index - 1];
  }

  private removeNext() {
    this.nodes.splice(this.index + 1, 1);
  }

  private removeCurrent() {
    this.nodes.splice(this.index, 1);
    this.node = this.nodes[this.index];
  }

  private removePrevious() {
    this.nodes.splice(this.index - 1, 1);
    this.index -= 1;
    this.node = this.nodes[this.index];
  }

  private consumeRight() {
    while (true) {
      const nextNode = this.nextNode();
      if (!nextNode) {
        break;
      }
      if (nextNode.meta?.unary && !nextNode.right) {
        this.advance();
        this.consumeRight();
      } else {
        this.node.right = nextNode;
        this.removeNext();
        this.back();
        break;
      }
    }
  }

  private parseUnaryOperators(endToken?: string, omit?: string[]) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }
      if (
        this.node.type === NodeTypeEnum.Operator &&
        this.node.meta?.unary &&
        !this.node.right
      ) {
        // tokens to omit from general operation parsing
        if (!omit?.includes(this.node.value)) {
          this.node.value = "unary" + this.node.value;
          this.consumeRight();
        }
      }

      this.advance();
    }
  }

  private parseUnaryOperator(op: string, endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }
      if (
        this.node.type === NodeTypeEnum.Operator &&
        this.node.meta?.unary &&
        this.node.value === op &&
        !this.node.right
      ) {
        this.node.value = "unary" + this.node.value;
        this.consumeRight();
      }

      this.advance();
    }
  }

  private parseModifier(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }
      if (
        this.node.type === NodeTypeEnum.Modifier &&
        this.node.meta?.unary &&
        !this.node.right
      ) {
        this.consumeRight();
      }

      this.advance();
    }
  }

  private parseReturn(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }
      if (this.node.type === NodeTypeEnum.Return && !this.node.right) {
        const nextNode = this.nextNode();
        if (
          nextNode.type === NodeTypeEnum.Operator &&
          (nextNode.value === "}" ||
            nextNode.value === ")" ||
            nextNode.value === "]" ||
            nextNode.value === ";")
        ) {
          this.node.right = this.newNode(NodeTypeEnum.Undefined);
        } else {
          this.consumeRight();
        }
      }

      this.advance();
    }
  }

  private parseYield(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }
      if (this.node.type === NodeTypeEnum.Yield && !this.node.right) {
        this.consumeRight();
      }

      this.advance();
    }
  }

  private parseImport(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }
      if (this.node.type === NodeTypeEnum.Import && !this.node.right) {
        this.node.right = this.nextNode();
        this.removeNext();
      }

      this.advance();
    }
  }

  private parseOperator(op?: string, endToken?: string, omit?: string[]) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }
      if (this.node.type === NodeTypeEnum.Operator && this.node.value === ";") {
        this.removeCurrent();
        continue;
      }
      if (this.node.meta?.unary) {
        this.advance();
        continue;
      }
      const shouldParse =
        (op ? this.node.value === op : true) &&
        !(this.node.left || this.node.right);

      // tokens to omit from general operation parsing
      if (!op && omit?.includes(this.node.value)) {
        this.advance();
        continue;
      }

      if (this.node.type === NodeTypeEnum.Operator && shouldParse) {
        if (op === "=>") {
          this.node.type = NodeTypeEnum.Function;
        }

        this.node.left = this.nodes[this.index - 1];
        const nextNode = this.nextNode();

        if (this.node.value === "::") {
          nextNode.isType = true;
        }

        if (
          op === "=" &&
          nextNode.type === NodeTypeEnum.Function &&
          this.node.left?.type === NodeTypeEnum.ID
        ) {
          nextNode.meta = {
            name: this.node?.left?.value,
          };
        }

        if (
          !(
            this.node.value === "," &&
            nextNode.type === NodeTypeEnum.Operator &&
            ["]", "}", ")"].includes(nextNode.value)
          )
        ) {
          this.node.right = this.nodes[this.index + 1];
          if (
            this.node.type === NodeTypeEnum.Function &&
            this.node.right.type === NodeTypeEnum.Object
          ) {
            this.node.right = this.newNode(NodeTypeEnum.Undefined);
          }
          this.nodes.splice(this.index + 1, 1);
        }

        this.nodes.splice(this.index - 1, 1);
        this.index -= 1;
      }

      this.advance();
    }
  }

  private parseParen() {
    while (this.node) {
      if (this.node.type === NodeTypeEnum.Operator && this.node.value === "(") {
        this.node.type = NodeTypeEnum.Paren;
        this.node.value = undefined;
        const parenIndex = this.index;
        this.advance();
        if (
          this.nodes[this.index].type === NodeTypeEnum.Operator &&
          this.node.value === ")"
        ) {
          this.removeCurrent();
          continue;
        }
        this.parse(")", this.index);
        this.removeNext();
        this.index = parenIndex;
        this.node = this.nodes[this.index];
        this.node.node = this.nextNode();
        this.removeNext();
      }
      this.advance();
    }
  }

  private parseList() {
    while (this.node) {
      if (this.node.type === NodeTypeEnum.Operator && this.node.value === "[") {
        this.node.type = NodeTypeEnum.List;
        this.node.value = undefined;
        const parenIndex = this.index;
        this.advance();
        if (
          this.nodes[this.index].type === NodeTypeEnum.Operator &&
          this.node.value === "]"
        ) {
          this.removeCurrent();
          continue;
        }
        this.parse("]", this.index);
        this.removeNext();
        this.index = parenIndex;
        this.node = this.nodes[this.index];
        this.node.node = this.nextNode();
        this.removeNext();
      }
      this.advance();
    }
  }

  private parseObject() {
    while (this.node) {
      if (this.node.type === NodeTypeEnum.Operator && this.node.value === "{") {
        const previousNode = this.previousNode();
        this.node.type = NodeTypeEnum.Object;
        this.node.value = {};

        const parenIndex = this.index;
        this.advance();
        if (
          this.nodes[this.index].type === NodeTypeEnum.Operator &&
          this.node.value === "}"
        ) {
          this.removeCurrent();
          continue;
        }
        this.parse("}", this.index);
        this.index = parenIndex;
        this.node = this.nodes[this.index];

        this.advance();
        this.nodes[parenIndex].nodes = [];
        this.nodes[parenIndex].meta = {
          capturedIds: new Set<string>(),
        };
        while (true) {
          if (
            this.node.type === NodeTypeEnum.Operator &&
            this.node.value === "}"
          ) {
            this.removeCurrent();
            break;
          }

          this.nodes[parenIndex].nodes.push(this.node);
          this.removeCurrent();
        }

        const bodyNode = this.nodes[parenIndex].nodes[0];
        this.nodes[parenIndex].node = bodyNode;

        if (
          !(
            (bodyNode &&
              bodyNode.type === NodeTypeEnum.Operator &&
              (bodyNode.value === "," || bodyNode.value === ":")) ||
            (previousNode?.type === NodeTypeEnum.Operator &&
              previousNode?.value === "=")
          )
        ) {
          if (bodyNode.type !== NodeTypeEnum.ID) {
            // If a single ID exists as the body, it's an object
            this.nodes[parenIndex].type = NodeTypeEnum.Block;
            this.nodes[parenIndex].node = undefined;
          }
        }
      }
      this.advance();
    }
  }

  private parseIfStatement(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }

      if (
        this.node.type === NodeTypeEnum.FunctionCall &&
        this.node.left?.value === "if"
      ) {
        const nextNode = this.nextNode();
        if (
          nextNode.type !== NodeTypeEnum.Block &&
          nextNode.type !== NodeTypeEnum.Object &&
          !nextNode.node
        ) {
          this.advance();
          continue;
        }

        this.node.type = NodeTypeEnum.IfStatement;
        this.node.left = this.node.right;
        this.node.right = nextNode;
        this.removeNext();
      }

      this.advance();
    }
  }

  private parseForStatement(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }

      if (
        this.node.type === NodeTypeEnum.FunctionCall &&
        this.node.left?.value === "for"
      ) {
        const nextNode = this.nextNode();
        if (
          nextNode.type !== NodeTypeEnum.Block &&
          nextNode.type !== NodeTypeEnum.Object &&
          !nextNode.node
        ) {
          this.advance();
          continue;
        }

        this.node.type = NodeTypeEnum.ForStatement;
        this.node.left = this.node.right;
        this.node.right = nextNode;
        this.removeNext();
      }

      this.advance();
    }
  }

  private parseWhileStatement(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }

      if (
        this.node.type === NodeTypeEnum.FunctionCall &&
        this.node.left?.value === "while"
      ) {
        const nextNode = this.nextNode();
        if (
          nextNode.type !== NodeTypeEnum.Block &&
          nextNode.type !== NodeTypeEnum.Object &&
          !nextNode.node
        ) {
          this.advance();
          continue;
        }

        this.node.type = NodeTypeEnum.WhileStatement;
        this.node.left = this.node.right;
        this.node.right = nextNode;
        this.removeNext();
      }

      this.advance();
    }
  }

  private parseLoopStatement(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }

      if (
        this.node.type === NodeTypeEnum.FunctionCall &&
        this.node.left?.value === "loop"
      ) {
        const nextNode = this.nextNode();
        if (
          nextNode.type !== NodeTypeEnum.Block &&
          nextNode.type !== NodeTypeEnum.Object &&
          !nextNode.node
        ) {
          this.advance();
          continue;
        }

        this.node.type = NodeTypeEnum.LoopStatement;
        this.node.left = this.node.right;
        this.node.right = nextNode;
        this.removeNext();
      }

      this.advance();
    }
  }

  private parseDeclaration(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }
      if (this.node.type === NodeTypeEnum.ID && this.node.value === "const") {
        this.node.type = NodeTypeEnum.Decl;
        const nextNode = this.nextNode();
        if (!nextNode) {
          this.errorAndExit("Malformed const declaration");
          return 1;
        }
        if (
          !(nextNode.type === NodeTypeEnum.Operator && nextNode.value === "=")
        ) {
          this.errorAndExit("Malformed const declaration", nextNode);
          return 1;
        }
        const id = nextNode.left;
        const value = nextNode.right;
        if (!id || !value) {
          this.errorAndExit("Malformed const declaration", nextNode);
          return 1;
        }
        this.node.declNode = {
          id,
          value,
        };
        this.removeNext();

        // Capture type
        const previousNode = this.previousNode();
        if (previousNode?.type === NodeTypeEnum.Object && previousNode?.node) {
          this.node.declNode.value &&
            (this.node.declNode.value.schema = previousNode);
          this.removePrevious();
        }
      } else if (
        this.node.type === NodeTypeEnum.ID &&
        this.node.value === "var"
      ) {
        this.node.type = NodeTypeEnum.Decl;
        const nextNode = this.nextNode();
        if (!nextNode) {
          this.errorAndExit("Malformed var declaration");
          return 1;
        }

        if (
          !(nextNode.type === NodeTypeEnum.Operator && nextNode.value === "=")
        ) {
          this.node.declNode = {
            id: nextNode,
            value: this.newNode(NodeTypeEnum.Undefined),
          };
          this.removeNext();
        } else {
          const id = nextNode.left;
          const value = nextNode.right;
          if (!id || !value) {
            this.errorAndExit("Malformed var declaration", nextNode);
            return 1;
          }
          this.node.declNode = {
            id,
            value,
          };
          this.removeNext();

          // Capture type
          const previousNode = this.previousNode();
          if (
            previousNode?.type === NodeTypeEnum.Object &&
            previousNode?.node
          ) {
            this.node.declNode.value &&
              (this.node.declNode.value.schema = previousNode);
            this.removePrevious();
          }
        }
      } else if (
        this.node.type === NodeTypeEnum.ID &&
        this.node.value === "let"
      ) {
        this.node.type = NodeTypeEnum.Decl;
        const nextNode = this.nextNode();
        if (!nextNode) {
          this.errorAndExit("Malformed let declaration");
          return 1;
        }

        if (
          !(nextNode.type === NodeTypeEnum.Operator && nextNode.value === "=")
        ) {
          this.node.declNode = {
            id: nextNode,
            value: this.newNode(NodeTypeEnum.Undefined),
          };
          this.removeNext();
        } else {
          const id = nextNode.left;
          const value = nextNode.right;
          if (!id || !value) {
            this.errorAndExit("Malformed let declaration", nextNode);
            return 1;
          }
          this.node.declNode = {
            id,
            value,
          };
          this.removeNext();

          // Capture type
          const previousNode = this.previousNode();
          if (
            previousNode?.type === NodeTypeEnum.Object &&
            previousNode?.node
          ) {
            this.node.declNode.value &&
              (this.node.declNode.value.schema = previousNode);
            this.removePrevious();
          }
        }
      }
      this.advance();
    }
  }

  private parsePostFixOperator(endToken?: string) {
    while (this.node) {
      if (
        endToken &&
        this.node.type === NodeTypeEnum.Operator &&
        this.node.value === endToken
      ) {
        break;
      }

      while (true) {
        const nextNode = this.nextNode();

        if (!nextNode) {
          break;
        }

        if (
          ((this.node.type === NodeTypeEnum.ID &&
            this.node.value !== "const" &&
            this.node.value !== "var" &&
            this.node.value !== "let") ||
            this.node.type === NodeTypeEnum.Break ||
            this.node.type === NodeTypeEnum.FunctionCall ||
            this.node.type === NodeTypeEnum.Accessor ||
            this.node.type === NodeTypeEnum.Paren ||
            this.node.type === NodeTypeEnum.List ||
            this.node.type === NodeTypeEnum.Object) &&
          (nextNode.type === NodeTypeEnum.Paren ||
            nextNode.type === NodeTypeEnum.List)
        ) {
          if (this.node.type === NodeTypeEnum.Break) {
            this.node.type = NodeTypeEnum.ID;
          }
          this.node.left = structuredClone(this.node);
          this.node.type !== NodeTypeEnum.ID && (this.node.value = undefined);
          this.node.node = undefined;
          this.node.nodes = undefined;
          this.node.type =
            nextNode.type === NodeTypeEnum.Paren
              ? NodeTypeEnum.FunctionCall
              : NodeTypeEnum.Accessor;
          this.node.value = NodeTypeEnum[this.node.type];
          this.node.right = nextNode;
          this.removeNext();
          continue;
        }

        break;
      }

      this.advance();
    }
  }

  public parse(endToken?: string, startIndex?: number) {
    this.parseParen();
    this.reset(startIndex);
    this.parseList();
    this.reset(startIndex);
    this.parseObject();
    this.reset(startIndex);
    this.parseUnaryOperators(endToken, ["!", "..."]);
    this.reset(startIndex);
    this.parsePostFixOperator(endToken);
    this.reset(startIndex);
    this.parseOperator(".", endToken);
    this.reset(startIndex);
    this.parseOperator("->", endToken);
    this.reset(startIndex);
    this.parseOperator("*", endToken);
    this.reset(startIndex);
    this.parseOperator("/", endToken);
    this.reset(startIndex);
    this.parseOperator("+", endToken);
    this.reset(startIndex);
    this.parseOperator("-", endToken);
    this.reset(startIndex);
    this.parseOperator("+=", endToken);
    this.reset(startIndex);
    this.parseOperator("-=", endToken);
    this.reset(startIndex);
    this.parseOperator("*=", endToken);
    this.reset(startIndex);
    this.parseOperator("/=", endToken);
    this.reset(startIndex);
    this.parseOperator("%", endToken);
    this.reset(startIndex);
    this.parseOperator("^", endToken);
    this.reset(startIndex);
    this.parseOperator(">", endToken);
    this.reset(startIndex);
    this.parseOperator("<", endToken);
    this.reset(startIndex);
    this.parseOperator(">=", endToken);
    this.reset(startIndex);
    this.parseOperator("<=", endToken);
    this.reset(startIndex);
    this.parseOperator("==", endToken);
    this.reset(startIndex);
    this.parseOperator("!=", endToken);
    this.reset(startIndex);
    this.parseOperator("...", endToken);
    this.reset(startIndex);
    this.parseOperator("..", endToken);
    this.reset(startIndex);
    this.parseUnaryOperator("...", endToken);
    this.reset(startIndex);
    this.parseUnaryOperator("!", endToken);
    this.reset(startIndex);
    this.parseOperator("&&", endToken);
    this.reset(startIndex);
    this.parseOperator("||", endToken);
    this.reset(startIndex);
    this.parseOperator("=>", endToken);
    this.reset(startIndex);
    this.parseOperator(":", endToken);
    this.reset(startIndex);
    this.parseOperator("?", endToken);
    this.reset(startIndex);
    this.parseOperator(undefined, endToken, ["=", ",", "else"]);
    this.reset(startIndex);
    this.parseOperator("=", endToken);
    this.reset(startIndex);
    const res = this.parseDeclaration(endToken);
    if (res) {
      return res;
    }
    this.reset(startIndex);
    this.parseModifier(endToken);
    this.reset(startIndex);
    this.parseOperator(",", endToken);
    this.reset(startIndex);
    this.parseIfStatement(endToken);
    this.reset(startIndex);
    this.parseOperator("else", endToken);
    this.reset(startIndex);
    this.parseForStatement(endToken);
    this.reset(startIndex);
    this.parseWhileStatement(endToken);
    this.reset(startIndex);
    this.parseLoopStatement(endToken);
    this.reset(startIndex);
    this.parseReturn(endToken);
    this.reset(startIndex);
    this.parseYield(endToken);
    this.reset(startIndex);
    this.parseImport(endToken);
    this.reset(startIndex);
  }
}
