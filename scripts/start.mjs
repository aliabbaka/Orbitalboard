import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const python = process.env.ORBITALBOARD_PYTHON || join(root, '.venv/bin/python');
if (!existsSync(python)) {
  console.error('Create .venv, then install backend/requirements.txt. See README.md.');
  process.exit(1);
}
const child = spawn(python, ['-m', 'backend.app'], { cwd: root, stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
