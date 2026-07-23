import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export function loadMagicGems(files) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  // Narrow stub, not the live process object (no process.exit/etc exposed to sandboxed
  // code): Stryker's mutant switch only needs to read process.env.__STRYKER_ACTIVE_MUTANT__.
  sandbox.process = { env: { ...process.env } };
  vm.createContext(sandbox);

  for (const file of files) {
    const path = file instanceof URL ? fileURLToPath(file) : file;
    const code = readFileSync(path, 'utf8');
    vm.runInContext(code, sandbox, { filename: path });
  }

  return sandbox.MagicGems;
}
