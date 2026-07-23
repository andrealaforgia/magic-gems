import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export function loadMagicGems(files) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.process = process;
  vm.createContext(sandbox);

  for (const file of files) {
    const path = file instanceof URL ? fileURLToPath(file) : file;
    const code = readFileSync(path, 'utf8');
    vm.runInContext(code, sandbox, { filename: path });
  }

  return sandbox.MagicGems;
}
