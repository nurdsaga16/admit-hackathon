import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Independent of cwd: both `node server/index.mjs` and npm start use server/.env.
// Node preserves variables already provided by the process environment.
export function loadServerEnvironment(path = fileURLToPath(new URL('./.env', import.meta.url))) {
  if (!existsSync(path)) return false;
  loadEnvFile(path);
  return true;
}
