#!/usr/bin/env node
// Print where this package installed its libLLVM, for a build script to use:
//
//   LLVM_WASM=$(npx llvm-wasm-path) bash link.sh
//
// What it prints is the package root: `out/lib` and `out/include` inside it, and
// `wasi-compat/` beside them -- the POSIX stubs the archives need at link time.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'out');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(`Print where the packaged libLLVM is.

  llvm-wasm-path           the package root (…/@live-codes/llvm-wasm), which is what a
                           build script wants: it holds out/ and wasi-compat/
  llvm-wasm-path --out     just the libLLVM: the package root's out/
  llvm-wasm-path --help    this

The archives are <root>/out/lib, the headers <root>/out/include.`);
	process.exit(0);
}

console.log(args.includes('--out') ? out : root);
