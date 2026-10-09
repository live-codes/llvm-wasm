// Node: the same call, reading the gzipped archives that ship in the package off disk.
// No baseUrl and no fetch — which is what a build script wants, since it can also just
// use `llvm-wasm-path` and let the linker read the files.
//
//   const archives = await loadArchives({ only: ['libLLVMCore.a'] });
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

import {
	assetNames,
	loadArchives as load,
	resolveBaseUrl,
	sha256Hex,
	verifyReceipt
} from './assets.js';
import { ASSETS_DIR } from './asset-receipts.js';

const root = new URL('../', import.meta.url);
const inflate = async (bytes) => new Uint8Array(gunzipSync(bytes));

/**
 * Load the archives that ship in this package.
 *
 * @param {object} [options]
 * @param {string[]} [options.only] - just these archives, by name
 * @param {(name: string) => void} [options.onStatus]
 * @param {(fraction: number) => void} [options.onProgress] - 0 to 1, by bytes
 * @returns {Promise<Record<string, Uint8Array>>} inflated archives, keyed by name
 */
export async function loadArchives({ only, onStatus, onProgress } = {}) {
	return load({
		only,
		onStatus,
		onProgress,
		inflate,
		read: async (name) =>
			verifyReceipt(name, new Uint8Array(await readFile(new URL(`${ASSETS_DIR}/${name}.gz`, root))))
	});
}

export { assetNames, sha256Hex, verifyReceipt, resolveBaseUrl };
export { ASSET_RECEIPTS, ASSETS_DIR, COMPAT_DIR } from './asset-receipts.js';
