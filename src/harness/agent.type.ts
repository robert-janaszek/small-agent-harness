import { Tool } from '../tools/types';

export type Agent = {
  prompt: string;
  tools: Tool<any>[];
  onSessionStart?: () => void;
  onToolRound?: () => void;
}
