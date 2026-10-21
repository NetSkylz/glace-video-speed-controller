import { build } from 'esbuild';
import { readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = (await readdir('tests')).filter(file => file.endsWith('.test.ts')).map(file => `tests/${file}`);
await rm('.test-build', { recursive: true, force: true });
await build({ entryPoints: files, bundle: true, platform: 'node', format: 'esm', target: 'node24', outdir: '.test-build', packages: 'external' });
const result = spawnSync(process.execPath, ['--test', ...files.map(file => file.replace('tests/', '.test-build/').replace(/\.ts$/, '.js'))], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
