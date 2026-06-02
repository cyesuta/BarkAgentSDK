import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerBuiltinActions, BUILTIN_TOOL_NAMES } from '../tools/builtins.mjs';
import { scanLocalActions } from '../tools/scanner.mjs';
import { capabilityScanner } from '../skills/scanner.mjs';

test('registerBuiltinActions filters allowed tools', () => {
  const actions = registerBuiltinActions(process.cwd(), { allowed: ['Read', 'Grep'] });
  assert.deepEqual(actions.map((a) => a.spec.function.name), ['Read', 'Grep']);
  assert.equal(BUILTIN_TOOL_NAMES.includes('Bash'), true);
});

test('scanLocalActions supports custom toolsDir', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bark-sdk-'));
  try {
    const toolDir = join(root, 'custom-tools', 'echo');
    await mkdir(toolDir, { recursive: true });
    await writeFile(join(toolDir, 'tool.json'), JSON.stringify({
      name: 'echo_tool',
      description: 'Echo tool',
      inputSchema: { type: 'object', properties: {}, required: [] },
      command: ['node', '-e', 'process.stdin.resume();process.stdin.on("end",()=>console.log("ok"))'],
    }));
    const actions = await scanLocalActions(root, { toolsDir: 'custom-tools' });
    assert.deepEqual(actions.map((a) => a.spec.function.name), ['echo_tool']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('capabilityScanner supports custom skillDirs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bark-sdk-'));
  try {
    await mkdir(join(root, 'my-skills', 'demo'), { recursive: true });
    await writeFile(join(root, 'my-skills', 'demo', 'SKILL.md'), '# Demo');
    assert.deepEqual(capabilityScanner(root, { skillDirs: ['my-skills'] }), ['demo']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});