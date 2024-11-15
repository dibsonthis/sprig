import { Node, SymbolTable, NodeTypeEnum } from "../types";
import path from "path";

export class Generator {
  private nodes: Node[];
  private node: Node;
  private index: number = 0;
  public generatedNodes: Node[] = [];

  public symbols: SymbolTable = {};
  public tempVars: SymbolTable = {};
  public cachedImports = {};
  public filePath: string;

  public capturedIds = new Set<string>();
  public isCoroutine = false;
  public variables: { id: string; type: string }[] = [];
  public tempVariables: { id: string; type: string }[] = [];
  public variableMap: Record<string, number> = {};
  public hasError = false;

  public typeMap: Record<string, Node> = {};
  public tempTypeMap: Record<string, Node> = {};
  public returnType: Node;
  public expectedReturnType: Node = this.newNode();

  private typeRepr(node: Node) {
    var repr = "";
    var hasAlias = false;
    if (node.meta?.typeAlias) {
      hasAlias = true;
      repr += node.meta.typeAlias + ": (";
    }
    switch (node.type) {
      case NodeTypeEnum.TypeList: {
        repr += node.nodes?.map((node) => this.typeRepr(node)).join(" || ");
        break;
      }
      case NodeTypeEnum.List: {
        if (!node.nodes) {
          return "List";
        }
        repr +=
          "[" +
          node.nodes?.map((node) => this.typeRepr(node)).join(" || ") +
          "]";
        break;
      }
      case NodeTypeEnum.Function: {
        if (node.meta?.name) {
          repr += node.meta.name + ": ";
        }
        repr += "(";
        repr += node.funcNode?.params.map((e) => this.typeRepr(e)).join(", ");
        repr += ") => ";
        repr += this.typeRepr(node.funcNode?.body);
        break;
      }
      default: {
        repr += NodeTypeEnum[node.type];
        break;
      }
    }

    if (hasAlias) {
      repr += ")";
    }

    return repr;
  }

  private removeDuplicateTypes(nodes: Node[]) {
    if (!nodes) {
      return [];
    }
    return nodes.reduce((acc, current) => {
      const exists = acc.some((item) => this.checkTypes(item, current));
      if (!exists) acc.push(current);
      return acc;
    }, [] as Node[]);
  }

  private getListType(node: Node) {
    return node.nodes?.[0] ?? this.newNode(NodeTypeEnum.Any);
  }

  private joinTypes(left: Node, right: Node) {
    const newList = this.newNode(NodeTypeEnum.TypeList);
    newList.nodes = [];

    if (left.type === NodeTypeEnum.TypeList) {
      newList.nodes = [...newList.nodes, ...left.nodes];
    } else {
      newList.nodes = [...newList.nodes, left];
    }
    if (right.type === NodeTypeEnum.TypeList) {
      newList.nodes = [...newList.nodes, ...right.nodes];
    } else {
      newList.nodes = [...newList.nodes, right];
    }
    newList.nodes = this.removeDuplicateTypes(newList.nodes);
    return newList;
  }

  private resolveType(node: Node) {
    if (!node) {
      return this.newNode(NodeTypeEnum.Any);
    }
    switch (node.type) {
      case NodeTypeEnum.Paren: {
        return this.resolveType(node.node);
      }
      case NodeTypeEnum.Block: {
        // in order to scope this, we'll create a new generator
        const generator = new Generator(node.nodes, this.filePath);
        generator.typeMap = { ...this.typeMap };
        generator.tempTypeMap = { ...this.tempTypeMap };
        const res = generator.generate();
        if (res === -1) {
          this.hasError = true;
          return;
        }
        return generator.returnType;
      }
      case NodeTypeEnum.ID: {
        if (this.tempTypeMap.hasOwnProperty(node.value)) {
          return this.tempTypeMap[node.value];
        }
        if (this.typeMap.hasOwnProperty(node.value)) {
          return this.typeMap[node.value];
        }
        return this.newNode(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.String: {
        if (node.value === "Number") {
          return this.newNode(NodeTypeEnum.Number);
        }
        if (node.value === "Boolean") {
          return this.newNode(NodeTypeEnum.Boolean);
        }
        if (node.value === "List") {
          const anyList = this.newNode(NodeTypeEnum.List);
          return anyList;
        }
        if (node.value === "Object") {
          return this.newNode(NodeTypeEnum.Object);
        }
        if (node.value === "Raw") {
          return this.newNode(NodeTypeEnum.Raw);
        }
        if (node.value === "Undefined") {
          return this.newNode();
        }
        return node;
      }
      case NodeTypeEnum.Number:
      case NodeTypeEnum.Boolean:
      case NodeTypeEnum.Undefined: {
        return node;
      }
      case NodeTypeEnum.Function: {
        const funcNode = this.newNode(NodeTypeEnum.Function);
        funcNode.isType = true;
        funcNode.funcNode = {
          params: [],
          body: this.newNode(),
          name: node.meta?.name,
          paramTypes: {},
        };

        const paramNames = [];

        this.flattenChildren(node.left?.node, [","]).forEach((param) => {
          if (node.isType) {
            funcNode.funcNode.params.push(this.resolveType(param));
            return;
          }
          if (param.type === NodeTypeEnum.Operator && param.value === "=") {
            const paramName = param.left.value;
            const paramType = this.resolveType(param.right);
            this.tempTypeMap[paramName] = paramType;
            funcNode.funcNode.paramTypes[paramName] = paramType;
            funcNode.funcNode.params.push(paramType);
            paramNames.push(paramName);
          } else if (
            param.type === NodeTypeEnum.Operator &&
            param.value === "unary..."
          ) {
            // todo
          } else {
            const paramName = param.value;
            const paramType = this.newNode(NodeTypeEnum.Any);
            this.tempTypeMap[paramName] = paramType;
            funcNode.funcNode.paramTypes[paramName] = paramType;
            funcNode.funcNode.params.push(paramType);
            paramNames.push(paramName);
          }
        });

        funcNode.funcNode.body = this.resolveType(node.right ?? this.newNode());

        paramNames.forEach((name) => {
          delete this.tempTypeMap[name];
        });

        return funcNode;
      }
      case NodeTypeEnum.FunctionCall: {
        if (node.left.type === NodeTypeEnum.ID) {
          const fn = this.resolveType(node.left);
          if (fn.type === NodeTypeEnum.Any) {
            return fn;
          }
          if (fn.type === NodeTypeEnum.TypeList) {
            // we have a list of functions
            // we need to extract their return values
            const returnList = this.newNode(NodeTypeEnum.TypeList);
            returnList.nodes = this.removeDuplicateTypes(
              fn.nodes.map(
                (func) => func.funcNode?.body ?? this.newNode(NodeTypeEnum.Any)
              )
            );
            return returnList;
          }
          return fn.funcNode.body;
        }
        return this.newNode(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.Operator: {
        const left = this.resolveType(node.left);
        const right = this.resolveType(node.right);

        if (left.type === NodeTypeEnum.Any || right.type === NodeTypeEnum.Any) {
          return this.newNode(NodeTypeEnum.Any);
        }

        if (node.value === "=") {
          return right;
        }

        if (node.value === "||") {
          var types = this.flattenChildren(node, ["||"]) as Node[];
          const typeOptionsList = this.newNode(NodeTypeEnum.TypeList);
          typeOptionsList.nodes = this.removeDuplicateTypes(
            types.map((e) => this.resolveType(e))
          );
          return typeOptionsList;
        }
        if (node.value === "+") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return this.newNode(NodeTypeEnum.Number);
          }

          if (
            left.type === NodeTypeEnum.String ||
            right.type === NodeTypeEnum.String
          ) {
            return this.newNode(NodeTypeEnum.String);
          }

          if (
            left.type === NodeTypeEnum.List &&
            right.type === NodeTypeEnum.List
          ) {
            const listType = this.joinTypes(
              this.getListType(left),
              this.getListType(right)
            );
            const newList = this.newNode(NodeTypeEnum.List);
            newList.nodes = [listType];
            return newList;
          }

          // todo: Lists and Objects

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "-") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return this.newNode(NodeTypeEnum.Number);
          }

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "*") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return this.newNode(NodeTypeEnum.Number);
          }

          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.List
          ) {
            const newList = this.newNode(NodeTypeEnum.List);
            newList.nodes = [right];
            return newList;
          }

          if (
            left.type === NodeTypeEnum.List &&
            right.type === NodeTypeEnum.Number
          ) {
            const newList = this.newNode(NodeTypeEnum.List);
            newList.nodes = [left];
            return newList;
          }

          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.String
          ) {
            return right;
          }

          if (
            left.type === NodeTypeEnum.String &&
            right.type === NodeTypeEnum.Number
          ) {
            return left;
          }

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "/") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return this.newNode(NodeTypeEnum.Number);
          }

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "%") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return this.newNode(NodeTypeEnum.Number);
          }

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "^") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return this.newNode(NodeTypeEnum.Number);
          }

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "|") {
          if (
            left.type === NodeTypeEnum.List &&
            right.type === NodeTypeEnum.Number
          ) {
            const newList = this.newNode(NodeTypeEnum.List);
            newList.nodes = [left];
            return newList;
          }

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "==") {
          return this.newNode(NodeTypeEnum.Boolean);
        }

        if (node.value === "!=") {
          return this.newNode(NodeTypeEnum.Boolean);
        }

        if (node.value === "<") {
          return this.newNode(NodeTypeEnum.Boolean);
        }

        if (node.value === ">") {
          return this.newNode(NodeTypeEnum.Boolean);
        }

        if (node.value === "<=") {
          return this.newNode(NodeTypeEnum.Boolean);
        }

        if (node.value === ">=") {
          return this.newNode(NodeTypeEnum.Boolean);
        }

        if (node.value === "&&") {
          const typeList = this.newNode(NodeTypeEnum.TypeList);
          typeList.nodes = this.removeDuplicateTypes([left, right]);
          if (typeList.nodes.length === 1) {
            return typeList.nodes[0];
          }
          return typeList;
        }
        // todo
        if (node.value === "+=") {
          return this.newNode(NodeTypeEnum.Any);
        }
        // todo
        if (node.value === "-=") {
          return this.newNode(NodeTypeEnum.Any);
        }
        // todo
        if (node.value === "*=") {
          return this.newNode(NodeTypeEnum.Any);
        }
        // todo
        if (node.value === "/=") {
          return this.newNode(NodeTypeEnum.Any);
        }
        if (node.value === "?") {
          if (
            node.right.type !== NodeTypeEnum.Operator &&
            node.right.value !== ":"
          ) {
            this.errorAndExit(
              "Ternary operator expects right hand side to be a ':'"
            );
            return;
          }
          const typeList = this.newNode(NodeTypeEnum.TypeList);
          const leftStatement = this.resolveType(node.right.left);
          const rightStatement = this.resolveType(node.right.right);
          typeList.nodes = this.removeDuplicateTypes([
            leftStatement,
            rightStatement,
          ]);
          if (typeList.nodes.length === 1) {
            return typeList.nodes[0];
          }
          return typeList;
        }

        if (node.value === "?!") {
          const typeList = this.newNode(NodeTypeEnum.TypeList);
          typeList.nodes = this.removeDuplicateTypes([
            left,
            right,
            this.newNode(),
          ]);
          if (typeList.nodes.length === 1) {
            return typeList.nodes[0];
          }
          return typeList;
        }

        if (node.value === "??") {
          const typeList = this.newNode(NodeTypeEnum.TypeList);
          typeList.nodes = this.removeDuplicateTypes([
            left,
            right,
            this.newNode(),
          ]).filter((e) => e.type !== NodeTypeEnum.Undefined);
          if (typeList.nodes.length === 1) {
            return typeList.nodes[0];
          }
          return typeList;
        }

        if (node.value === ",") {
          var arr = this.flattenChildren(node, [","]).map((e) =>
            this.resolveType(e)
          );
          arr = this.removeDuplicateTypes(arr);
          if (arr.length === 1) {
            return arr[0];
          }
          const listNode = this.newNode(NodeTypeEnum.TypeList);
          listNode.nodes = arr;
          listNode.meta = node.meta;
          return listNode;
        }

        if (node.value === ".." || node.value === "...") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            const listType = this.newNode(NodeTypeEnum.List);
            listType.nodes = [this.newNode(NodeTypeEnum.Number)];
            listType.meta = node.meta;
            return listType;
          }

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "unary+") {
          return right;
        }

        if (node.value === "unary-") {
          if (right.type === NodeTypeEnum.Number) {
            return right;
          }

          return this.newNode(NodeTypeEnum.Undefined);
        }

        if (node.value === "unary!") {
          return this.newNode(NodeTypeEnum.Boolean);
        }

        if (node.value === "unary...") {
          return right.nodes?.[0] ?? this.newNode(NodeTypeEnum.Any);
        }

        return this.newNode(NodeTypeEnum.Undefined);
      }
      case NodeTypeEnum.TypeList: {
        return node;
      }
      case NodeTypeEnum.List: {
        const typeList = this.newNode(NodeTypeEnum.List);
        if (node.node) {
          typeList.nodes = [this.resolveType(node.node)];
          return typeList;
        }
        var types = this.removeDuplicateTypes(
          node.nodes?.map((e) => this.resolveType(e))
        );
        typeList.nodes = types;
        typeList.meta = node.meta;
        return typeList;
      }
      // todo: Lists, Objects, Functions etc.
      default: {
        return this.newNode(NodeTypeEnum.Any);
      }
    }
  }

  private checkTypes(type: Node, valueType: Node) {
    if (type.type === NodeTypeEnum.TypeList && type.nodes?.length === 1) {
      type = type.nodes[0];
    }

    if (
      valueType.type === NodeTypeEnum.TypeList &&
      valueType.nodes?.length === 1
    ) {
      valueType = valueType.nodes[0];
    }

    if (type.type === NodeTypeEnum.Any || valueType.type === NodeTypeEnum.Any) {
      return true;
    }

    if (
      type.type === NodeTypeEnum.TypeList &&
      valueType.type === NodeTypeEnum.TypeList
    ) {
      for (const _valueType of valueType.nodes) {
        if (!this.checkTypes(type, _valueType)) {
          return false;
        }
      }

      return true;
    }

    if (type.type === NodeTypeEnum.TypeList) {
      if (!type.nodes) {
        return type.type === valueType.type;
      }
      for (const _type of type.nodes) {
        if (this.checkTypes(_type, valueType)) {
          return true;
        }
      }
      return false;
    }

    if (valueType.type === NodeTypeEnum.TypeList) {
      // If we've reached here, then the value has more options than the type
      return false;
    }

    if (
      type.type === NodeTypeEnum.List &&
      valueType.type === NodeTypeEnum.List
    ) {
      const check = this.checkTypes(
        type.nodes?.[0] ?? this.newNode(NodeTypeEnum.Any),
        valueType.nodes?.[0] ?? this.newNode()
      );
      return check;
    }

    if (
      type.type === NodeTypeEnum.Function &&
      valueType.type === NodeTypeEnum.Function
    ) {
      if (type.funcNode.params.length !== valueType.funcNode.params.length) {
        return false;
      }
      type.funcNode.params.forEach((param, index) => {
        if (!this.checkTypes(param, valueType.funcNode.params[index])) {
          return false;
        }
      });
      if (!this.checkTypes(type.funcNode.body, valueType.funcNode.body)) {
        return false;
      }
      return true;
    }

    if (type.type === valueType.type) {
      return true;
    }

    return false;
  }

  private errorAndContinue(message: string, node?: Node) {
    const errorNode = node ? node : this.node;
    const resolved = path.resolve(this.filePath);
    console.error(
      "\x1b[31m%s\x1b[0m",
      `Error at (${resolved}:${errorNode.line}:${errorNode.col}): ${message}`
    );
  }

  private errorAndExit(message: string, node?: Node) {
    this.errorAndContinue(message, node);
    this.hasError = true;
  }

  constructor(nodes: Node[], filePath: string = ".") {
    this.nodes = nodes;
    this.node = this.nodes[0];
    this.filePath = filePath;
  }

  private advance() {
    this.index += 1;
    this.node = this.nodes[this.index];
  }

  private newNode(
    type: NodeTypeEnum = NodeTypeEnum.Undefined,
    value?: any
  ): Node {
    return {
      col: this.node?.col ?? 0,
      line: this.node?.line ?? 0,
      type,
      value,
      evaluated: false,
    };
  }

  private flattenChildren(node: Node, str: string[]) {
    let flatList = [];

    if (!node) {
      return flatList;
    }

    if (!str.includes(node.value)) {
      flatList.push(node);
      return flatList;
      // if (node.type === NodeTypeEnum.Operator) {
      //   return flatList;
      // }
    }

    if (node.left) {
      if (!str.includes(node.left.value)) {
        flatList.push(node.left);
      } else {
        node.left.left &&
          (flatList = flatList.concat(
            this.flattenChildren(node.left.left, str)
          ));
        node.left.right &&
          (flatList = flatList.concat(
            this.flattenChildren(node.left.right, str)
          ));
      }
    }

    if (node.right) {
      if (!str.includes(node.right.value)) {
        flatList.push(node.right);
      } else {
        node.right.left &&
          (flatList = flatList.concat(
            this.flattenChildren(node.right.left, str)
          ));
        node.right.right &&
          (flatList = flatList.concat(
            this.flattenChildren(node.right.right, str)
          ));
      }
    }

    return flatList;
  }

  private generateAccessor(node: Node, captureIds = false) {
    this.generateBytecode(node.left, false, captureIds);
    if (!node.right?.node) {
      this.errorAndExit("Accessor cannot be empty");
      return;
    }
    this.generateBytecode(node.right?.node, false, captureIds);
    this.generatedNodes.push(this.newNode(NodeTypeEnum.Accessor));
  }

  private generateBytecode(node: Node, pop?: boolean, captureIds?: boolean) {
    if (!node) {
      return;
    }
    switch (node.type) {
      case NodeTypeEnum.ID: {
        if (captureIds) {
          this.capturedIds.add(node.value);
        }

        // Check temp vars
        let variableIndex = this.tempVariables.findIndex(
          (e) => e.id === node.value
        );

        if (variableIndex !== -1) {
          this.generatedNodes.push(
            this.newNode(NodeTypeEnum.LoadTemp, variableIndex)
          );
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }

        // Check vars
        variableIndex = this.variables.findIndex((e) => e.id === node.value);

        if (variableIndex !== -1) {
          this.generatedNodes.push(
            this.newNode(NodeTypeEnum.Load, variableIndex)
          );
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }

        // global
        this.generatedNodes.push(
          this.newNode(NodeTypeEnum.LoadSymbol, node.value)
        );
        if (pop) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
        }
        return;
      }
      case NodeTypeEnum.String:
      case NodeTypeEnum.Number:
      case NodeTypeEnum.Boolean: {
        this.generatedNodes.push(node);
        if (pop) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
        }
        return;
      }
      case NodeTypeEnum.Paren: {
        this.generateBytecode(node.node, pop, captureIds);
        return;
      }
      case NodeTypeEnum.Operator: {
        if (node.value === "::") {
          // Types
          const id = node.left.value;
          const type = this.resolveType(node.right);
          if (node.right.type === NodeTypeEnum.ID) {
            if (type.meta) {
              type.meta.typeAlias = node.right.value;
            } else {
              type.meta = {
                typeAlias: node.right.value,
              };
            }
          }
          this.typeMap[id] = type;
          return;
        }
        if (node.value === "=") {
          if (node.left.type === NodeTypeEnum.ID) {
            if (captureIds) {
              this.capturedIds.add(node.left.value);
            }

            const index = this.variables.findIndex(
              (e) => e.id === node.left.value
            );

            if (index >= 0) {
              if (this.variables[index].type === "const") {
                this.errorAndExit(
                  `Const variable '${node.left.value}' cannot be re-assigned`
                );
                return;
              }
              this.generateBytecode(node.right, false, captureIds);
              this.generatedNodes.push(this.newNode(NodeTypeEnum.Store, index));
            } else {
              const idStringNode = this.newNode(
                NodeTypeEnum.String,
                node.left.value
              );

              this.generatedNodes.push(idStringNode);
              this.generateBytecode(node.right, false, captureIds);
              this.generatedNodes.push(this.newNode(NodeTypeEnum.Equal));
            }
            if (pop) {
              this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
            }

            // type
            const type = this.resolveType(this.typeMap[node.left.value]);
            const valueType = this.resolveType(node.right);
            if (index >= 0 && this.variables[index].type === "let") {
              this.typeMap[node.left.value] = valueType;
            } else {
              if (!this.checkTypes(type, valueType)) {
                this.errorAndExit(
                  `TypeError: Expected type ${this.typeRepr(
                    type
                  )} but received type ${this.typeRepr(valueType)}`
                );
                return;
              }
            }

            return;
          }
          if (
            node.left.type === NodeTypeEnum.Accessor ||
            (node.left.type === NodeTypeEnum.Operator &&
              node.left.value === ".")
          ) {
            const flattened = this.flattenChildren(node.left, [
              ".",
              NodeTypeEnum[NodeTypeEnum.Accessor],
            ]);
            flattened.slice(0, -1).forEach((elem: Node, index) => {
              if (index > 0) {
                if (elem.type === NodeTypeEnum.ID) {
                  if (captureIds) {
                    this.capturedIds.add(elem.value);
                  }
                  elem.type = NodeTypeEnum.String;
                }
                if (elem.type === NodeTypeEnum.List) {
                  elem = elem.node;
                }
                this.generateBytecode(elem, false, captureIds);
              } else {
                this.generateBytecode(elem, false, captureIds);
              }
              if (index >= 1 && elem.type !== NodeTypeEnum.FunctionCall) {
                this.generatedNodes.push(this.newNode(NodeTypeEnum.Accessor));
              }
            });
            var lastElem = flattened.at(-1);
            if (lastElem.type === NodeTypeEnum.ID) {
              if (captureIds) {
                this.capturedIds.add(lastElem.value);
              }
              lastElem.type = NodeTypeEnum.String;
            }
            if (lastElem.type === NodeTypeEnum.List) {
              lastElem = lastElem.node;
            }
            this.generateBytecode(node.right, false, captureIds);
            this.generateBytecode(lastElem, false, captureIds);
            this.generatedNodes.push(this.newNode(NodeTypeEnum.ModifyProperty));
            if (pop) {
              this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
            }
            return;
          }
          this.errorAndExit("Malformed assignment");
          return;
        }
        if (node.value === ".") {
          const flattened = this.flattenChildren(node, [
            ".",
            NodeTypeEnum[NodeTypeEnum.Accessor],
            NodeTypeEnum[NodeTypeEnum.FunctionCall],
          ]);
          flattened.forEach((elem: Node, index) => {
            if (index > 0) {
              if (elem.type === NodeTypeEnum.List) {
                elem = elem.node;
              } else if (elem.type === NodeTypeEnum.ID) {
                if (captureIds) {
                  this.capturedIds.add(elem.value);
                }
                elem.type = NodeTypeEnum.String;
              }
              if (elem.type === NodeTypeEnum.Paren) {
                // const fnCall = this.newNode(NodeTypeEnum.FunctionCall);
                const fnCall = this.newNode(NodeTypeEnum.MethodCall);
                fnCall.right = elem;
                elem = fnCall;
              }
              this.generateBytecode(elem, false, captureIds);
            } else {
              this.generateBytecode(elem, false, captureIds);
            }
            if (index >= 1 && elem.type !== NodeTypeEnum.MethodCall) {
              this.generatedNodes.push(this.newNode(NodeTypeEnum.Accessor));
            }
          });
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.value === "->") {
          this.generateBytecode(node.left, false, captureIds);

          while (node.right.type === NodeTypeEnum.Paren) {
            node.right = node.right.node;
          }

          if (node.right.type === NodeTypeEnum.ID) {
            if (captureIds) {
              this.capturedIds.add(node.right.value);
            }
            const fnCall = this.newNode(NodeTypeEnum.FunctionCall);
            fnCall.left = this.newNode(NodeTypeEnum.ID, node.right.value);
            fnCall.right = this.newNode(NodeTypeEnum.Paren);
            node.right = fnCall;
          } else if (node.right.type === NodeTypeEnum.Function) {
            const fnCall = this.newNode(NodeTypeEnum.FunctionCall);
            fnCall.left = node.right;
            fnCall.right = this.newNode(NodeTypeEnum.Paren);
            node.right = fnCall;
          }

          node.right.meta = {
            ...node.right.meta,
            swapTos: true,
          };

          this.generateBytecode(node.right, false, captureIds);
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.value === "&&") {
          this.generateBytecode(node.left, false, captureIds);
          const jump = this.newNode(NodeTypeEnum.JumpIfFalse);
          this.generatedNodes.push(jump);
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          this.generateBytecode(node.right, false, captureIds);
          jump.value = this.generatedNodes.length - 1;
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.value === "||") {
          this.generateBytecode(node.left, false, captureIds);
          const jump = this.newNode(NodeTypeEnum.JumpIfTrue);
          this.generatedNodes.push(jump);
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          this.generateBytecode(node.right, false, captureIds);
          jump.value = this.generatedNodes.length - 1;
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.value === "+=") {
          if (node.left.type === NodeTypeEnum.ID) {
            const variableIndex = this.variables.findIndex(
              (e) => e.id === node.left.value
            );
            if (variableIndex >= 0) {
              this.generateBytecode(node.right, false, captureIds);
              this.generatedNodes.push(
                this.newNode(NodeTypeEnum.AddAssign, variableIndex)
              );
              if (pop) {
                this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
              }
              return;
            }
          }

          const eq = this.newNode(NodeTypeEnum.Operator, "=");
          eq.left = node.left;
          const op = this.newNode(NodeTypeEnum.Operator, "+");
          op.left = node.left;
          op.right = node.right;
          eq.right = op;
          this.generateBytecode(eq, false, captureIds);
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.value === "-=") {
          const eq = this.newNode(NodeTypeEnum.Operator, "=");
          eq.left = node.left;
          const op = this.newNode(NodeTypeEnum.Operator, "-");
          op.left = node.left;
          op.right = node.right;
          eq.right = op;
          this.generateBytecode(eq, false, captureIds);
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.value === "*=") {
          const eq = this.newNode(NodeTypeEnum.Operator, "=");
          eq.left = node.left;
          const op = this.newNode(NodeTypeEnum.Operator, "*");
          op.left = node.left;
          op.right = node.right;
          eq.right = op;
          this.generateBytecode(eq, false, captureIds);
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.value === "/=") {
          const eq = this.newNode(NodeTypeEnum.Operator, "=");
          eq.left = node.left;
          const op = this.newNode(NodeTypeEnum.Operator, "/");
          op.left = node.left;
          op.right = node.right;
          eq.right = op;
          this.generateBytecode(eq, false, captureIds);
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.value === "?") {
          if (
            node.right.type !== NodeTypeEnum.Operator &&
            node.right.value !== ":"
          ) {
            this.errorAndExit(
              "Ternary operator expects right hand side to be a ':'"
            );
            return;
          }
          this.generateBytecode(node.left, false, captureIds);
          const jumpifFalse = this.newNode(NodeTypeEnum.JumpIfFalsePop);
          this.generatedNodes.push(jumpifFalse);
          this.generateBytecode(node.right.left, false, captureIds);
          const jump = this.newNode(NodeTypeEnum.Jump);
          this.generatedNodes.push(jump);
          jumpifFalse.value = this.generatedNodes.length - 1;
          this.generateBytecode(node.right.right, false, captureIds);
          jump.value = this.generatedNodes.length - 1;
          return;
        }
        if (node.value === "??") {
          this.generateBytecode(node.left, false, captureIds);
          const jumpifFalse = this.newNode(NodeTypeEnum.JumpIfFalsePop);
          this.generatedNodes.push(jumpifFalse);
          this.generateBytecode(node.left, false, captureIds);
          const jump = this.newNode(NodeTypeEnum.Jump);
          this.generatedNodes.push(jump);
          jumpifFalse.value = this.generatedNodes.length - 1;
          this.generateBytecode(node.right, false, captureIds);
          jump.value = this.generatedNodes.length - 1;
          return;
        }
        if (node.value === "else") {
          const statements = this.flattenChildren(node, ["else"]);
          const jump = this.newNode(NodeTypeEnum.Jump);
          statements.forEach((statement) => {
            if (statement.type === NodeTypeEnum.IfStatement) {
              this.generateBytecode(statement.left, false, captureIds);
              const jumpFalse = this.newNode(NodeTypeEnum.JumpIfFalse);
              this.generatedNodes.push(jumpFalse);
              this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
              this.generateBytecode(statement.right, pop, captureIds);
              this.generatedNodes.push(jump);
              jumpFalse.value = this.generatedNodes.length - 1;
            } else {
              this.generateBytecode(statement, pop, captureIds);
            }
            jump.value = this.generatedNodes.length - 1;
          });
          if (pop) {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
          }
          return;
        }
        if (node.meta?.unary) {
          this.generateBytecode(node.right, false, captureIds);
        } else {
          this.generateBytecode(node.left, false, captureIds);
          this.generateBytecode(node.right, false, captureIds);
        }
        switch (node.value) {
          case "unary+": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pos));
            break;
          }
          case "unary-": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Neg));
            break;
          }
          case "unary!": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Exclamation));
            break;
          }
          case "unary...": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.UnaryTripleDot));
            break;
          }
          case "+": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Add));
            break;
          }
          case "-": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Sub));
            break;
          }
          case "*": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Mul));
            break;
          }
          case "/": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Div));
            break;
          }
          case "%": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Percent));
            break;
          }
          case "^": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Caret));
            break;
          }
          case "=": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Equal));
            break;
          }
          case "...": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.TripleDot));
            break;
          }
          case "..": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.DoubleDot));
            break;
          }
          case "|": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Pipe));
            break;
          }
          case "==": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.EqualEqual));
            break;
          }
          case "!=": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.NotEqual));
            break;
          }
          case "<": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.LessThan));
            break;
          }
          case ">": {
            this.generatedNodes.push(this.newNode(NodeTypeEnum.GreaterThan));
            break;
          }
          case "<=": {
            this.generatedNodes.push(
              this.newNode(NodeTypeEnum.LessThanOrEqual)
            );
            break;
          }
          case ">=": {
            this.generatedNodes.push(
              this.newNode(NodeTypeEnum.GreaterThanOrEqual)
            );
            break;
          }
          default: {
            this.generatedNodes.push({
              ...node,
              left: undefined,
              right: undefined,
            });
          }
        }
        if (pop) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
        }
        return;
      }
      case NodeTypeEnum.Decl: {
        const variableIndices = [];
        let variableIndex = 0;
        let isClass = false;
        if (node.declNode.id.type === NodeTypeEnum.Paren) {
          isClass = true;
          node.declNode.id = node.declNode.id.node;
        }
        if (node.declNode.id.type === NodeTypeEnum.ID) {
          // Check if variable already defined
          const symbol = this.variables.find(
            (e) => e.id === node.declNode.id.value
          );
          if (symbol) {
            if (!(node.value === "let" && symbol.type === "let")) {
              this.errorAndExit(
                `Variable '${node.declNode.id.value}' cannot be re-declared`
              );
              return;
            }
            const symbolIndex = this.variables.findIndex(
              (e) => e.id === node.declNode.id.value
            );
            variableIndex = symbolIndex;
          } else {
            variableIndex = this.variables.length;
            this.variableMap[node.declNode.id.value] = this.variables.length;
            this.variables.push({
              id: node.declNode.id.value,
              type: node.value,
            });
          }
          this.generatedNodes.push(
            this.newNode(NodeTypeEnum.String, node.declNode.id.value)
          );
          // add/modify type
          if (this.typeMap.hasOwnProperty(node.declNode.id.value)) {
            // check if value matches type
            const type = this.resolveType(node.declNode.id);
            const valueType = this.resolveType(node.declNode.value);
            if (symbol && node.value === "let" && symbol.type === "let") {
              this.typeMap[node.declNode.id.value] = valueType;
            } else {
              if (!this.checkTypes(type, valueType)) {
                this.errorAndExit(
                  `TypeError: Expected type ${this.typeRepr(
                    type
                  )} but received type ${this.typeRepr(valueType)}`
                );
                return;
              }
            }
          } else {
            this.typeMap[node.declNode.id.value] = this.resolveType(
              node.declNode.value
            );
          }
        } else if (node.declNode.id.type === NodeTypeEnum.List) {
          const flat = this.flattenChildren(node.declNode.id.node, [","]);
          if (flat.length === 0) {
            this.errorAndExit("Destructured declaration list cannot be empty");
            return;
          }
          const destructuredList = this.newNode(NodeTypeEnum.List);
          destructuredList.nodes = flat.map((elem) => {
            if (elem.type !== NodeTypeEnum.ID) {
              this.errorAndExit(
                "Destructured declarations need to be identifiers"
              );
              return;
            }
            // Check if variable already defined
            const symbol = this.variables.find((e) => e.id === elem.value);
            if (symbol) {
              if (!(node.value === "let" && symbol.type === "let")) {
                this.errorAndExit(
                  `Variable '${elem.value}' cannot be re-declared`
                );
                return;
              }
            } else {
              this.variableMap[elem.value] = this.variables.length;
              this.variables.push({ id: elem.value, type: node.value });
            }
            variableIndices.push(this.variables.length - 1);
            return this.newNode(NodeTypeEnum.String, elem.value);
          });
          this.generateBytecode(destructuredList, false, false);
        } else if (
          node.declNode.id.type === NodeTypeEnum.Block ||
          node.declNode.id.type === NodeTypeEnum.Object
        ) {
          var flat = node.declNode.id.nodes;
          if (node.declNode.id.type === NodeTypeEnum.Object) {
            flat = this.flattenChildren(node.declNode.id.node, [","]);
          }
          if (flat.length === 0) {
            this.errorAndExit("Destructured declaration list cannot be empty");
            return;
          }
          const destructuredList = this.newNode(NodeTypeEnum.List);
          destructuredList.nodes = flat.map((elem) => {
            if (elem.type !== NodeTypeEnum.ID) {
              this.errorAndExit(
                "Destructured declarations need to be identifiers"
              );
              return;
            }
            // Check if variable already defined
            const symbol = this.variables.find((e) => e.id === elem.value);
            if (symbol) {
              if (!(node.value === "let" && symbol.type === "let")) {
                this.errorAndExit(
                  `Variable '${elem.value}' cannot be re-declared`
                );
                return;
              }
            } else {
              this.variableMap[elem.value] = this.variables.length;
              this.variables.push({ id: elem.value, type: node.value });
            }
            variableIndices.push(this.variables.length - 1);
            return this.newNode(NodeTypeEnum.String, elem.value);
          });
          this.generateBytecode(destructuredList, false, captureIds);
        }
        this.generateBytecode(node.declNode.value, false, captureIds);
        this.generatedNodes.push({
          ...node,
          declNode: {
            isClass,
            variableIndex: variableIndex,
            variableIndices,
          },
        });
        if (pop) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
        }
        return;
      }
      case NodeTypeEnum.MethodCall:
      case NodeTypeEnum.FunctionCall: {
        this.generatedNodes.push(this.newNode(NodeTypeEnum.FunctionCallBegin));
        if (node.meta?.swapTos) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.SwapStack));
        }
        var args = node.right.node ? [node.right.node] : [];
        if (
          node.right.node?.type === NodeTypeEnum.Operator &&
          node.right.node?.value === ","
        ) {
          args = this.flattenChildren(node.right.node, [","]);
        }
        var isNamedArg = false;
        args.forEach((arg) => {
          if (arg.type === NodeTypeEnum.Operator && arg.value === ":") {
            isNamedArg = true;
            this.generatedNodes.push(
              this.newNode(NodeTypeEnum.String, arg.left.value)
            );
            this.generateBytecode(arg.right, false, captureIds);
            this.generatedNodes.push(this.newNode(NodeTypeEnum.NamedArg));
          } else {
            if (isNamedArg) {
              this.errorAndExit(
                "Cannot provide unnamed argument after named argument"
              );
              return;
            }
            this.generateBytecode(arg, false, captureIds);
          }
        });
        if (node.left) {
          if (node.left.type === NodeTypeEnum.ID) {
            if (captureIds) {
              this.capturedIds.add(node.left.value);
            }
            const fnIdString = this.newNode(
              NodeTypeEnum.String,
              node.left.value
            );
            fnIdString.index = this.variables.findIndex(
              (e) => e.id === node.left.value
            );
            if (fnIdString.index == -1) {
              fnIdString.index = this.tempVariables.findIndex(
                (e) => e.id === node.left.value
              );
              if (fnIdString.index >= 0) {
                this.generatedNodes.push(
                  this.newNode(NodeTypeEnum.LoadTemp, fnIdString.index)
                );
              } else {
                this.generatedNodes.push(fnIdString);
              }
            } else {
              this.generatedNodes.push(fnIdString);
            }
            // todo: change these to Load bytecode
            // this.generatedNodes.push(fnIdString);
          } else {
            this.generateBytecode(node.left, false, captureIds);
          }
        }
        // this.generatedNodes.push(this.newNode(NodeTypeEnum.Number, args.length));
        // const call = this.newNode(NodeTypeEnum.FunctionCall, node.left);
        const call = this.newNode(node.type, node.value);
        call.left = undefined;
        call.right = undefined;
        this.generatedNodes.push(call);
        if (pop) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
        }
        return node;
      }
      case NodeTypeEnum.ForStatement: {
        var _valueName;
        var _indexName;
        const tempVarIndices = [];
        const loopStart = this.newNode(NodeTypeEnum.StartForLoop);
        loopStart.value = 0;
        loopStart.forLoopStartNode = {
          count: -1,
          endIndex: 0,
        };
        const forLoopSections: Node[] = this.flattenChildren(node.left.node, [
          ",",
        ]);
        if (forLoopSections.length < 1) {
          this.errorAndExit("Malformed for loop");
          return;
        }

        const arrType = this.resolveType(forLoopSections[0]);

        if (forLoopSections.length > 1) {
          const valueName = forLoopSections[1];
          if (valueName.type !== NodeTypeEnum.ID) {
            this.errorAndExit("For loop variable name must be of type ID");
            return;
          }
          tempVarIndices.push(tempVarIndices.length);
          this.tempVariables.push({ id: valueName.value, type: "let" });
          loopStart.forLoopStartNode.valueName = valueName.value;
          loopStart.forLoopStartNode.valueIndex = this.tempVariables.length - 1;
          this.tempTypeMap[valueName.value] = this.getListType(arrType);
          _valueName = valueName.value;
        }
        if (forLoopSections.length > 2) {
          const indexName = forLoopSections[2];
          if (indexName.type !== NodeTypeEnum.ID) {
            this.errorAndExit("For loop index name must be of type ID");
            return;
          }
          tempVarIndices.push(tempVarIndices.length);
          this.tempVariables.push({ id: indexName.value, type: "let" });
          loopStart.forLoopStartNode.indexName = indexName.value;
          loopStart.forLoopStartNode.indexIndex = this.tempVariables.length - 1;
          this.tempTypeMap[indexName.value] = this.newNode(NodeTypeEnum.Number);
          _indexName = indexName.value;
        }
        this.generateBytecode(forLoopSections[0], false, captureIds);
        this.generatedNodes.push(loopStart);
        const loopStartIndex = this.generatedNodes.length - 1;
        this.generateBytecode(node.right, pop, captureIds);
        this.generatedNodes.push({
          ...node,
          left: undefined,
          right: undefined,
          value: loopStartIndex,
        });
        loopStart.forLoopStartNode.endIndex = this.generatedNodes.length - 1;
        this.tempVariables = this.tempVariables.slice(
          0,
          -tempVarIndices.length
        );
        _valueName && delete this.tempTypeMap[_valueName];
        _indexName && delete this.tempTypeMap[_indexName];
        return;
      }
      case NodeTypeEnum.WhileStatement: {
        const loopStart = this.newNode(NodeTypeEnum.StartWhileLoop);
        const loopStartIndex = this.generatedNodes.length;
        this.generatedNodes.push(loopStart);
        this.generateBytecode(node.left, false, captureIds);
        const jumpIfFalse = this.newNode(NodeTypeEnum.JumpIfFalsePop);
        this.generatedNodes.push(jumpIfFalse);
        this.generateBytecode(node.right, pop, captureIds);
        const jump = this.newNode(NodeTypeEnum.Jump, loopStartIndex);
        this.generatedNodes.push(jump);
        jumpIfFalse.value = this.generatedNodes.length - 1;
        loopStart.value = jumpIfFalse.value;
        this.generatedNodes.push(this.newNode(NodeTypeEnum.WhileStatement));
        return;
      }
      case NodeTypeEnum.LoopStatement: {
        const flat = this.flattenChildren(node.left.node, [","]);

        this.generateBytecode(flat[0], false, captureIds);
        this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));

        const currentIndex = this.generatedNodes.length - 1;
        this.generateBytecode(flat[1], false, captureIds);
        const jumpIfFalse = this.newNode(NodeTypeEnum.JumpIfFalsePop);
        this.generatedNodes.push(jumpIfFalse);
        this.generateBytecode(node.right, pop, captureIds);
        this.generateBytecode(flat[2], pop, captureIds);
        const jump = this.newNode(NodeTypeEnum.Jump);
        this.generatedNodes.push(jump);
        jump.value = currentIndex;
        jumpIfFalse.value = this.generatedNodes.length - 1;
        return;
      }
      case NodeTypeEnum.IfStatement: {
        this.generateBytecode(node.left, false, captureIds);
        const jump = this.newNode(NodeTypeEnum.JumpIfFalsePop);
        this.generatedNodes.push(jump);
        this.generateBytecode(node.right, pop, captureIds);
        jump.value = this.generatedNodes.length - 1;
        return;
      }
      case NodeTypeEnum.Accessor: {
        this.generateAccessor(node, captureIds);
        return;
      }
      case NodeTypeEnum.List: {
        this.generatedNodes.push(this.newNode(NodeTypeEnum.ListBegin));
        // const elems = this.flattenChildren(node.node, [","]).reverse();
        var elems = node.nodes;
        if (!elems) {
          elems = this.flattenChildren(node.node, [","]);
        }
        elems.forEach((e) => this.generateBytecode(e, false, captureIds));
        this.generatedNodes.push(this.newNode(NodeTypeEnum.List, elems.length));
        if (pop) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
        }
        return;
      }
      case NodeTypeEnum.Object: {
        const props = this.flattenChildren(node.node, [","]).reverse();
        props.forEach((e) => {
          if (e.type === NodeTypeEnum.ID) {
            e.left = this.newNode(NodeTypeEnum.String, e.value);
            e.right = this.newNode(NodeTypeEnum.ID, e.value);
            if (captureIds) {
              this.capturedIds.add(e.value);
            }
            e.type = NodeTypeEnum.Operator;
            e.value = ":";
          }
          if (e.left.type === NodeTypeEnum.List && !e.left.node) {
            this.errorAndExit("Dynamic object property cannot be empty");
            return;
          }
          if (e.left.type === NodeTypeEnum.String) {
            this.generatedNodes.push(e.left);
          } else if (e.left.type === NodeTypeEnum.ID) {
            this.generatedNodes.push(
              this.newNode(NodeTypeEnum.String, e.left.value)
            );
          } else if (e.left.type === NodeTypeEnum.List) {
            this.generateBytecode(e.left.node, false, true);
          }
          this.generateBytecode(e.right, false, captureIds);
        });
        this.generatedNodes.push(
          this.newNode(NodeTypeEnum.Object, props.length)
        );
        if (pop) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
        }
        return;
      }
      case NodeTypeEnum.Block: {
        node.nodes.forEach((node) =>
          this.generateBytecode(node, pop, captureIds)
        );
        return;
      }
      case NodeTypeEnum.Function: {
        const nodes =
          node.right.type === NodeTypeEnum.Block
            ? node.right.nodes
            : [node.right];
        const generator = new Generator(nodes, this.filePath);
        const params = this.flattenChildren(node.left.node, [","]);
        var isDefault = false;
        var isCatchAll = false;

        const resolvedFunction: Node = this.resolveType(
          this.newNode(NodeTypeEnum.ID, node.meta?.name ?? "")
        );
        if (resolvedFunction.type === NodeTypeEnum.Function) {
          if (params.length !== resolvedFunction.funcNode.params.length) {
            this.errorAndExit(
              `Mismatch between type and function implementation - type expects ${resolvedFunction.funcNode.params.length} parameter(s) but implementation has ${params.length}`
            );
          }
        }

        params.forEach((param, index) => {
          if (param.type === NodeTypeEnum.Operator && param.value === "=") {
            if (isCatchAll) {
              this.errorAndExit(
                "Cannot declare catch all parameter before other parameters"
              );
              return;
            }
            isDefault = true;
            this.generatedNodes.push(
              this.newNode(NodeTypeEnum.String, param.left.value)
            );

            const variableIndex = generator.variables.length;
            generator.variableMap[param.left.value] = variableIndex;
            generator.variables.push({ id: param.left.value, type: "let" });

            // insert param type into generator
            var paramType = this.newNode(NodeTypeEnum.Any);
            if (resolvedFunction.type === NodeTypeEnum.Function) {
              paramType = resolvedFunction.isType
                ? resolvedFunction.funcNode.params[index]
                : resolvedFunction.funcNode.paramTypes[param.left.value];
            }
            const defaultValueType = this.resolveType(param.right);
            if (!this.checkTypes(paramType, defaultValueType)) {
              this.errorAndExit(
                `TypeError: Expected parameter type ${this.typeRepr(
                  paramType
                )} but received type ${this.typeRepr(defaultValueType)}`
              );
              return;
            }
            generator.typeMap[param.left.value] = paramType;

            this.generateBytecode(param.right, false, captureIds);
            this.generatedNodes.push(this.newNode(NodeTypeEnum.DefaultParam));
          } else {
            if (isDefault) {
              this.errorAndExit(
                "Cannot declare non-default parameter after default parameters"
              );
              return;
            }
            if (
              param.type === NodeTypeEnum.Operator &&
              param.value === "unary..."
            ) {
              isCatchAll = true;
              if (param.right.type !== NodeTypeEnum.ID) {
                this.errorAndExit("Catch all param must be of an identifier");
                return;
              }
              const catchAllParam = this.newNode(NodeTypeEnum.CatchAllParam);
              catchAllParam.value = param.right.value;
              this.generatedNodes.push(catchAllParam);

              const variableIndex = generator.variables.length;
              generator.variableMap[param.right.value] = variableIndex;
              generator.variables.push({ id: param.right.value, type: "let" });
            } else {
              if (isCatchAll) {
                this.errorAndExit(
                  "Cannot declare catch all parameter before other parameters"
                );
                return;
              }
              this.generatedNodes.push(
                this.newNode(NodeTypeEnum.String, param.value)
              );

              // insert param type into generator
              if (resolvedFunction.type === NodeTypeEnum.Function) {
                if (resolvedFunction.isType) {
                  generator.typeMap[param.value] =
                    resolvedFunction.funcNode.params[index];
                } else {
                  generator.typeMap[param.value] =
                    resolvedFunction.funcNode.paramTypes[param.value];
                }
              } else {
                generator.typeMap[param.value] = this.newNode(NodeTypeEnum.Any);
              }

              const variableIndex = generator.variables.length;
              generator.variableMap[param.value] = variableIndex;
              generator.variables.push({ id: param.value, type: "let" });
            }
          }
        });
        if (node.meta?.name) {
          generator.typeMap[node.meta?.name] = resolvedFunction;
        }
        generator.expectedReturnType =
          resolvedFunction.funcNode?.body ?? this.newNode(NodeTypeEnum.Any);
        const fnByteCode = generator.generate(true);

        if (
          !this.checkTypes(generator.expectedReturnType, generator.returnType)
        ) {
          this.errorAndExit(
            `TypeError: Expected return type ${this.typeRepr(
              generator.expectedReturnType
            )} but received type ${this.typeRepr(generator.returnType)}`
          );
        }

        if (fnByteCode == -1) {
          this.hasError = true;
          return;
        }

        if (fnByteCode.at(-1)?.type === NodeTypeEnum.Pop) {
          fnByteCode.pop();
        }
        const fnNode = this.newNode(NodeTypeEnum.Function, fnByteCode);
        fnNode.funcNode = {
          params: undefined,
          body: undefined,
          originFilePath: this.filePath,
          closures: {},
          isCoroutine: generator.isCoroutine,
          variableMap: generator.variableMap,
        };
        fnNode.meta = {
          capturedIds: generator.capturedIds,
        };
        this.generatedNodes.push(
          this.newNode(NodeTypeEnum.Number, params.length)
        );
        if (node?.schema) {
          this.generateBytecode(node?.schema, false, captureIds);
        }
        this.generatedNodes.push(fnNode);
        return;
      }
      case NodeTypeEnum.Return: {
        this.generateBytecode(node.right, false, captureIds);
        this.generatedNodes.push(this.newNode(NodeTypeEnum.Return));
        // add return type
        const returnType = this.resolveType(node.right);
        if (this.returnType) {
          this.returnType = this.joinTypes(this.returnType, returnType);
        } else {
          this.returnType = returnType;
        }
        return;
      }
      case NodeTypeEnum.Yield: {
        this.generateBytecode(node.right, false, captureIds);
        this.generatedNodes.push(this.newNode(NodeTypeEnum.Yield));
        this.isCoroutine = true;
        // add return type
        const returnType = this.resolveType(node.right);
        if (this.returnType) {
          this.returnType = this.joinTypes(this.returnType, returnType);
        } else {
          this.returnType = returnType;
        }
        return;
      }
      case NodeTypeEnum.Break: {
        this.generatedNodes.push(this.newNode(NodeTypeEnum.Break));
        return;
      }
      case NodeTypeEnum.Continue: {
        this.generatedNodes.push(this.newNode(NodeTypeEnum.Continue));
        return;
      }
      case NodeTypeEnum.Eval: {
        this.generatedNodes.push(node);
        return;
      }
      case NodeTypeEnum.Import: {
        if (
          node.right.type === NodeTypeEnum.Operator &&
          node.right.value === ":"
        ) {
          const toImport = node.right.left;
          const importFrom = node.right.right;

          if (toImport.type === NodeTypeEnum.ID) {
            this.generatedNodes.push(
              this.newNode(NodeTypeEnum.String, toImport.value)
            );
            this.generateBytecode(importFrom, false, captureIds);
            this.generatedNodes.push(this.newNode(NodeTypeEnum.Import, 0));
          } else if (toImport.type === NodeTypeEnum.List) {
            const flattened = this.flattenChildren(toImport.node, [","]);
            flattened.forEach((e) => {
              if (e.type !== NodeTypeEnum.ID) {
                this.errorAndExit("Import list must contain IDs");
                return;
              }
              this.generatedNodes.push(
                this.newNode(NodeTypeEnum.String, e.value)
              );
            });
            this.generateBytecode(importFrom, false, captureIds);
            this.generatedNodes.push(
              this.newNode(NodeTypeEnum.Import, flattened.length)
            );
          }
          return;
        }
        // TODO: handle other cases like 'import string'
        return;
      }
      default: {
        this.generatedNodes.push(this.newNode());
        if (pop) {
          this.generatedNodes.push(this.newNode(NodeTypeEnum.Pop));
        }
        return;
      }
    }
  }

  public generate(captureIds = false) {
    while (this.node) {
      if (this.hasError) {
        this.returnType = this.newNode(NodeTypeEnum.Error);
        return -1;
      }
      const res = this.generateBytecode(this.node, true, captureIds);
      this.advance();
    }
    if (this.hasError) {
      this.returnType = this.newNode(NodeTypeEnum.Error);
      return -1;
    }
    const returnType = this.resolveType(this.nodes.at(-1));
    if (this.returnType) {
      this.returnType = this.joinTypes(this.returnType, returnType);
    } else {
      this.returnType = returnType;
    }
    return this.generatedNodes;
  }
}
