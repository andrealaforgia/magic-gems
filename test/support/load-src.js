import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export function loadMagicGems(files, { randomQueue } = {}) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  // Narrow stub, not the live process object (no process.exit/etc exposed to sandboxed
  // code): Stryker's mutant switch only needs to read process.env.__STRYKER_ACTIVE_MUTANT__.
  sandbox.process = { env: { ...process.env } };
  if (randomQueue) {
    // Feeds fixed values to Math.random() in order, for deterministically forcing a
    // specific randomGem() outcome (e.g. a chosen refill), then falls back to real
    // randomness once exhausted - callers that don't care how the rest resolves (e.g.
    // ensurePlayable's own reshuffle draw) still terminate normally instead of looping
    // forever on a single repeated value.
    let i = 0;
    const realRandom = Math.random.bind(Math);
    sandbox.Math = Object.create(Math);
    sandbox.Math.random = () => (i < randomQueue.length ? randomQueue[i++] : (i++, realRandom()));
  }
  vm.createContext(sandbox);

  for (const file of files) {
    const path = file instanceof URL ? fileURLToPath(file) : file;
    const code = readFileSync(path, 'utf8');
    vm.runInContext(code, sandbox, { filename: path });
  }

  return sandbox.MagicGems;
}
