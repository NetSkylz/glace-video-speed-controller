import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });

const config = {
  entryPoints: { content: 'src/content/index.ts', options: 'src/options/index.ts', popup: 'src/popup/index.ts' },
  bundle: true,
  outdir: 'dist',
  target: ['chrome120'],
  format: 'iife',
  sourcemap: true,
  logLevel: 'info',
  legalComments: 'none',
};
if (process.argv.includes('--watch')) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('Watching TypeScript. Run npm run build after changing public files.');
} else {
  await build(config);
}
