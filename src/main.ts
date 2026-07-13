import './loadEnv';
import { Harness } from './harness';
import { createSmartHomeAgent } from './modules/smartHome/agent';

export const HARNESS_USER_COMMAND = 'turn off all lights in the living room';
const harness = new Harness(createSmartHomeAgent());
void harness.run(HARNESS_USER_COMMAND);
