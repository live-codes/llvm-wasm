#!/usr/bin/env node
// Is the built libLLVM there, and complete?
//
//   node scripts/check-out.mjs
//
// The in-repo check. pack-out.mjs asks the same questions before it packs, through
// the same module, so the two cannot disagree about what "complete" means.
import { fileURLToPath } from 'node:url';

import { archivesBytes, checkOut } from './out-checks.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { problems, archives } = await checkOut(root);

if (problems.length) {
	console.error('The built libLLVM is not complete:');
	for (const problem of problems) console.error(`  ${problem}`);
	console.error('\nEither build it (WASI_SDK=… bash build.sh, ~an hour, Linux or WSL) or');
	console.error('unpack the archive this package ships: node bin/llvm-wasm-unpack.mjs');
	process.exit(1);
}

const bytes = await archivesBytes(root, archives);
console.log(`libLLVM OK: ${archives.length} archives, ${(bytes / 1e6).toFixed(0)} MB, and the headers beside them`);
