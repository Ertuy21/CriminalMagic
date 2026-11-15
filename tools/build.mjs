import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  outfile: path.join(root, 'game.js'),
  target: ['es2020'],
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
});
