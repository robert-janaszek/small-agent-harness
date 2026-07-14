import { config } from 'dotenv';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  config();
  loaded = true;
}
