#!/usr/bin/env node
// Prove the browser path: serve this package over HTTP and load the archives through the
// browser entry, which is what a page does with a CDN URL.
//
//   node scripts/check-load.mjs
//
// Node has `fetch`, `DecompressionStream`, `Blob`, `Response` and `crypto.subtle`, so
// `src/index.js` — the entry a browser gets — runs here unchanged. What a real browser adds
// is CORS (the CDN's business) and the secure context `crypto.subtle` needs, which any
// https URL or localhost has.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_RECEIPTS } from '../src/asset-receipts.js';

const root = fileURLToPath(new URL('..', import.meta.url));

const MIME = {
	'.a': 'application/octet-stream',
	'.gz': 'application/gzip',
	'.h': 'text/plain; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8'
};

const AR_MAGIC = '!<arch>\n';

const server = createServer(async (req, res) => {
	try {
		const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '');
		const target = resolve(join(root, normalize(path)));
		// `fileURLToPath` keeps the trailing separator, so compare relative paths rather
		// than prefixes — `root + sep` would be a doubled separator and never match.
		const inside = relative(root, target);
		if (inside.startsWith('..') || isAbsolute(inside) || !(await stat(target).catch(() => null))?.isFile()) {
			res.writeHead(404).end('not found');
			return;
		}
		res.writeHead(200, { 'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream' });
		res.end(await readFile(target));
	} catch (error) {
		res.writeHead(500).end(String(error));
	}
});

await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
const baseUrl = `http://127.0.0.1:${server.address().port}/`;

try {
	// The browser entry, imported as a page would from the same origin.
	const { loadArchives, assetNames } = await import('../src/index.js');

	const names = assetNames();
	assert.equal(names.length, Object.keys(ASSET_RECEIPTS).length, 'the receipts and the names disagree');

	// 1. A subset — the point of one file per archive: a link takes only what it needs.
	const subset = names.slice(0, 3);
	const partial = await loadArchives({ baseUrl, only: subset });
	assert.deepEqual(Object.keys(partial).sort(), subset.slice().sort());
	for (const [name, bytes] of Object.entries(partial)) {
		assert.ok(bytes.byteLength > 0, `${name} came back empty`);
		assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), AR_MAGIC, `${name} is not an ar archive`);
	}
	console.log(`subset: ${subset.join(', ')} — fetched, verified, inflated`);

	// 2. Everything: the whole payload a page would pull for a full link.
	const all = await loadArchives({ baseUrl });
	assert.equal(Object.keys(all).length, names.length);
	for (const [name, bytes] of Object.entries(all)) {
		assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), AR_MAGIC, `${name} is not an ar archive`);
	}
	const inflated = Object.values(all).reduce((sum, bytes) => sum + bytes.byteLength, 0);
	const expected = Object.values(ASSET_RECEIPTS).reduce((sum, receipt) => sum + receipt.raw, 0);
	assert.equal(inflated, expected, 'the inflated payload is not the size the receipts pin');

	console.log(`all ${names.length} archives: ${(inflated / 1e6).toFixed(1)} MB inflated over HTTP`);
	console.log('OK');
} finally {
	server.close();
}
