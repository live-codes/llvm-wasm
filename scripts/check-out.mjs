#!/usr/bin/env node
// `prepack`: refuse to publish a package whose libLLVM is missing or partial.
//
// The archives are a build output, so this is what stands between `npm publish` and
// a 140 MB tarball that links nothing. It checks the three ways that happens: no
// out/ at all, headers without archives, and archives that stopped early.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lib = join(root, 'out', 'lib');
const include = join(root, 'out', 'include');

// The archives a consumer cannot do without: the C API's core, the wasm backend, and
// the support library everything else leans on.
const REQUIRED = ['libLLVMCore.a', 'libLLVMWebAssemblyCodeGen.a', 'libLLVMSupport.a'];

const problems = [];
const size = async (path) => (await stat(path).catch(() => null))?.size ?? null;

const archives = await readdir(lib).catch(() => null);
if (!archives) {
	problems.push(`${lib} is not there`);
} else {
	const llvm = archives.filter((name) => name.startsWith('libLLVM') && name.endsWith('.a'));
	if (llvm.length < 90) problems.push(`${lib} has ${llvm.length} libLLVM archives, expected ~99`);
	for (const name of REQUIRED) {
		if (!archives.includes(name)) problems.push(`${name} is missing`);
		else if ((await size(join(lib, name))) === 0) problems.push(`${name} is empty`);
	}
}

if (!(await stat(include).catch(() => null))?.isDirectory()) {
	problems.push(`${include} is not there`);
} else if (!(await stat(join(include, 'llvm-c', 'Core.h')).catch(() => null))?.isFile()) {
	problems.push(`${include}/llvm-c/Core.h is missing`);
}

if (problems.length) {
	console.error('The packaged libLLVM is not complete:');
	for (const problem of problems) console.error(`  ${problem}`);
	console.error('\nBuild it first: WASI_SDK=… bash build.sh (Linux or WSL, ~an hour).');
	process.exit(1);
}

const bytes = (await Promise.all(archives.map((name) => size(join(lib, name))))).reduce((a, b) => a + b, 0);
console.log(`libLLVM OK: ${archives.length} archives, ${(bytes / 1e6).toFixed(0)} MB, and the headers beside them`);
