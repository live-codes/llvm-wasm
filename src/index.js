// The entry a browser gets: fetch the archives from a URL — a CDN, or wherever the site
// serves them — and inflate them with `DecompressionStream`, which is the only
// decompressor a page has.
//
//   import { loadArchives } from 'https://cdn.jsdelivr.net/npm/@live-codes/llvm-wasm@0.1.0/src/index.js';
//
//   const archives = await loadArchives({
//     baseUrl: 'https://cdn.jsdelivr.net/npm/@live-codes/llvm-wasm@0.1.0/'
//   });
//   // { 'libLLVMCore.a': Uint8Array, … } — verified and inflated, ready to link with
//
// `baseUrl` is required here: a browser cannot read a file inside an npm package, so the
// host that serves the page has to serve the assets too — which a CDN does.
import {
	assetNames,
	loadArchives as load,
	resolveBaseUrl,
	sha256Hex,
	verifyReceipt
} from './assets.js';
import { ASSETS_DIR } from './asset-receipts.js';

const inflate = async (bytes) =>
	new Uint8Array(
		await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
	);

/**
 * Load archives over HTTP(S).
 *
 * @param {object} [options]
 * @param {string} options.baseUrl - where the package is served from, e.g.
 *   `https://cdn.jsdelivr.net/npm/@live-codes/llvm-wasm@0.1.0/`
 * @param {string[]} [options.only] - just these archives, by name (`libLLVMCore.a`).
 *   One file each is the point: a link can take only what it needs.
 * @param {(name: string) => void} [options.onStatus]
 * @param {(fraction: number) => void} [options.onProgress] - 0 to 1, by bytes
 * @returns {Promise<Record<string, Uint8Array>>} inflated archives, keyed by name
 */
export async function loadArchives({ baseUrl, only, onStatus, onProgress } = {}) {
	if (baseUrl == null || baseUrl === '') {
		throw new Error(
			'baseUrl is required here: pass the URL this package is served from, for example ' +
				'https://cdn.jsdelivr.net/npm/@live-codes/llvm-wasm@0.1.0/'
		);
	}
	const base = resolveBaseUrl(baseUrl);

	return load({
		only,
		onStatus,
		onProgress,
		inflate,
		read: async (name) => {
			const url = new URL(`${ASSETS_DIR}/${name}.gz`, base);
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
			// Verified before it is inflated: a wrong-length or wrong-digest file is a
			// message here rather than a linker error a step later.
			return verifyReceipt(name, new Uint8Array(await response.arrayBuffer()));
		}
	});
}

export { assetNames, sha256Hex, verifyReceipt };
export { ASSET_RECEIPTS, ASSETS_DIR, COMPAT_DIR } from './asset-receipts.js';
