import { createTools } from "../registry";
import { ToolContext } from "../types";

export const context: ToolContext = {
  deviceState: {
    'light.livingRoom.1': 'ON',
    'light.livingRoom.2': 'ON',
    'light.livingRoom.3': 'ON',
    'light.bathroom': 'ON',
  },
};

export const toolsDefinition = createTools(context);
