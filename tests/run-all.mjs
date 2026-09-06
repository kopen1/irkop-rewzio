import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'tests/unit', 'tests/integration', 'tests/e2e', 'tests/security', 'tests/load'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
