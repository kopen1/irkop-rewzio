import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ignored = new Set(['.git', 'node_modules', '.next', 'dist', 'coverage']);
const extensions = new Set(['.js', '.mjs', '.cjs']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
}

walk(process.cwd());
files.sort();

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`Lint PASS: ${files.length} JavaScript files syntax-checked.`);
