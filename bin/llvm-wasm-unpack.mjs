#!/usr/bin/env node
// Put the plain archives back, for a build that reads them as files.
//
//   llvm-wasm-unpack                 # inflate out/lib/*.a.gz into out/lib/*.a
//   llvm-wasm-unpack --if-missing    # skip when they are already there (what postinstall runs)
//
// The package ships the archives gzipped — one file each, which is the shape a browser can
// fetch and inflate with `DecompressionStream`. A *link* on disk wants the plain files, so
// that `-L out/lib`, `-I out/include` and `llvm-wasm-path` mean what they always meant.
// Each archive is checked against the pinned receipt before it is written.
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { ASSET_RECEIPTS, ASSETS_DIR } from '../src/asset-receipts.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
	console.log(`Inflate the archives this package ships.

  llvm-wasm-unpack               out/lib/*.a, from the .gz beside them
  --if-missing                   do nothing when they are already inflated (postinstall)
  --help                         this

A browser does not need this: it fetches out/lib/*.a.gz and inflates them itself. This is
for a build on disk, which links against files.`);
	process.exit(0);
}

const names = Object.keys(ASSET_RECEIPTS).sort();
const plain = (name) => join(root, ASSETS_DIR, name);
const gzipped = (name) => `${plain(name)}.gz`;

if (args.includes('--if-missing')) {
	const missing = [];
	for (const name of names) {
		if (!(await stat(plain(name)).catch(() => null))) missing.push(name);
	}
	if (missing.length === 0) process.exit(0);
}

let written = 0;
let skipped = 0;

for (const name of names) {
	const target = plain(name);
	const archive = gzipped(name);

	const bytes = await readFile(archive).catch(() => null);
	if (!bytes) {
		console.error(`llvm-wasm-unpack: ${archive} is missing.`);
		console.error('In a checkout, rebuild the archives: node scripts/pack-out.mjs');
		process.exit(1);
	}

	// The same check the browser makes, for the same reason: a wrong file is a message
	// here rather than a linker error one step later.
	const receipt = ASSET_RECEIPTS[name];
	const digest = createHash('sha256').update(bytes).digest('hex');
	if (bytes.byteLength !== receipt.bytes || digest !== receipt.sha256) {
		console.error(`llvm-wasm-unpack: ${name}.gz does not match its receipt ` +
			`(${bytes.byteLength} bytes, sha256 ${digest.slice(0, 16)}…)`);
		process.exit(1);
	}

	const current = await stat(target).catch(() => null);
	if (current && current.size === receipt.raw) {
		skipped += 1;
		continue;
	}

	await writeFile(target, gunzipSync(bytes));
	written += 1;
}

console.log(
	`Inflated ${written} archive${written === 1 ? '' : 's'}` +
		(skipped ? `, ${skipped} already there` : '') +
		` into ${join(root, ASSETS_DIR)}`
);
console.log('Point a build at it: LLVM_WASM=$(llvm-wasm-path)');
