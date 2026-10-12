import { solve } from '../dist/index.js';

// The Flask bridge never executes client code or accepts client-computed eigenvalues.
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 65536) { console.log(JSON.stringify({ ok: false, error: 'System input is too large.' })); process.exit(1); }
}
try {
  const result = solve(JSON.parse(input));
  console.log(JSON.stringify({ ok: true, result }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Invalid system.' }));
  process.exitCode = 1;
}
