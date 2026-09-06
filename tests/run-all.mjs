import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['tests/unit', 'tests/integration', 'tests/e2e', 'tests/security', 'tests/load'];
const files = roots.flatMap((root) => fs.readdirSync(root).filter((name) => /\.(mjs|js)$/.test(name)).map((name) => path.join(root, name)));
if (files.length !== roots.length) throw new Error('Every test suite must contain at least one test file');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
