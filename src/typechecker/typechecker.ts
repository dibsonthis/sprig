import { Node, SymbolTable, NodeTypeEnum } from "../types";
import path from "path";

export class TypeChecker {
  private nodes: Node[];
  private node: Node;
  private index: number = 0;
  public filePath: string;

  public hasError = false;

  public typeMap: SymbolTable = {};
  public tempTypeMap: SymbolTable = {};
  public closureTypeMap: SymbolTable = {};
  public returnType: Node;
  public expectedReturnType: Node = this.newNode();
  public hasReturn: boolean;

  private typeRepr(node: Node) {
    var repr = "";
    var hasAlias = false;
    if (node.meta?.typeAlias) {
      hasAlias = true;
      repr += node.meta.typeAlias + ": (";
    }
    switch (node.type) {
      case NodeTypeEnum.Generic: {
        return node.value;
      }
      case NodeTypeEnum.CatchAllParam: {
        return `...${this.typeRepr(node.value)}`;
      }
      case NodeTypeEnum.TypeList: {
        repr += node.nodes?.map((node) => this.typeRepr(node)).join(" | ");
        break;
      }
      case NodeTypeEnum.List: {
        if (!node.nodes) {
          return "List";
        }
        repr +=
          "[" +
          node.nodes?.map((node) => this.typeRepr(node)).join(" | ") +
          "]";
        break;
      }
      case NodeTypeEnum.Function: {
        if (!node.funcNode) {
          repr += "Function";
          break;
        }
        if (node.meta?.name) {
          repr += node.meta.name + ": ";
        }
        repr += "(";
        repr += node.funcNode?.paramTypes
          .map((e) => this.typeRepr(e))
          .join(", ");
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
    var isAny = false;
    const res = nodes.reduce((acc, current) => {
      if (current.type === NodeTypeEnum.Any) {
        isAny = true;
      }
      const exists = acc.some((item) => this.checkTypes(item, current));
      if (!exists) acc.push(current);
      return acc;
    }, [] as Node[]);

    if (isAny) {
      return [this.newNode(NodeTypeEnum.Any)];
    }

    return res;
  }

  private getListType(node: Node) {
    if (node.node) {
      return node.node;
    }
    return node.nodes?.[0] ?? this.newNode(NodeTypeEnum.Any);
  }

  private getAbsoluteValueOfType(type: Node, value: Node) {
    var typeRes = type;
    var valueRes = value;
    while (typeRes.type === NodeTypeEnum.List) {
      typeRes = this.getListType(typeRes);
      valueRes = this.getListType(valueRes);
    }
    return { typeRes, valueRes };
  }

  private getAbsoluteType(node: Node) {
    var res = node;
    while (res.type === NodeTypeEnum.List) {
      res = this.getListType(res);
    }
    return res;
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
    if (newList.nodes.length === 1) {
      return newList.nodes[0];
    }
    return newList;
  }

  private mergeFunctionTypes(left: Node, right: Node) {
    if (left.type !== NodeTypeEnum.Function) {
      return this.newNode(NodeTypeEnum.Error);
    }
    if (right.type !== NodeTypeEnum.Function) {
      return this.newNode(NodeTypeEnum.Error);
    }
    if (left.funcNode.paramTypes.length !== left.funcNode.paramTypes.length) {
      this.errorAndExit(
        `Function type ${this.typeRepr(
          left
        )} is incompatible with type ${this.typeRepr(right)}`
      );
      return this.newNode(NodeTypeEnum.Error);
    }
    const newFunction = this.newNode(NodeTypeEnum.Function);
    newFunction.funcNode = {
      params: [],
      paramTypes: [],
      body: this.newNode(),
    };
    left.funcNode.paramTypes.forEach((leftParam, index) => {
      const rightParam = right.funcNode.paramTypes[index];
      const joinedParam = this.joinTypes(leftParam, rightParam);
      newFunction.funcNode.paramTypes.push(joinedParam);
      newFunction.funcNode.params.push(joinedParam);
    });

    newFunction.funcNode.body = this.joinTypes(
      left.funcNode.body,
      right.funcNode.body
    );
    return newFunction;
  }

  private matchArgsWithFunctionType(args: Node[], fn: Node) {
    if (fn.type !== NodeTypeEnum.Function) {
      return false;
    }

    if (!fn.funcNode) {
      return true;
    }

    const hasCatchAll =
      fn.funcNode.paramTypes.at(-1).type === NodeTypeEnum.CatchAllParam;

    var paramsLength = hasCatchAll
      ? fn.funcNode.paramTypes.length - 1
      : fn.funcNode.paramTypes.length;

    paramsLength -= fn.funcNode.paramReqs.filter(Boolean).length;

    if (args.length < paramsLength) {
      return false;
    }

    for (const [index, arg] of args.entries()) {
      const fnParam = fn.funcNode.paramTypes[index];

      if (!fnParam) {
        return false;
      }

      if (fnParam.type === NodeTypeEnum.CatchAllParam) {
        for (let i = index; i < args.length; i++) {
          const _arg = args[i];
          if (!this.checkTypes(fnParam.value, _arg)) {
            return false;
          }
        }
        return true;
      }

      if (!this.checkTypes(fnParam, arg)) {
        return false;
      }
    }

    return true;
  }

  private resolveType(node: Node): Node {
    switch (node.type) {
      case NodeTypeEnum.Paren: {
        return this.resolveType(node.node);
      }
      case NodeTypeEnum.ID: {
        if (node.value === "Any") {
          return this.newNode(NodeTypeEnum.Any);
        }
        if (this.tempTypeMap.hasOwnProperty(node.value)) {
          return this.tempTypeMap[node.value].node;
        }
        if (this.typeMap.hasOwnProperty(node.value)) {
          return this.typeMap[node.value].node;
        }
        if (this.closureTypeMap.hasOwnProperty(node.value)) {
          return this.closureTypeMap[node.value].node;
        }
        const generic = this.newNode(NodeTypeEnum.Generic, node.value);
        generic.isGeneric = true;
        return generic;
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
        if (node.value === "Function") {
          return this.newNode(NodeTypeEnum.Function);
        }
        if (node.value === "Error") {
          return this.newNode(NodeTypeEnum.Error);
        }
        if (node.value === "Undefined") {
          return this.newNode();
        }
        return node;
      }
      case NodeTypeEnum.Number:
      case NodeTypeEnum.Boolean:
      case NodeTypeEnum.TypeList:
      case NodeTypeEnum.Undefined: {
        return node;
      }
      case NodeTypeEnum.FunctionCall: {
        return this.resolveValueType(node);
      }
      case NodeTypeEnum.Function: {
        const funcNode = this.newNode(NodeTypeEnum.Function);
        funcNode.isType = true;
        funcNode.funcNode = {
          params: [],
          paramTypes: [],
          paramReqs: [],
          body: this.newNode(),
          name: node.meta?.name,
        };
        funcNode.value = node;

        this.flattenChildren(node.left?.node, [","]).forEach((param) => {
          var isOptional = false;
          if (
            param.type === NodeTypeEnum.Operator &&
            param.value === "unary!"
          ) {
            isOptional = true;
            param = param.right;
          }
          if (param.type === NodeTypeEnum.Operator && param.value === "=") {
            const paramName = param.left.value;
            const paramType = this.resolveType(param.right);
            funcNode.funcNode.paramTypes.push(paramType);
            funcNode.funcNode.params.push(paramName);
            funcNode.funcNode.paramReqs.push(isOptional);
          } else if (
            param.type === NodeTypeEnum.Operator &&
            param.value === "unary..."
          ) {
            const paramType = this.newNode(NodeTypeEnum.CatchAllParam);
            paramType.value = this.resolveType(param.right);
            funcNode.funcNode.paramTypes.push(paramType);
            funcNode.funcNode.params.push(paramType);
          } else {
            const paramName = param.value;
            const paramType = this.resolveType(param);
            funcNode.funcNode.paramTypes.push(paramType);
            funcNode.funcNode.params.push(paramName);
            funcNode.funcNode.paramReqs.push(isOptional);
            if (paramType.type === NodeTypeEnum.Generic) {
              funcNode.isGeneric = true;
            }
          }
        });

        funcNode.funcNode.body = this.resolveType(
          node.right ?? this.newNode(NodeTypeEnum.Any)
        );

        return funcNode;
      }
      case NodeTypeEnum.Operator: {
        const left = this.resolveType(node.left);
        const right = this.resolveType(node.right);

        if (node.value === "|") {
          var types = this.flattenChildren(node, ["|"]) as Node[];
          const typeOptionsList = this.newNode(NodeTypeEnum.TypeList);
          typeOptionsList.nodes = this.removeDuplicateTypes(
            types.map((e) => this.resolveType(e))
          );
          return typeOptionsList;
        }

        return this.newNode(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.List: {
        const typeList = this.newNode(NodeTypeEnum.List);
        if (node.node) {
          const elem = this.resolveType(node.node);
          typeList.nodes = [elem];
          if (elem.isGeneric) {
            typeList.isGeneric = true;
          }
          return typeList;
        }
        var types = this.removeDuplicateTypes(
          node.nodes?.map((e) => {
            const elem = this.resolveType(e);
            if (elem.isGeneric) {
              typeList.isGeneric = true;
            }
            return elem;
          })
        );
        typeList.nodes = types;
        typeList.meta = node.meta;
        return typeList;
      }
      default: {
        return this.newNode(NodeTypeEnum.Any);
      }
    }
  }

  private resolveValueType(node: Node): Node {
    if (!node) {
      return this.newNode(NodeTypeEnum.Any);
    }
    switch (node.type) {
      case NodeTypeEnum.Paren: {
        return this.resolveValueType(node.node);
      }
      case NodeTypeEnum.Eval: {
        return this.newNode(NodeTypeEnum.String);
      }
      case NodeTypeEnum.Decl: {
        const valueType = this.resolveValueType(node.declNode.value);
        if (this.typeMap.hasOwnProperty(node.declNode.id.value)) {
          const type = this.resolveType(node.declNode.id);
          if (node.value === "let") {
            this.typeMap[node.declNode.id.value].node = valueType;
          } else {
            if (!this.checkTypes(type, valueType)) {
              this.errorAndExit(
                `TypeError: Expected type ${this.typeRepr(
                  type
                )} but received type ${this.typeRepr(valueType)}`
              );
              return this.newNode(NodeTypeEnum.Error);
            }
          }
          // if (valueType.type === NodeTypeEnum.Function) {
          //   this.typeMap[node.declNode.id.value].node.value =
          //     node.declNode.value;
          // }
        } else {
          this.typeMap[node.declNode.id.value] = {
            node: this.resolveValueType(node.declNode.value),
            const: node.value === "const",
            canChange: node.value === "let",
          };
          if (valueType.type === NodeTypeEnum.Function) {
            this.typeMap[node.declNode.id.value].node.value =
              node.declNode.value;
          }
        }
        return valueType;
      }
      case NodeTypeEnum.Block: {
        // in order to scope this, we'll create a new typechecker
        const typechecker = new TypeChecker(node.nodes, this.filePath);
        typechecker.typeMap = { ...this.typeMap };
        typechecker.tempTypeMap = { ...this.tempTypeMap };
        typechecker.closureTypeMap = { ...this.closureTypeMap };
        const res = typechecker.run();
        if (res === -1) {
          this.hasError = true;
          return this.newNode(NodeTypeEnum.Error);
        }
        return typechecker.returnType;
      }
      case NodeTypeEnum.ID: {
        if (this.tempTypeMap.hasOwnProperty(node.value)) {
          return this.tempTypeMap[node.value].node;
        }
        if (this.typeMap.hasOwnProperty(node.value)) {
          return this.typeMap[node.value].node;
        }
        if (this.closureTypeMap.hasOwnProperty(node.value)) {
          return this.closureTypeMap[node.value].node;
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
        if (node.value === "Function") {
          return this.newNode(NodeTypeEnum.Function);
        }
        if (node.value === "Error") {
          return this.newNode(NodeTypeEnum.Error);
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
        if (node.evaluated) {
          return node;
        }
        const funcNode = this.newNode(NodeTypeEnum.Function);
        funcNode.isType = true;
        funcNode.funcNode = {
          params: [],
          paramTypes: [],
          paramReqs: [],
          body: this.newNode(),
          name: node.meta?.name,
        };
        funcNode.value = node;
        funcNode.evaluated = true;

        const paramNames = [];

        const tc = new TypeChecker([node.right], this.filePath);

        this.flattenChildren(node.left?.node, [","]).forEach((param, index) => {
          param.isType = node.isType;
          var isOptional = false;
          if (
            param.type === NodeTypeEnum.Operator &&
            param.value === "unary!"
          ) {
            isOptional = true;
            param = param.right;
          }
          if (param.type === NodeTypeEnum.Operator && param.value === "=") {
            const paramName = param.left.value;
            const paramType = this.resolveValueType(param.right);
            // this.tempTypeMap[paramName] = { node: paramType, const: true };
            tc.typeMap[paramName] = { node: paramType, const: true };
            paramNames.push(paramName);
            funcNode.funcNode.paramTypes.push(paramType);
            funcNode.funcNode.params.push(paramName);
            funcNode.funcNode.paramReqs.push(isOptional);
          } else if (
            param.type === NodeTypeEnum.Operator &&
            param.value === "unary..."
          ) {
            const paramName = param.right.value;
            const paramType = this.newNode(NodeTypeEnum.CatchAllParam);
            paramType.value = this.newNode(NodeTypeEnum.Any);
            funcNode.funcNode.paramTypes.push(paramType);
            funcNode.funcNode.params.push(paramName);
            // this.tempTypeMap[paramName] = { node: paramType, const: true };
            tc.typeMap[paramName] = { node: paramType, const: true };
            paramNames.push(paramName);
          } else {
            const paramName = param.value;
            var paramType = this.resolveValueType(param);
            if (
              paramType.type === NodeTypeEnum.Generic ||
              paramType.type === NodeTypeEnum.Any
            ) {
              // we look for the generic typename and change it
              const fnType = this.typeMap[node.meta?.name]?.node;
              const resolvedParam =
                fnType?.funcNode?.paramTypes?.[index] ?? paramType;
              paramType = resolvedParam;
            }
            // this.tempTypeMap[paramName] = { node: paramType, const: true };
            tc.typeMap[paramName] = { node: paramType, const: true };
            paramNames.push(paramName);
            funcNode.funcNode.paramTypes.push(paramType);
            funcNode.funcNode.params.push(paramName);
            funcNode.funcNode.paramReqs.push(isOptional);
            if (
              paramType.type === NodeTypeEnum.Generic ||
              paramType.type === NodeTypeEnum.Any
            ) {
              funcNode.isGeneric = true;
            }
          }
        });

        tc.run();

        funcNode.funcNode.body = tc.returnType;

        // funcNode.funcNode.body = this.resolveValueType(
        //   node.right ?? this.newNode()
        // );

        // for (const param of paramNames) {
        //   delete this.tempTypeMap[param];
        // }

        return funcNode;
      }
      case NodeTypeEnum.FunctionCall: {
        if (node.left.type === NodeTypeEnum.ID) {
          const resolved = this.resolveValueType(node.left);
          var fn = resolved;

          const args: Node[] = this.flattenChildren(node.right.node, [","]).map(
            (e) => this.resolveValueType(e)
          );

          // if (node.left.value === "append") {
          //   if (args.length !== 2) {
          //     this.errorAndExit(
          //       "Builtin function 'append' expects 2 arguments: [List, Any]"
          //     );
          //     return this.newNode(NodeTypeEnum.Error);
          //   }
          //   const listType = this.getListType(args[0]);
          // }

          if (fn.type === NodeTypeEnum.Any) {
            return fn;
          }

          if (fn.type === NodeTypeEnum.TypeList) {
            fn = fn.nodes.find((e: Node) =>
              this.matchArgsWithFunctionType(args, e)
            );
          }

          if (!fn) {
            this.errorAndExit(
              `No function type exists for arguments: ${node.left.value}(${args
                .map((arg) => this.typeRepr(arg))
                .join(", ")})\nFound following types: ${resolved.nodes
                ?.map((fn) => this.typeRepr(fn))
                .join("\n")}`,
              node
            );
            return this.newNode(NodeTypeEnum.Error);
          }

          if (!this.matchArgsWithFunctionType(args, fn)) {
            this.errorAndExit(
              `No function type exists for arguments: ${node.left.value}(${args
                .map((arg) => this.typeRepr(arg))
                .join(", ")})\nFound following type: ${this.typeRepr(fn)}`,
              node
            );
            return this.newNode(NodeTypeEnum.Error);
          }

          if (fn.isGeneric && fn.value) {
            // we need to evaluate this function with the correct types
            const params = this.flattenChildren(fn.value.left.node, [","]);
            const body = fn.value.right;
            const typechecker = new TypeChecker([body], this.filePath);
            typechecker.closureTypeMap = {
              ...this.typeMap,
            };
            // since it's a generic, it will recurse forever if called within itself
            // so we send in a non-generic Function
            const nonGeneric = this.newNode(NodeTypeEnum.Function);
            nonGeneric.funcNode = fn.funcNode;
            nonGeneric.isGeneric = false;
            typechecker.typeMap[node.left.value] = {
              node: nonGeneric,
              const: true,
            };
            params.forEach((param: Node, index) => {
              var { typeRes: absoluteParam, valueRes: absoluteType } =
                this.getAbsoluteValueOfType(param, args[index]);
              // const absoluteParam = this.getAbsoluteType(param);
              // var absoluteType = this.getAbsoluteType(args[index]);
              if (param.type === NodeTypeEnum.ID) {
                absoluteType = args[index];
              }
              // if it already exists, we check the types to make sure
              // it's the same
              if (typechecker.typeMap.hasOwnProperty(absoluteParam.value)) {
                const existingType =
                  typechecker.typeMap[absoluteParam.value].node;
                if (!this.checkTypes(existingType, absoluteType)) {
                  this.errorAndExit(
                    `TypeError: Type ${absoluteParam.value} (${this.typeRepr(
                      existingType
                    )}) cannot be assigned a value of type ${this.typeRepr(
                      absoluteType
                    )}`
                  );
                  return this.newNode(NodeTypeEnum.Error);
                }
              }

              typechecker.typeMap[absoluteParam.value] = {
                node: absoluteType,
                const: true,
              };
            });

            if (typechecker.run() === -1) {
              this.hasError = true;
              return this.newNode(NodeTypeEnum.Error);
            }

            return typechecker.returnType;
          }

          return fn.funcNode?.body ?? this.newNode(NodeTypeEnum.Any);
        }
        return this.newNode(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.Operator: {
        const left = this.resolveValueType(node.left);

        if (node.value === "else") {
          if (node.right.type === NodeTypeEnum.IfStatement) {
            return this.resolveValueType(node.right);
          }

          for (const expr of node.right.nodes) {
            this.resolveValueType(expr);
          }
          return this.newNode();
        }

        const right = this.resolveValueType(node.right);

        if (left.type === NodeTypeEnum.Any || right.type === NodeTypeEnum.Any) {
          return this.newNode(NodeTypeEnum.Any);
        }

        if (node.value === "=") {
          if (node.left.type === NodeTypeEnum.ID) {
            const type = this.resolveType(node.left);
            const valueType = this.resolveValueType(node.right);
            var canChange = this.typeMap[node.left.value].canChange;
            if (canChange) {
              this.typeMap[node.left.value].node = valueType;
            } else {
              if (!this.checkTypes(type, valueType)) {
                this.errorAndExit(
                  `TypeError: Expected type ${this.typeRepr(
                    type
                  )} but received type ${this.typeRepr(valueType)}`
                );
                return this.newNode(NodeTypeEnum.Error);
              }
            }
            return valueType;
          }
        }

        if (node.value === "||") {
          var types = this.flattenChildren(node, ["||"]) as Node[];
          const typeOptionsList = this.newNode(NodeTypeEnum.TypeList);
          typeOptionsList.nodes = this.removeDuplicateTypes(
            types.map((e) => this.resolveValueType(e))
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

          // todo: Objects

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
          const leftStatement = this.resolveValueType(node.right.left);
          const rightStatement = this.resolveValueType(node.right.right);
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
            this.resolveValueType(e)
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
      case NodeTypeEnum.List: {
        const typeList = this.newNode(NodeTypeEnum.List);
        if (node.node) {
          const elem = this.resolveValueType(node.node);
          typeList.nodes = [elem];
          return typeList;
        }
        var types = this.removeDuplicateTypes(
          node.nodes?.map((e) => {
            const elem = this.resolveValueType(e);
            return elem;
          })
        );
        typeList.nodes = types;
        typeList.meta = node.meta;
        return typeList;
      }
      case NodeTypeEnum.IfStatement: {
        const statement = this.resolveValueType(node.left);
        if (statement.type === NodeTypeEnum.Error) {
          return this.newNode(NodeTypeEnum.Error);
        }
        for (const expr of node.right.nodes) {
          this.resolveValueType(expr);
        }
        return this.newNode();
      }
      case NodeTypeEnum.Accessor: {
        const toAccess = this.resolveValueType(node.left);
        const accessor = this.resolveValueType(node.right);
        if (
          toAccess.type === NodeTypeEnum.List &&
          accessor.type === NodeTypeEnum.List
        ) {
          const listType = this.getListType(toAccess);
          const accessorType = this.getListType(accessor);
          if (
            accessorType.type !== NodeTypeEnum.Number &&
            accessorType.type !== NodeTypeEnum.Any
          ) {
            this.errorAndExit("List accessor must be a number");
            return this.newNode(NodeTypeEnum.Error);
          }
          return listType;
        }
        // todo: objects
        return this.newNode(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.ForStatement: {
        const sections: Node[] = this.flattenChildren(node.left.node, [","]);
        if (sections.length === 0) {
          this.errorAndExit("TypeError: For loop cannot be empty");
          return this.newNode(NodeTypeEnum.Error);
        }
        var _valueName;
        var _indexName;
        const arr = this.resolveValueType(sections[0]);
        if (arr.type !== NodeTypeEnum.List && arr.type !== NodeTypeEnum.Any) {
          this.errorAndExit(
            `TypeError: For loop expects value of type List but received value of type ${this.typeRepr(
              arr
            )}`
          );
          return this.newNode(NodeTypeEnum.Error);
        }
        if (sections.length > 1) {
          const valueName = sections[1].value;
          const valueType = this.getListType(arr);
          this.tempTypeMap[valueName] = { node: valueType, const: true };
          _valueName = valueName;
        }
        if (sections.length > 2) {
          const indexName = sections[1].index;
          const indexType = this.newNode(NodeTypeEnum.Number);
          this.tempTypeMap[indexName] = { node: indexType, const: true };
          _indexName = indexName;
        }
        for (const expr of node.right.nodes) {
          this.resolveValueType(expr);
        }

        _valueName && delete this.tempTypeMap[_valueName];
        _indexName && delete this.tempTypeMap[_indexName];

        return this.newNode();
      }
      case NodeTypeEnum.Return: {
        const returnType = this.resolveValueType(node.right);
        if (this.returnType) {
          this.returnType = this.joinTypes(this.returnType, returnType);
        } else {
          this.returnType = returnType;
        }
        return returnType;
      }
      // todo: Objects etc.
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
      type.type === NodeTypeEnum.Generic &&
      valueType.type === NodeTypeEnum.Generic
    ) {
      return type.value === valueType.value;
    }

    if (type.type === NodeTypeEnum.Generic) {
      return true;
    }

    // if (
    //   type.type === NodeTypeEnum.Generic &&
    //   ![NodeTypeEnum.List, NodeTypeEnum.Object].includes(valueType.type)
    // ) {
    //   return true;
    // }

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
        valueType.nodes?.[0] ?? this.newNode(NodeTypeEnum.Any)
      );
      return check;
    }

    if (
      type.type === NodeTypeEnum.Function &&
      valueType.type === NodeTypeEnum.Function
    ) {
      if (!type.funcNode) {
        return true;
      }
      if (!valueType.funcNode) {
        return true;
      }
      if (type.funcNode.params.length !== valueType.funcNode.params.length) {
        return false;
      }
      type.funcNode.paramTypes.forEach((param, index) => {
        if (!this.checkTypes(param, valueType.funcNode.paramTypes[index])) {
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

  public typecheck(node: Node) {
    if (node.type === NodeTypeEnum.Operator && node.value === "::") {
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
      this.typeMap[id] = { node: type, const: true };
      return this.newNode();
    } else {
      return this.resolveValueType(node);
    }
  }

  public run() {
    while (this.node) {
      // if (this.hasError) {
      //   this.returnType = this.newNode(NodeTypeEnum.Error);
      //   return -1;
      // }
      const res = this.typecheck(this.node);
      if (!res || res.type === NodeTypeEnum.Error) {
        return -1;
      }
      if (this.index === this.nodes.length - 1) {
        if (this.returnType) {
          this.returnType = this.joinTypes(this.returnType, res);
        } else {
          this.returnType = res;
        }
      }
      this.advance();
    }
    if (this.hasError) {
      this.returnType = this.newNode(NodeTypeEnum.Error);
      return -1;
    }
    // const returnType = this.resolveValueType(this.nodes.at(-1));
    // if (returnType.type === NodeTypeEnum.Error) {
    //   return -1;
    // }
    // if (this.returnType) {
    //   this.returnType = this.joinTypes(this.returnType, returnType);
    // } else {
    //   this.returnType = returnType;
    // }
    return this.typeMap;
  }
}
