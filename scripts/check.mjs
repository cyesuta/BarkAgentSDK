import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const roots = ['client', 'core', 'pricing', 'protocol', 'providers', 'skills', 'tools', 'examples', 'tests'];

async function listMjs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listMjs(full));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

function check(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`node --check failed: ${file}`)));
  });
}

for (const file of ['index.mjs', ...(await Promise.all(roots.map(listMjs))).flat()]) {
  await check(file);
}