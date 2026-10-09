#!/usr/bin/env node
// Put the archives back.
//
//   llvm-wasm-unpack                 # into this package, where a build script expects them
//   llvm-wasm-unpack <dir>           # into a directory you name: a complete $LLVM_WASM
//   --if-missing                     # do nothing when out/ is already there (postinstall)
//   --keep-archive                   # keep out.tar.xz afterwards
//
// The npm tarball carries one file, out.tar.xz (21 MB), rather than 2278 (38 MB) — the
// same bytes, half the download, one request from a CDN. This unpacks it, after
// checking it against the receipt published beside it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const archive = join(root, 'out.tar.xz');
const receipt = `${archive}.json`;

const args = process.argv.slice(2);
const ifMissing = args.includes('--if-missing');
const keepArchive = args.includes('--keep-archive');
const target = resolve(args.find((arg) => !arg.startsWith('-')) ?? root);

if (args.includes('--help') || args.includes('-h')) {
	console.log(`Unpack the libLLVM this package ships.

  llvm-wasm-unpack [directory]   default: this package's own directory
  --if-missing                   skip when out/lib is already there (what postinstall runs)
  --keep-archive                 keep out.tar.xz after unpacking it
  --help                         this

The archive holds out/ (99 archives and the headers) and wasi-compat/, so an unpacked
directory is complete on its own: point a build at it with LLVM_WASM.`);
	process.exit(0);
}

if (ifMissing && (await stat(join(target, 'out', 'lib')).catch(() => null))) {
	process.exit(0);
}

if (!(await stat(archive).catch(() => null))) {
	const message = `no out.tar.xz beside this script (${archive})`;
	if (ifMissing) {
		// A checkout has out/ built in place instead, so this is not an error there.
		console.error(`llvm-wasm-unpack: ${message}.`);
		process.exit(0);
	}
	console.error(`llvm-wasm-unpack: ${message}.`);
	console.error('In a checkout, build it: node scripts/pack-out.mjs');
	process.exit(1);
}

// The receipt is published with the archive, so a truncated or corrupted download is a
// message here rather than a half-unpacked toolchain later.
const pinned = await readFile(receipt, 'utf8')
	.then((text) => JSON.parse(text))
	.catch(() => null);
if (pinned) {
	const bytes = await readFile(archive);
	const digest = createHash('sha256').update(bytes).digest('hex');
	if (bytes.byteLength !== pinned.bytes || digest !== pinned.sha256) {
		console.error(`out.tar.xz does not match its receipt: ${bytes.byteLength} bytes, sha256 ${digest.slice(0, 16)}…`);
		console.error(`expected ${pinned.bytes} bytes, sha256 ${pinned.sha256.slice(0, 16)}…`);
		process.exit(1);
	}
}

// `tar -C` will not create the directory it is told to chdir into.
await mkdir(target, { recursive: true });
execFileSync('tar', ['-xf', archive, '-C', target], { stdio: ['ignore', 'ignore', 'inherit'] });
if (!keepArchive && target === resolve(root)) await rm(archive, { force: true });

console.log(`Unpacked out/ and wasi-compat/ into ${target}`);
console.log('Point a build at it: LLVM_WASM=$(llvm-wasm-path)');
