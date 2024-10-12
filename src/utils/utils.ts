import { NodeType, Node, NodeTypeEnum } from "../types";

export const node = (
  type: NodeTypeEnum = NodeTypeEnum.Undefined,
  value: any = undefined,
  col: number = 0,
  line: number = 0
): Node => ({
  col: col,
  line: line,
  type,
  value,
  evaluated: true,
});

export type Schema = {
  name: string;
  // parameters: Record<string, NodeType | NodeType[]>;
  parameters: Record<string, string | string[]>;
};

export const validate = (args: Node[], schema: Schema) => {
  const numArgs = Object.keys(schema.parameters).length;
  if (args.length !== numArgs) {
    return {
      success: false,
      message: `Function '${schema.name}' expects ${numArgs} argument(s) but was provided ${args.length}`,
    };
  }

  var error;

  Object.entries(schema.parameters).forEach(([param, type], index) => {
    const arg = args[index];
    const isArray = Array.isArray(type);
    if (
      isArray
        ? !type.includes(NodeTypeEnum[arg.type])
        : NodeTypeEnum[arg.type] !== type
    ) {
      !error &&
        (error = `Function '${
          schema.name
        }' expects paramater '${param}' to be of type ${
          isArray ? type.join(" | ") : type
        } but was provided with value of type ${arg.type}`);
    }
  });

  if (error) {
    return { success: false, message: error };
  }

  return { success: true, message: "" };
};

export const getParamNames = (func: Function) => {
  // Convert the function to a string
  const funcStr = func.toString();

  // Match the parameters inside the parentheses
  const result =
    funcStr.match(/function\s*[^(]*\(\s*([^)]*)\)/) ||
    funcStr.match(/\(([^)]*)\)\s*=>/);

  if (!result) return [];

  // Split the parameters by commas and trim them
  return result[1]
    .split(",")
    .map((param) => param.trim())
    .filter((param) => param) // Filter out any empty strings
    .join(", ");
};
