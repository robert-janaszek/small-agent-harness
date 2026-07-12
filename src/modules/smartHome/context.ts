import { createTools } from "../registry";
import { ToolContext } from "../types";

export const context: ToolContext = {
  knownDevices: [
    'light.salon.1',
    'light.salon.2',
    'light.salon.3',
    'light.lazienka',
  ],
  deviceState: {
    'light.salon.1': 'ON',
    'light.salon.2': 'ON',
    'light.salon.3': 'ON',
    'light.lazienka': 'ON',
  },
};

export const toolsDefinition = createTools(context);
