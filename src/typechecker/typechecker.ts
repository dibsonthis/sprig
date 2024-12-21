import {
  Node,
  SymbolTable,
  NodeTypeEnum,
  TypeTable,
  Type,
  newType,
} from "../types";
import path from "path";

export class TypeChecker {
  private nodes: Node[];
  private node: Node;
  private index: number = 0;
  public filePath: string;

  public hasError = false;

  public typeMap: Record<string, Type> = {};
  public tempTypeMap: Record<string, Type> = {};
  public closureTypeMap: Record<string, Type> = {};
  public genericNamesToClear: string[] = [];
  public returnType: Type;
  public expectedReturnType: Type;
  public hasReturn: boolean;

  public inTypeLand: boolean;

  private typeRepr(type: Type) {
    var repr = "";
    var hasAlias = false;
    if (type.typeAlias) {
      hasAlias = true;
      repr += type.typeAlias + ": (";
    }
    switch (type.type) {
      case NodeTypeEnum.Generic: {
        if (type.genericValue.extention) {
          return (
            type.genericValue.value +
            " && " +
            this.typeRepr(type.genericValue.extention)
          );
        }
        return type.genericValue.value;
      }
      // case NodeTypeEnum.CatchAllParam: {
      //   return `...${this.typeRepr(node.value)}`;
      // }
      case NodeTypeEnum.TypeList: {
        repr += type.typeListValue.values
          ?.map((elem) => this.typeRepr(elem))
          .join(" | ");
        break;
      }
      case NodeTypeEnum.List: {
        if (!type.listValue) {
          return "List";
        }
        repr += "[" + this.typeRepr(type.listValue.value) + "]";
        break;
      }
      case NodeTypeEnum.Function: {
        if (!type.functionValue || !Object.keys(type.functionValue).length) {
          repr += "Function";
          break;
        }
        if (type.functionValue.name) {
          repr += type.functionValue.name + ": ";
        }
        repr += "(";
        repr += type.functionValue.paramTypes
          .map((e, i) => {
            if (type.functionValue.paramCatchAll[i]) {
              return "..." + this.typeRepr(e);
            }
            return this.typeRepr(e);
          })
          .join(", ");
        repr += ") => ";
        repr += this.typeRepr(type.functionValue.returnType);
        break;
      }
      // case NodeTypeEnum.FunctionCall: {
      //   const fnName = node.left.value;
      //   const arg = this.resolveType(node.right);
      //   repr += fnName + `(${this.typeRepr(arg)})`;
      //   break;
      // }
      case NodeTypeEnum.Object: {
        if (!type.objectValue) {
          repr += "Object";
          return repr;
        }
        var repr = "{ ";
        const keys = Object.keys(type.objectValue.value);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          let value = type.objectValue.value[key];

          if (value?.type === NodeTypeEnum.String) {
            repr += `${key}: ${this.typeRepr(value)}`;
          } else {
            if (value == type) {
              repr += "{...}";
            } else {
              repr += `${key}: ${this.typeRepr(value)}`;
            }
          }
          if (i < keys.length - 1) {
            repr += ", ";
          }
        }
        repr += " }";
        return repr;
      }
      default: {
        repr += NodeTypeEnum[type.type];
        break;
      }
    }

    if (hasAlias) {
      repr += ")";
    }

    return repr;
  }

  private excludeTypes(nodes: Type[], toExclude: Type) {
    const typeList = newType(NodeTypeEnum.TypeList);
    var isAny = false;
    typeList.typeListValue.values = this.removeDuplicateTypes(
      nodes.reduce((acc, current) => {
        if (current.type === NodeTypeEnum.Any) {
          isAny = true;
        }
        const generic = current.type === NodeTypeEnum.Generic;
        const exists = !generic && this.checkTypes(toExclude, current);
        if (!exists) acc.push(current);
        return acc;
      }, [] as Type[])
    );

    return typeList;
  }

  private removeDuplicateTypes(nodes: Type[]) {
    if (!nodes) {
      return [];
    }
    var isAny = false;
    const res = nodes.reduce((acc, current) => {
      if (current.type === NodeTypeEnum.Any) {
        isAny = true;
      }
      const generic = current.type === NodeTypeEnum.Generic;
      var exists =
        !generic &&
        acc.some(
          (item) =>
            item.type !== NodeTypeEnum.Generic && this.checkTypes(item, current)
        );
      if (
        generic &&
        acc.some(
          (item) => item.genericValue?.value === current.genericValue.value
        )
      ) {
        exists = true;
      }
      if (!exists) acc.push(current);
      return acc;
    }, [] as Type[]);

    if (isAny) {
      return [newType(NodeTypeEnum.Any)];
    }

    return res;
  }

  private getAbsoluteValueOfType(type: Type, value: Type) {
    var typeRes = type;
    var valueRes = value;
    while (
      typeRes.type === NodeTypeEnum.List &&
      valueRes.type === NodeTypeEnum.List
    ) {
      typeRes = typeRes.listValue.value;
      valueRes = valueRes.listValue.value;
      // if (valueRes.type === NodeTypeEnum.List) {
      //   valueRes = valueRes.listValue.value;
      // }
    }
    return { typeRes, valueRes };
  }

  private joinTypes(left: Type, right: Type) {
    const newList = newType(NodeTypeEnum.TypeList);
    newList.typeListValue.values = [];

    if (left.type === NodeTypeEnum.TypeList) {
      newList.typeListValue.values = [
        ...newList.typeListValue.values,
        ...left.typeListValue.values,
      ];
    } else {
      newList.typeListValue.values = [...newList.typeListValue.values, left];
    }
    if (right.type === NodeTypeEnum.TypeList) {
      newList.typeListValue.values = [
        ...newList.typeListValue.values,
        ...right.typeListValue.values,
      ];
    } else {
      newList.typeListValue.values = [...newList.typeListValue.values, right];
    }
    newList.typeListValue.values = this.removeDuplicateTypes(
      newList.typeListValue.values
    );
    if (newList.typeListValue.values.length === 1) {
      return newList.typeListValue.values[0];
    }
    return newList;
  }

  private matchArgsWithFunctionType(args: Type[], fn: Type) {
    if (fn.type !== NodeTypeEnum.Function) {
      return false;
    }

    if (!fn.functionValue) {
      return true;
    }

    // const hasCatchAll =
    //   fn.functionValue.paramTypes.at(-1)?.type === NodeTypeEnum.CatchAllParam;
    const hasCatchAll = fn.functionValue.paramCatchAll.some((e) => e);

    var paramsLength = hasCatchAll
      ? fn.functionValue.paramTypes.length - 1
      : fn.functionValue.paramTypes.length;

    paramsLength -= fn.functionValue.paramOptionality.filter(Boolean).length;

    const defaultsLength = fn.functionValue.paramDefaultTypes?.length ?? 0;

    if (defaultsLength) {
      const diff = paramsLength - args.length;
      for (let i = defaultsLength - diff; i < defaultsLength; i++) {
        args.push(fn.functionValue.paramDefaultTypes[i] ?? this.newNode());
      }
    }

    if (args.length < paramsLength) {
      return false;
    }

    const realFunction = fn.functionValue.implementation
      ? this.resolveValueType(fn.functionValue.implementation)
      : fn;

    for (const [index, arg] of args.entries()) {
      const paramName = fn.functionValue.paramNames[index];
      const fnParam = fn.functionValue.paramTypes[index];
      const fnParamIsCatchAll = fn.functionValue.paramCatchAll[index];

      if (!fnParam) {
        return false;
      }

      if (fnParam)
        if (fnParamIsCatchAll) {
          for (let i = index; i < args.length; i++) {
            const _arg = args[i];
            if (!this.checkTypes(fnParam, _arg)) {
              return false;
            }
          }
          return true;
        }

      if (!this.checkTypes(fnParam, arg)) {
        return false;
      }

      if (fnParam.type === NodeTypeEnum.Function) {
        // fn.functionValue.implementation = arg.functionValue.implementation;
        fn.functionValue.paramTypes[index].functionValue.implementation =
          arg.functionValue.value;
        // fn.funcNode.paramTypes[index].funcNode.implementation.funcNode.body =
        //   arg.funcNode.body;
      }

      if (paramName !== realFunction.functionValue.paramNames[index]) {
        fn.functionValue.paramNames[index] =
          realFunction.functionValue.paramNames[index];
      }
    }

    return true;
  }

  private tcFunctionCall(node: Node, asValueType: boolean = false) {
    const resolve: (node: Node) => Type = asValueType
      ? this.resolveValueType.bind(this)
      : this.resolveType.bind(this);

    var func: Type = resolve(node.left);

    if (func.type === NodeTypeEnum.Any) {
      func = newType(NodeTypeEnum.Function);
      func.functionValue = {
        paramCatchAll: [true],
        paramNames: ["_"],
        paramDefaultTypes: [],
        paramOptionality: [],
        paramTypes: [newType(NodeTypeEnum.Any)],
        returnType: newType(NodeTypeEnum.Any),
      };
      // return func;
    }

    const rawArgs: Node[] = this.flattenChildren(node.right.node, [","]);
    const sortedArgs: Type[] = [];

    rawArgs.forEach((arg, index) => {
      if (!arg) {
        // do nothing
      } else if (arg.type === NodeTypeEnum.Operator && arg.value === ":") {
        const name = arg.left;
        const value = resolve(arg.right);
        const paramIndex = func.functionValue.paramNames?.findIndex(
          (paramName) => paramName === name.value
        );
        paramIndex !== undefined && (sortedArgs[paramIndex] = value);
      } else {
        const value = resolve(arg);
        sortedArgs[index] = value;
      }
    });

    if (func.type === NodeTypeEnum.TypeList) {
      this.errorAndExit(
        "Functions can only have one implementation and therefore only one type"
      );
    }

    if (func.type !== NodeTypeEnum.Function) {
      this.errorAndExit(`TypeError: ${this.typeRepr(func)} is not callable`);
    }

    if (!this.matchArgsWithFunctionType(sortedArgs, func)) {
      this.errorAndExit(
        `No function type exists for arguments: (${sortedArgs
          .map((arg) => this.typeRepr(arg))
          .join(", ")})\nFound following type: ${this.typeRepr(func)}`,
        node
      );
    }

    if (func.functionValue?.returnType?.isGeneric) {
      func.isGeneric = true;
    }

    if (!func.isGeneric && !func.functionValue?.implementation) {
      return func.functionValue.returnType;
    }

    var fnBody = func.functionValue.implementation
      ? func.functionValue.implementation.right
      : func.functionValue.value.right;

    const tc = new TypeChecker([fnBody], this.filePath);

    tc.typeMap = { ...this.typeMap };
    this.genericNamesToClear.forEach((key) => {
      delete tc.typeMap[key];
    });

    // We get the real function here, so that we can change the param names
    // If they're different to the type
    const realFunction = func.functionValue.implementation
      ? this.resolveValueType(func.functionValue.implementation)
      : func;

    func.functionValue.paramTypes.forEach((paramType, index) => {
      var paramName = func.functionValue.paramNames[index];
      var value = sortedArgs[index];
      if (paramName) {
        // We change the param names if the type and implementation
        // are different
        if (paramName !== realFunction.functionValue.paramNames[index]) {
          paramName = realFunction.functionValue.paramNames[index];
        }
        if (paramType.type === NodeTypeEnum.Function) {
          tc.typeMap[paramName] = paramType;
        } else {
          tc.typeMap[paramName] = value;
        }
      }
      if (paramType.isGeneric || paramType.type === NodeTypeEnum.Generic) {
        const absolutes = this.getAbsoluteValueOfType(paramType, value);
        // If a generic has been defined already, we typecheck it
        if (
          absolutes.typeRes.type === NodeTypeEnum.Generic &&
          tc.typeMap[absolutes.typeRes.genericValue.value]
        ) {
          const existingGeneric =
            tc.typeMap[absolutes.typeRes.genericValue.value];
          const check = tc.checkTypes(existingGeneric, absolutes.valueRes);
          if (!check) {
            this.errorAndExit(
              `TypeError: Mismatch in type of parameter "${paramName}" - Type ${this.typeRepr(
                absolutes.valueRes
              )} is not assignable to type ${
                absolutes.typeRes.genericValue.value
              } (${this.typeRepr(existingGeneric)})`
            );
          }
        } else if (absolutes.typeRes.type === NodeTypeEnum.Generic) {
          tc.typeMap[absolutes.typeRes.genericValue.value] = absolutes.valueRes;
          tc.genericNamesToClear.push(absolutes.typeRes.genericValue.value);
        }
      }
    });

    var expectedReturnType = func.functionValue.returnType;

    // If a function doesn't have an implementation, it doesn't need to run
    // We can just use the tc context to resolve the expected return type, and return that

    if (!func.functionValue.implementation) {
      return tc.resolveType(func.functionValue.value.right);
    }

    tc.run();

    if (expectedReturnType) {
      if (expectedReturnType.isGeneric) {
        expectedReturnType = tc.resolveType(func.functionValue.value.right);
      }
      const check = this.checkTypes(expectedReturnType, tc.returnType);
      if (!check) {
        this.errorAndExit(
          `TypeError: Defined return type is ${this.typeRepr(
            expectedReturnType
          )} but function returns ${this.typeRepr(tc.returnType)}`
        );
      }
    }

    return tc.returnType;
  }

  private resolveType(node: Node): Type {
    switch (node.type) {
      case NodeTypeEnum.Paren: {
        return this.resolveType(node.node);
      }
      case NodeTypeEnum.Generic:
      case NodeTypeEnum.ID: {
        if (node.value === "Any") {
          return newType(NodeTypeEnum.Any);
        }
        if (this.tempTypeMap.hasOwnProperty(node.value)) {
          return this.tempTypeMap[node.value];
        }
        if (this.typeMap.hasOwnProperty(node.value)) {
          return this.typeMap[node.value];
        }
        if (this.closureTypeMap.hasOwnProperty(node.value)) {
          return this.closureTypeMap[node.value];
        }
        const generic = newType(NodeTypeEnum.Generic, { value: node.value });
        generic.isGeneric = true;
        return generic;
      }
      case NodeTypeEnum.String: {
        if (node.value === "Number") {
          return newType(NodeTypeEnum.Number);
        }
        if (node.value === "Boolean") {
          return newType(NodeTypeEnum.Boolean);
        }
        if (node.value === "List") {
          return newType(NodeTypeEnum.List);
        }
        if (node.value === "Object") {
          return newType(NodeTypeEnum.Object);
        }
        if (node.value === "Raw") {
          return newType(NodeTypeEnum.Raw);
        }
        if (node.value === "Function") {
          return newType(NodeTypeEnum.Function);
        }
        if (node.value === "Error") {
          return newType(NodeTypeEnum.Error);
        }
        if (node.value === "Native") {
          return newType(NodeTypeEnum.Native);
        }
        if (node.value === "Undefined") {
          return newType();
        }
        const stringType = newType(NodeTypeEnum.String, {
          value: node.value as string,
        });
        return stringType;
      }
      case NodeTypeEnum.Number: {
        const numberType = newType(NodeTypeEnum.Number, {
          value: node.value as number,
        });
        return numberType;
      }
      case NodeTypeEnum.Boolean: {
        const booleanType = newType(NodeTypeEnum.Boolean, {
          value: node.value as boolean,
        });
        return booleanType;
      }
      case NodeTypeEnum.Undefined: {
        return newType();
      }
      case NodeTypeEnum.TypeList: {
        if (node.node) {
          return this.resolveType(node.node);
        }
        const typeList = newType(NodeTypeEnum.TypeList);
        typeList.typeListValue.values = this.removeDuplicateTypes(
          node.nodes.map((elem) => {
            const resolvedElem = this.resolveType(elem);
            if (resolvedElem.isGeneric) {
              typeList.isGeneric = true;
            }
            return resolvedElem;
          })
        );
        return typeList;
      }
      case NodeTypeEnum.FunctionCall: {
        if (node.left.type === NodeTypeEnum.ID) {
          if (node.left.value === "Call") {
            return this.resolveValueType(node.right);
          }
          if (node.left.value === "Exclude") {
            const args = this.flattenChildren(node.right.node, [","]).map((e) =>
              this.resolveType(e)
            );
            if (args.length !== 2) {
              return newType(NodeTypeEnum.Undefined);
            }

            var left = args[0];
            const right = args[1];

            if (left.type === NodeTypeEnum.Any) {
              return left;
            }

            if (args[0].type !== NodeTypeEnum.TypeList) {
              left = newType(NodeTypeEnum.TypeList);
              left.typeListValue.values = [args[0]];
            }

            const res = this.excludeTypes(left.typeListValue.values, right);

            if (res.typeListValue.values.length === 0) {
              return newType(NodeTypeEnum.Undefined);
            }

            return res;
          }
          return this.tcFunctionCall(node, false) ?? newType(NodeTypeEnum.Any);
        }
        return newType(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.Function: {
        if (node.evaluated) {
          return node;
        }
        const returnType = this.resolveType(node.right);

        const funcNode = newType(NodeTypeEnum.Function);
        funcNode.functionValue = {
          paramTypes: [],
          paramOptionality: [],
          paramCatchAll: [],
          paramNames: [],
          returnType: newType(),
          name: node.meta?.name,
        };
        funcNode.functionValue.value = node;
        // funcNode.evaluated = true;

        this.flattenChildren(node.left?.node, [","]).forEach((param: Node) => {
          var type;
          var value;
          var isOptional = false;
          var isCatchAll = false;

          if (param.type === NodeTypeEnum.Operator && param.value === "=") {
            value = this.resolveValueType(param.right);
            param = param.left;
          }

          if (this.isTypeNode(param)) {
            type = this.resolveType(param.right);
            if (type.type === NodeTypeEnum.Generic) {
              funcNode.functionValue.isGeneric = true;
            }
            param = param.left;
          }

          if (
            param.type === NodeTypeEnum.Operator &&
            param.value === "unary!"
          ) {
            isOptional = true;
            param = param.right;
          }

          if (
            param.type === NodeTypeEnum.Operator &&
            param.value === "unary..."
          ) {
            isCatchAll = true;
            param = param.right;
          }

          // At this point, param is an ID
          // we'll typecheck it if it has a value
          if (type && value) {
            const check = this.checkTypes(type, value);
            if (!check) {
              this.errorAndExit(
                `TypeError: Parameter '${
                  param.value
                }' is of type ${this.typeRepr(
                  type
                )} but received value of type ${this.typeRepr(value)}`
              );
            }
          }

          if (!type) {
            type = newType(NodeTypeEnum.Any);
          }
          if (!value) {
            if (isCatchAll) {
              value = newType(NodeTypeEnum.List);
            } else {
              value = newType();
            }
          }

          funcNode.functionValue.paramNames.push(param.value);
          funcNode.functionValue.paramOptionality.push(isOptional);
          funcNode.functionValue.paramCatchAll.push(isCatchAll);
          funcNode.functionValue.paramTypes.push(type);
        });

        funcNode.functionValue.returnType = returnType;

        return funcNode;
      }
      case NodeTypeEnum.Accessor: {
        const toAccess = this.resolveType(node.left);
        const accessor = this.resolveType(node.right);
        if (
          toAccess.type === NodeTypeEnum.List &&
          accessor.type === NodeTypeEnum.List
        ) {
          const listType = toAccess.listValue.value;
          const accessorType = accessor.listValue.value;
          if (
            accessorType.type !== NodeTypeEnum.Number &&
            accessorType.type !== NodeTypeEnum.Any
          ) {
            this.errorAndExit("List accessor must be a number");
            return newType(NodeTypeEnum.Error);
          }
          return listType;
        }
        // todo: objects
        return newType(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.Operator: {
        const left = this.resolveType(node.left);
        const right = this.resolveType(node.right);

        if (node.value === "&&") {
          if (left.type !== NodeTypeEnum.Generic) {
            this.errorAndExit("Cannot extend non-generic");
          }
          left.genericValue.extention = this.resolveType(node.right);
          return left;
        }

        if (node.value === "|") {
          var types = this.flattenChildren(node, ["|"]) as Node[];
          const typeOptionsList = newType(NodeTypeEnum.TypeList);
          typeOptionsList.typeListValue.values = this.removeDuplicateTypes(
            types.map((e) => {
              const resolvedElem = this.resolveType(e);
              if (resolvedElem.isGeneric) {
                typeOptionsList.isGeneric = true;
              }
              return resolvedElem;
            })
          );
          return typeOptionsList;
        }

        return newType(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.List: {
        const list = newType(NodeTypeEnum.List);
        if (node.node) {
          const elem = this.resolveType(node.node);
          list.listValue = { value: elem };
          if (elem.isGeneric) {
            list.isGeneric = true;
          }
          return list;
        }
        const types = this.removeDuplicateTypes(
          node.nodes?.map((e) => {
            const elem = this.resolveType(e);
            if (elem.isGeneric) {
              list.isGeneric = true;
            }
            return elem;
          })
        );
        if (types.length) {
          const typeList = newType(NodeTypeEnum.TypeList);
          typeList.typeListValue.values = types;
          list.listValue = { value: typeList };
        } else {
          list.listValue = { value: newType(NodeTypeEnum.Any) };
        }
        return list;
      }
      case NodeTypeEnum.Object: {
        if (node.evaluated) {
          const typeObject = newType(NodeTypeEnum.Object, {});
          Object.entries(node.value as Record<string, Node>).forEach(
            ([key, value]) => {
              typeObject.objectValue.value[key] = this.resolveType(value);
              if (typeObject.objectValue.value[key].isGeneric) {
                typeObject.isGeneric = true;
              }
            }
          );
          return typeObject;
        }
        const typeObject = newType(NodeTypeEnum.Object, { value: {} });
        // typeObject.evaluated = true;
        if (node.node?.type === NodeTypeEnum.ID) {
          const propName = node.node;
          typeObject.objectValue.value[propName.value] =
            this.resolveType(propName);
          if (typeObject.objectValue.value[propName.value].isGeneric) {
            typeObject.isGeneric = true;
          }
        } else if (
          node.node?.type === NodeTypeEnum.Operator &&
          node.node?.value === ":"
        ) {
          var propNode = node.node.left;
          var propName: Type = newType(NodeTypeEnum.Generic, {
            value: propNode.value,
          });
          if (propNode.type === NodeTypeEnum.List) {
            propName = this.resolveType(propNode.node);
          }
          typeObject.objectValue.value[propName.genericValue.value] =
            this.resolveType(node.node.right);
          if (
            typeObject.objectValue.value[propName.genericValue.value].isGeneric
          ) {
            typeObject.isGeneric = true;
          }
        } else if (
          node.node?.type === NodeTypeEnum.Operator &&
          node.node?.value === ","
        ) {
          const props = this.flattenChildren(node.node, [","]);
          props.forEach((prop) => {
            if (prop.type === NodeTypeEnum.ID) {
              const propName = prop;
              typeObject.objectValue.value[propName.value] =
                this.resolveType(propName);
            } else {
              var propName = prop.left;
              if (propName.type === NodeTypeEnum.List) {
                propName = this.resolveType(propName.node);
              }
              typeObject.objectValue.value[propName.value] = this.resolveType(
                prop.right
              );
              if (typeObject.objectValue.value[propName.value].isGeneric) {
                typeObject.isGeneric = true;
              }
            }
          });
        }
        return typeObject;
      }
      default: {
        return newType(NodeTypeEnum.Any);
      }
    }
  }

  private isTypeNode(node: Node) {
    return node.type === NodeTypeEnum.Operator && node.value === "::";
  }

  private resolveValueType(node: Node): Type {
    if (!node) {
      return newType(NodeTypeEnum.Any);
    }
    switch (node.type) {
      case NodeTypeEnum.Paren: {
        return this.resolveValueType(node.node);
      }
      case NodeTypeEnum.Eval: {
        return newType(NodeTypeEnum.String);
      }
      case NodeTypeEnum.Decl: {
        if (node.declNode.value.type === NodeTypeEnum.Function) {
          node.declNode.value.rawType = node.declNode.id;
        }
        var valueType = this.resolveValueType(node.declNode.value);
        var left = node.declNode.id;
        var id = node.declNode.id;
        var type: Type;

        if (valueType.type === NodeTypeEnum.Function) {
          if (this.isTypeNode(left)) {
            type = this.resolveType(left.right);
          } else {
            type = this.resolveType(left);
          }
          // If the type is not defined, add it
          if (type.type === NodeTypeEnum.Generic) {
            type = valueType;
          } else {
            // If the function is typed inline, don't add the implementation
            if (!this.isTypeNode(left)) {
              type.functionValue.implementation = node.declNode.value;
            }
          }
        }

        if (this.isTypeNode(left)) {
          // const id = left.left;
          id = left.left;
          type = this.resolveType(left.right);
          // node.declNode.id = id;
        }

        if (node.value === "let") {
          this.typeMap[node.declNode.id.value] = type;
          // this.typeMap[node.declNode.id.value] = {
          //   type,
          //   concreteType: valueType,
          // };
          return valueType;
        }

        if (type) {
          const checkTypes = this.checkTypes(type, valueType);
          if (!checkTypes) {
            this.errorAndExit(
              `TypeError: Expected type ${this.typeRepr(
                type
              )} but received type ${this.typeRepr(valueType)}`
            );
          }
        } else {
          type = valueType;
        }

        // this.typeMap[node.declNode.id.value] = type;
        this.typeMap[id.value] = type;

        // this.typeMap[node.declNode.id.value] = {
        //   type,
        //   concreteType: valueType,
        // };

        return valueType;
      }
      case NodeTypeEnum.Block: {
        // in order to scope this, we'll create a new typechecker
        const typechecker = new TypeChecker(node.nodes, this.filePath);
        typechecker.typeMap = { ...this.typeMap };
        typechecker.tempTypeMap = { ...this.tempTypeMap };
        typechecker.closureTypeMap = { ...this.closureTypeMap };
        typechecker.genericNamesToClear = this.genericNamesToClear;
        const res = typechecker.run();
        if (res === -1) {
          this.hasError = true;
          return newType(NodeTypeEnum.Error);
        }
        return typechecker.returnType;
      }
      case NodeTypeEnum.Generic:
      case NodeTypeEnum.ID: {
        var res = newType(NodeTypeEnum.Any);
        if (this.tempTypeMap.hasOwnProperty(node.value)) {
          res = this.tempTypeMap[node.value];
        } else if (this.typeMap.hasOwnProperty(node.value)) {
          res = this.typeMap[node.value];
        } else if (this.closureTypeMap.hasOwnProperty(node.value)) {
          res = this.closureTypeMap[node.value];
        }
        return res;
      }
      case NodeTypeEnum.String: {
        if (node.value === "Number") {
          return newType(NodeTypeEnum.Number);
        }
        if (node.value === "Boolean") {
          return newType(NodeTypeEnum.Boolean);
        }
        if (node.value === "List") {
          return newType(NodeTypeEnum.List);
        }
        if (node.value === "Object") {
          return newType(NodeTypeEnum.Object);
        }
        if (node.value === "Raw") {
          return newType(NodeTypeEnum.Raw);
        }
        if (node.value === "Function") {
          return newType(NodeTypeEnum.Function);
        }
        if (node.value === "Error") {
          return newType(NodeTypeEnum.Error);
        }
        if (node.value === "Native") {
          return newType(NodeTypeEnum.Native);
        }
        if (node.value === "Undefined") {
          return newType();
        }
        const stringType = newType(NodeTypeEnum.String, {
          value: node.value as string,
        });
        return stringType;
      }
      case NodeTypeEnum.Number: {
        const numberType = newType(NodeTypeEnum.Number, {
          value: node.value as number,
        });
        return numberType;
      }
      case NodeTypeEnum.Boolean: {
        const booleanType = newType(NodeTypeEnum.Boolean, {
          value: node.value as boolean,
        });
        return booleanType;
      }
      case NodeTypeEnum.Undefined: {
        return newType();
      }
      case NodeTypeEnum.Function: {
        if (node.evaluated) {
          return node;
        }
        var fnType: Type;
        var returnType = newType(NodeTypeEnum.Any);
        if (node.rawType) {
          if (this.isTypeNode(node.rawType)) {
            node.rawType = node.rawType.right;
          }
          fnType = this.resolveType(node.rawType);
          if (fnType.type === NodeTypeEnum.Function) {
            returnType = fnType.functionValue.returnType;
            fnType.functionValue.paramDefaultTypes = [];
          } else if (fnType.type === NodeTypeEnum.Generic) {
            fnType = undefined;
          } else {
            this.errorAndExit(
              `TypeError: Type '${this.typeRepr(
                fnType
              )}' cannot be used to represent a function`
            );
          }
        }

        const funcNode = newType(NodeTypeEnum.Function);
        funcNode.functionValue = {
          paramTypes: [],
          paramOptionality: [],
          paramCatchAll: [],
          paramNames: [],
          paramDefaultTypes: [],
          returnType: newType(),
          name: node.meta?.name,
        };
        funcNode.functionValue.value = node;
        // funcNode.evaluated = true;

        const tc = new TypeChecker([node.right], this.filePath);
        tc.typeMap = { ...this.typeMap };

        this.flattenChildren(node.left?.node, [","]).forEach(
          (param: Node, index) => {
            var type: Type;
            var value: Type;
            var isOptional = false;
            var isCatchAll = false;

            if (param.type === NodeTypeEnum.Operator && param.value === "=") {
              value = this.resolveValueType(param.right);
              param = param.left;
            }

            if (fnType) {
              type = fnType.functionValue.paramTypes[index];
              if (value) {
                fnType.functionValue.paramDefaultTypes.push(value);
              }
            }

            if (this.isTypeNode(param)) {
              type = this.resolveType(param.right);
              if (type.type === NodeTypeEnum.Generic) {
                funcNode.isGeneric = true;
              }
              param = param.left;
            }

            if (
              param.type === NodeTypeEnum.Operator &&
              param.value === "unary!"
            ) {
              isOptional = true;
              param = param.right;
            }

            if (
              param.type === NodeTypeEnum.Operator &&
              param.value === "unary..."
            ) {
              isCatchAll = true;
              param = param.right;
            }

            // At this point, param is an ID
            // we'll typecheck it if it has a value
            if (type && value) {
              const check = this.checkTypes(type, value);
              if (!check) {
                this.errorAndExit(
                  `TypeError: Parameter '${
                    param.value
                  }' is of type ${this.typeRepr(
                    type
                  )} but received value of type ${this.typeRepr(value)}`
                );
              }
            }

            if (!type) {
              type = newType(NodeTypeEnum.Any);
            }
            if (!value) {
              if (isCatchAll) {
                value = newType(NodeTypeEnum.List);
              } else {
                value = newType();
              }
            }

            funcNode.functionValue.paramNames.push(param.value);
            funcNode.functionValue.paramOptionality.push(isOptional);
            funcNode.functionValue.paramCatchAll.push(isCatchAll);
            funcNode.functionValue.paramTypes.push(type);

            if (param.value) {
              // tc.typeMap[param.value] = { type, concreteType: value };
              tc.typeMap[param.value] = type;
            }
          }
        );

        tc.run();

        if (!this.checkTypes(returnType, tc.returnType)) {
          this.errorAndExit(
            `TypeError: Defined return type is ${this.typeRepr(
              returnType
            )} but function returns ${this.typeRepr(tc.returnType)}`,
            node
          );
        }

        funcNode.functionValue.returnType = tc.returnType;
        // funcNode.funcNode.returnType = returnType;

        return funcNode;
      }
      case NodeTypeEnum.FunctionCall: {
        if (node.isType) {
          return this.resolveType(node);
        }

        return this.tcFunctionCall(node, true) ?? newType(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.Operator: {
        let left: Type;

        if (node.value === ".") {
          const flattened: Node[] = this.flattenChildren(node, [
            ".",
            NodeTypeEnum[NodeTypeEnum.Accessor],
            NodeTypeEnum[NodeTypeEnum.FunctionCall],
          ]);
          var toAccess = this.resolveValueType(flattened[0]);
          flattened.forEach((elem: Node, index) => {
            if (index > 0) {
              if (elem.type === NodeTypeEnum.List) {
                elem = elem.node;
              }
              if (
                toAccess.type === NodeTypeEnum.Object &&
                (elem.type === NodeTypeEnum.String ||
                  elem.type === NodeTypeEnum.ID)
              ) {
                toAccess = toAccess.objectValue.value[elem.value] ?? newType();
              }

              if (
                toAccess.type === NodeTypeEnum.List &&
                elem.type === NodeTypeEnum.Number
              ) {
                toAccess = toAccess.listValue.value;
              } else if (
                toAccess.type === NodeTypeEnum.String &&
                elem.type === NodeTypeEnum.Number
              ) {
                toAccess = newType(NodeTypeEnum.String);
              } else if (
                toAccess.type === NodeTypeEnum.Function &&
                elem.type === NodeTypeEnum.Paren
              ) {
                const fnCallNode = this.newNode(NodeTypeEnum.FunctionCall);
                fnCallNode.left =
                  toAccess.functionValue.implementation ??
                  toAccess.functionValue.value;
                fnCallNode.left.rawType = toAccess.functionValue.value;
                fnCallNode.right = elem;
                toAccess = this.resolveValueType(fnCallNode);
              }
            }
          });
          return toAccess;
        }

        if (!node.meta?.unary) {
          left = this.resolveValueType(node.left);
        }

        if (node.value === "else") {
          if (node.right.type === NodeTypeEnum.IfStatement) {
            return this.resolveValueType(node.right);
          }

          for (const expr of node.right.nodes) {
            this.resolveValueType(expr);
          }
          return newType();
        }

        const right = this.resolveValueType(node.right);

        if (
          left?.type === NodeTypeEnum.Any ||
          right.type === NodeTypeEnum.Any
        ) {
          return newType(NodeTypeEnum.Any);
        }

        if (node.value === ",") {
          const typeList = newType(NodeTypeEnum.TypeList);
          typeList.typeListValue.values = this.removeDuplicateTypes([
            left,
            right,
          ]);
          if (typeList.typeListValue.values.length === 1) {
            return typeList.typeListValue.values[0];
          }
          return typeList;
        }

        if (node.value === "=") {
          if (node.left.type === NodeTypeEnum.ID) {
            const type = this.resolveType(node.left);
            const valueType = this.resolveValueType(node.right);
            var canChange = this.typeMap[node.left.value].canChange;
            if (canChange) {
              this.typeMap[node.left.value] = valueType;
            } else {
              if (!this.checkTypes(type, valueType)) {
                this.errorAndExit(
                  `TypeError: Expected type ${this.typeRepr(
                    type
                  )} but received type ${this.typeRepr(valueType)}`
                );
                return newType(NodeTypeEnum.Error);
              }
            }
            return valueType;
          }
        }

        if (node.value === "||") {
          var types = this.flattenChildren(node, ["||"]) as Node[];
          const typeOptionsList = newType(NodeTypeEnum.TypeList);
          typeOptionsList.typeListValue.values = this.removeDuplicateTypes(
            types.map((e) => this.resolveValueType(e))
          );
          return typeOptionsList;
        }
        if (node.value === "+") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return newType(NodeTypeEnum.Number);
          }

          if (
            left.type === NodeTypeEnum.String ||
            right.type === NodeTypeEnum.String
          ) {
            return newType(NodeTypeEnum.String);
          }

          if (
            left.type === NodeTypeEnum.List &&
            right.type === NodeTypeEnum.List
          ) {
            // const listType = this.joinTypes(
            //   this.getListType(left),
            //   this.getListType(right)
            // );
            const listType = this.joinTypes(
              left.listValue.value,
              right.listValue.value
            );
            const newList = newType(NodeTypeEnum.List);
            newList.listValue = { value: listType };
            return newList;
          }

          // todo: Objects

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "-") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return newType(NodeTypeEnum.Number);
          }

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "*") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return newType(NodeTypeEnum.Number);
          }

          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.List
          ) {
            const newList = newType(NodeTypeEnum.List);
            newList.listValue = { value: right };
            return newList;
          }

          if (
            left.type === NodeTypeEnum.List &&
            right.type === NodeTypeEnum.Number
          ) {
            const newList = newType(NodeTypeEnum.List);
            newList.listValue = { value: left };
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

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "/") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return newType(NodeTypeEnum.Number);
          }

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "%") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return newType(NodeTypeEnum.Number);
          }

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "^") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            return newType(NodeTypeEnum.Number);
          }

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "|") {
          if (
            left.type === NodeTypeEnum.List &&
            right.type === NodeTypeEnum.Number
          ) {
            const newList = newType(NodeTypeEnum.List);
            newList.listValue = { value: left };
            return newList;
          }

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "==") {
          return newType(NodeTypeEnum.Boolean);
        }

        if (node.value === "!=") {
          return newType(NodeTypeEnum.Boolean);
        }

        if (node.value === "<") {
          return newType(NodeTypeEnum.Boolean);
        }

        if (node.value === ">") {
          return newType(NodeTypeEnum.Boolean);
        }

        if (node.value === "<=") {
          return newType(NodeTypeEnum.Boolean);
        }

        if (node.value === ">=") {
          return newType(NodeTypeEnum.Boolean);
        }

        if (node.value === "&&") {
          const typeList = newType(NodeTypeEnum.TypeList);
          typeList.typeListValue.values = this.removeDuplicateTypes([
            left,
            right,
          ]);
          if (typeList.typeListValue.values.length === 1) {
            return typeList.typeListValue.values[0];
          }
          return typeList;
        }
        // todo
        if (node.value === "+=") {
          return newType(NodeTypeEnum.Any);
        }
        // todo
        if (node.value === "-=") {
          return newType(NodeTypeEnum.Any);
        }
        // todo
        if (node.value === "*=") {
          return newType(NodeTypeEnum.Any);
        }
        // todo
        if (node.value === "/=") {
          return newType(NodeTypeEnum.Any);
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
          const typeList = newType(NodeTypeEnum.TypeList);
          const leftStatement = this.resolveValueType(node.right.left);
          const rightStatement = this.resolveValueType(node.right.right);
          typeList.typeListValue.values = this.removeDuplicateTypes([
            leftStatement,
            rightStatement,
          ]);
          if (typeList.typeListValue.values.length === 1) {
            return typeList.typeListValue.values[0];
          }
          return typeList;
        }

        if (node.value === "?!") {
          const typeList = newType(NodeTypeEnum.TypeList);
          typeList.typeListValue.values = this.removeDuplicateTypes([
            left,
            right,
            newType(),
          ]);
          if (typeList.typeListValue.values.length === 1) {
            return typeList.typeListValue.values[0];
          }
          return typeList;
        }

        if (node.value === "??") {
          const typeList = newType(NodeTypeEnum.TypeList);
          typeList.typeListValue.values = this.removeDuplicateTypes([
            left,
            right,
            newType(),
          ]).filter((e) => e.type !== NodeTypeEnum.Undefined);
          if (typeList.typeListValue.values.length === 1) {
            return typeList.typeListValue.values[0];
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
          const listNode = newType(NodeTypeEnum.TypeList);
          listNode.typeListValue.values = arr;
          return listNode;
        }

        if (node.value === ".." || node.value === "...") {
          if (
            left.type === NodeTypeEnum.Number &&
            right.type === NodeTypeEnum.Number
          ) {
            const listType = newType(NodeTypeEnum.List);
            listType.listValue = { value: newType(NodeTypeEnum.Number) };
            return listType;
          }

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "unary+") {
          return right;
        }

        if (node.value === "unary-") {
          if (right.type === NodeTypeEnum.Number) {
            return right;
          }

          return newType(NodeTypeEnum.Undefined);
        }

        if (node.value === "unary!") {
          return newType(NodeTypeEnum.Boolean);
        }

        if (node.value === "unary...") {
          return right.listValue.value ?? newType(NodeTypeEnum.Any);
        }

        return newType(NodeTypeEnum.Undefined);
      }
      case NodeTypeEnum.List: {
        const list = newType(NodeTypeEnum.List);
        if (node.node) {
          const elem = this.resolveValueType(node.node);
          list.listValue = { value: elem };
          if (elem.isGeneric) {
            list.isGeneric = true;
          }
          return list;
        }
        const types = this.removeDuplicateTypes(
          node.nodes?.map((e) => {
            const elem = this.resolveValueType(e);
            if (elem.isGeneric) {
              list.isGeneric = true;
            }
            return elem;
          })
        );
        if (types.length) {
          const typeList = newType(NodeTypeEnum.TypeList);
          typeList.typeListValue.values = types;
          list.listValue = { value: typeList };
        } else {
          list.listValue = { value: newType(NodeTypeEnum.Any) };
        }
        return list;
      }
      case NodeTypeEnum.IfStatement: {
        const statement = this.resolveValueType(node.left);
        if (statement.type === NodeTypeEnum.Error) {
          return newType(NodeTypeEnum.Error);
        }
        for (const expr of node.right.nodes) {
          this.resolveValueType(expr);
        }
        return newType();
      }
      case NodeTypeEnum.Accessor: {
        const toAccess = this.resolveValueType(node.left);
        const accessor = this.resolveValueType(node.right);
        if (
          toAccess.type === NodeTypeEnum.List &&
          accessor.type === NodeTypeEnum.List
        ) {
          const listType = toAccess.listValue.value;
          const accessorType = accessor.listValue.value;
          if (
            accessorType.type !== NodeTypeEnum.Number &&
            accessorType.type !== NodeTypeEnum.Any
          ) {
            this.errorAndExit("List accessor must be a number");
            return newType(NodeTypeEnum.Error);
          }
          return listType;
        }
        if (
          toAccess.type === NodeTypeEnum.Object &&
          accessor.type === NodeTypeEnum.List
        ) {
          const accessorType = accessor.listValue.value;
          if (
            accessorType.type !== NodeTypeEnum.String &&
            accessorType.type !== NodeTypeEnum.Any
          ) {
            this.errorAndExit("Object accessor must be a string");
            return newType(NodeTypeEnum.Error);
          }

          const propName = accessorType.stringValue.value;
          return toAccess.objectValue.value[propName] ?? newType();
        }

        if (
          toAccess.type === NodeTypeEnum.String &&
          accessor.type === NodeTypeEnum.List
        ) {
          const accessorType = accessor.listValue.value;
          if (
            accessorType.type !== NodeTypeEnum.Number &&
            accessorType.type !== NodeTypeEnum.Any
          ) {
            this.errorAndExit("String accessor must be a number");
            return newType(NodeTypeEnum.Error);
          }
          return newType(NodeTypeEnum.String);
        }
        return newType(NodeTypeEnum.Any);
      }
      case NodeTypeEnum.ForStatement: {
        const sections: Node[] = this.flattenChildren(node.left.node, [","]);
        if (sections.length === 0) {
          this.errorAndExit("TypeError: For loop cannot be empty");
          return newType(NodeTypeEnum.Error);
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
          return newType(NodeTypeEnum.Error);
        }
        if (sections.length > 1) {
          const valueName = sections[1].value;
          // const valueType = this.getListType(arr);
          const valueType = arr.listValue.value;
          // this.tempTypeMap[valueName] = { type: valueType };
          this.tempTypeMap[valueName] = valueType;
          _valueName = valueName;
        }
        if (sections.length > 2) {
          const indexName = sections[2].value;
          const indexType = newType(NodeTypeEnum.Number);
          // this.tempTypeMap[indexName] = { type: indexType };
          this.tempTypeMap[indexName] = indexType;
          _indexName = indexName;
        }
        for (const expr of node.right.nodes) {
          this.resolveValueType(expr);
        }

        _valueName && delete this.tempTypeMap[_valueName];
        _indexName && delete this.tempTypeMap[_indexName];

        return newType();
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
      case NodeTypeEnum.TypeList: {
        const typeList = newType(NodeTypeEnum.TypeList);
        typeList.typeListValue.values = this.removeDuplicateTypes(
          node.nodes.map((e) => this.resolveValueType(e))
        );
        if (typeList.typeListValue.values.length === 0) {
          return typeList.typeListValue.values[0];
        }
        return typeList;
      }
      case NodeTypeEnum.Object: {
        const typeObject = newType(NodeTypeEnum.Object, { value: {} });
        if (node.node?.type === NodeTypeEnum.ID) {
          const propName = node.node;
          typeObject.objectValue.value[propName.value] =
            this.resolveValueType(propName);
          typeObject.isGeneric =
            typeObject.objectValue.value[propName.value].isGeneric;
        } else if (
          node.node?.type === NodeTypeEnum.Operator &&
          node.node?.value === ":"
        ) {
          var propNode = node.node.left;
          var propName: Type = newType(NodeTypeEnum.Generic, {
            value: propNode.value,
          });
          if (propNode.type === NodeTypeEnum.List) {
            propName = this.resolveValueType(propNode.node);
          }
          typeObject.objectValue.value[propName.genericValue.value] =
            this.resolveValueType(node.node.right);
          typeObject.isGeneric =
            typeObject.objectValue.value[propName.genericValue.value].isGeneric;
        } else if (
          node.node?.type === NodeTypeEnum.Operator &&
          node.node?.value === ","
        ) {
          const props = this.flattenChildren(node.node, [","]);
          props.forEach((prop) => {
            if (prop.type === NodeTypeEnum.ID) {
              const propName = prop;
              typeObject.objectValue.value[propName.value] =
                this.resolveValueType(propName);
            } else {
              var propName = prop.left;
              if (propName.type === NodeTypeEnum.List) {
                propName = this.resolveValueType(propName.node);
              }
              typeObject.objectValue.value[propName.value] =
                this.resolveValueType(prop.right);
              if (typeObject.objectValue.value[propName.value].isGeneric) {
                typeObject.isGeneric = true;
              }
            }
          });
        }
        return typeObject;
      }
      default: {
        return newType(NodeTypeEnum.Any);
      }
    }
  }

  private checkTypes(type: Type, valueType: Type) {
    if (
      type.type === NodeTypeEnum.TypeList &&
      type.typeListValue.values?.length === 1
    ) {
      type = type.typeListValue.values[0];
    }

    if (!valueType) {
      return false;
    }

    if (
      valueType.type === NodeTypeEnum.TypeList &&
      valueType.typeListValue.values?.length === 1
    ) {
      valueType = valueType.typeListValue.values[0];
    }

    if (type.type === NodeTypeEnum.Any || valueType.type === NodeTypeEnum.Any) {
      return true;
    }

    if (type.isGeneric && valueType.isGeneric) {
      const absolutes = this.getAbsoluteValueOfType(type, valueType);
      /* T can be List or Object types */
      if (absolutes.typeRes.type === NodeTypeEnum.Generic) {
        return true;
      }
      if (absolutes.typeRes.type !== absolutes.valueRes.type) {
        return false;
      }
      return true;
    }

    if (type.type === NodeTypeEnum.Generic) {
      // We check for any extensions
      if (type.genericValue.extention) {
        return this.checkTypes(type.genericValue.extention, valueType);
      }
      return true;
    }

    if (
      type.type === NodeTypeEnum.TypeList &&
      valueType.type === NodeTypeEnum.TypeList
    ) {
      for (const _valueType of valueType.typeListValue.values) {
        if (!this.checkTypes(type, _valueType)) {
          return false;
        }
      }

      return true;
    }

    if (type.type === NodeTypeEnum.TypeList) {
      if (!type.typeListValue.values) {
        return type.type === valueType.type;
      }
      for (const _type of type.typeListValue.values) {
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
        type.listValue?.value ?? newType(NodeTypeEnum.Any),
        valueType.listValue?.value ?? newType(NodeTypeEnum.Any)
      );
      return check;
    }

    if (
      type.type === NodeTypeEnum.Function &&
      valueType.type === NodeTypeEnum.Function
    ) {
      if (!type.functionValue || !Object.keys(type.functionValue).length) {
        return true;
      }
      if (
        !valueType.functionValue ||
        !Object.keys(valueType.functionValue).length
      ) {
        return true;
      }
      if (
        type.functionValue.paramNames.length !==
        valueType.functionValue.paramNames.length
      ) {
        return false;
      }
      type.functionValue.paramTypes.forEach((param, index) => {
        if (
          !this.checkTypes(param, valueType.functionValue.paramTypes[index])
        ) {
          return false;
        }
      });
      if (
        !this.checkTypes(
          type.functionValue.returnType,
          valueType.functionValue.returnType
        )
      ) {
        return false;
      }
      return true;
    }

    if (
      type.type === NodeTypeEnum.Object &&
      valueType.type === NodeTypeEnum.Object
    ) {
      if (!type.objectValue) {
        return true;
      }
      if (!valueType.objectValue) {
        return true;
      }
      const typeProps: Record<string, Type> = type.objectValue.value;
      const valueProps: Record<string, Type> = valueType.objectValue.value;
      const typePropsLength = Object.keys(typeProps).length;
      const valuePropsLength = Object.keys(valueProps).length;
      if (typePropsLength !== valuePropsLength) {
        return false;
      }

      var passedPropCheck = true;

      Object.entries(typeProps).forEach(([key, prop]) => {
        const valueProp = valueProps[key];
        if (!valueProp) {
          passedPropCheck = false;
        }
        const check = this.checkTypes(prop, valueProp);
        if (!check) {
          passedPropCheck = false;
        } else if (
          prop.type === NodeTypeEnum.Function &&
          valueProp.type === NodeTypeEnum.Function
        ) {
          prop.functionValue.implementation = valueProp.functionValue.value;
        }
      });

      return passedPropCheck;
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
    // we're in dev, we can process.exit()
    process.exit(1);
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
        type.typeAlias = node.right.value;
        // if (type.meta) {
        //   type.meta.typeAlias = node.right.value;
        // } else {
        //   type.meta = {
        //     typeAlias: node.right.value,
        //   };
        // }
      }
      // this.typeMap[id] = { type };
      this.typeMap[id] = type;
      return newType();
    } else {
      return this.inTypeLand
        ? this.resolveType(node)
        : this.resolveValueType(node);
    }
  }

  public run() {
    while (this.node) {
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
      this.returnType = newType(NodeTypeEnum.Error);
      return -1;
    }
    return this.typeMap;
  }
}
