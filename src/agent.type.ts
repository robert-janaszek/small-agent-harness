import { Tool } from "./types";

export type Agent = {
  prompt: string;
  tools: Tool<any>[];
  onToolRound?: () => void;
}
