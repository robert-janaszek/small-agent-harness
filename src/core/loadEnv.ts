import { config } from 'dotenv';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  config({ quiet: true });
  loaded = true;
}
