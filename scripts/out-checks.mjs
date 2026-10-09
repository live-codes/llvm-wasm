// Is the built libLLVM actually there, and complete?
//
// Shared by check-out.mjs (the in-repo check) and pack-out.mjs (which builds the one
// file the npm tarball carries), because both have to answer the same question and
// neither should be able to answer it differently.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// The archives nothing can do without: the C API's core, the wasm backend, and the
// support library everything else leans on.
export const REQUIRED = ['libLLVMCore.a', 'libLLVMWebAssemblyCodeGen.a', 'libLLVMSupport.a'];

export async function checkOut(root) {
	const problems = [];
	const lib = join(root, 'out', 'lib');
	const include = join(root, 'out', 'include');
	const size = async (path) => (await stat(path).catch(() => null))?.size ?? null;

	const archives = (await readdir(lib).catch(() => null))?.filter(
		(name) => name.startsWith('libLLVM') && name.endsWith('.a')
	);

	if (!archives) {
		problems.push(`${lib} is not there — run llvm-wasm-unpack, or build.sh in a checkout`);
	} else {
		if (archives.length < 90) problems.push(`${lib} has ${archives.length} libLLVM archives, expected ~99`);
		for (const name of REQUIRED) {
			const bytes = archives.includes(name) ? await size(join(lib, name)) : null;
			if (bytes === null) problems.push(`${name} is missing`);
			else if (bytes === 0) problems.push(`${name} is empty`);
		}
	}

	if (!(await stat(include).catch(() => null))?.isDirectory()) {
		problems.push(`${include} is not there`);
	} else if (!(await stat(join(include, 'llvm-c', 'Core.h')).catch(() => null))?.isFile()) {
		problems.push(`${include}/llvm-c/Core.h is missing`);
	}

	return { problems, archives: archives ?? [] };
}

/** How big the archives are, for a size line. */
export async function archivesBytes(root, names) {
	let total = 0;
	for (const name of names) total += (await stat(join(root, 'out', 'lib', name)).catch(() => ({ size: 0 }))).size;
	return total;
}
