// The shape of the payload, and how a read is checked.
//
// The archives ship as one gzipped file each (`out/lib/libLLVMCore.a.gz`) rather than
// as loose files or as one archive: a browser can inflate gzip with
// `DecompressionStream`, which is the only decompressor it has, and it can fetch just
// the archives it needs. A CDN then serves bytes that are already compressed, one
// request per archive.
//
// Two sources behind one shape: `hosted` fetches (a page, or anything pointed at a CDN)
// and `packaged` reads what ships in the package (Node). Both hand back *inflated*
// bytes, because nothing downstream wants gzip.
import { ASSET_RECEIPTS } from './asset-receipts.js';

/** The archives this package ships, in a stable order. */
export const assetNames = () => Object.keys(ASSET_RECEIPTS).sort();

/** sha256 of some bytes, as hex, using whatever the platform provides. */
export async function sha256Hex(bytes) {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) {
		throw new Error(
			'Verifying the archives needs crypto.subtle: a secure context in the browser, or Node 20 and later.'
		);
	}
	const digest = await subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Check gzipped bytes against the pinned receipt for that archive — length first, so a
 * truncated download is named without hashing it.
 *
 * @param {string} name - an archive's name, e.g. `libLLVMCore.a`
 * @param {Uint8Array} bytes - the *gzipped* bytes, as they are served
 */
export async function verifyReceipt(name, bytes) {
	const receipt = ASSET_RECEIPTS[name];
	if (!receipt) throw new Error(`No pinned receipt for the archive ${name}`);
	if (bytes.byteLength !== receipt.bytes) {
		throw new Error(`The archive ${name} is ${bytes.byteLength} bytes, expected ${receipt.bytes}`);
	}
	const digest = await sha256Hex(bytes);
	if (digest !== receipt.sha256) {
		throw new Error(
			`The archive ${name} failed SHA-256 verification: expected ${receipt.sha256}, got ${digest}`
		);
	}
	return bytes;
}

/** A base URL to fetch from: http(s), with the trailing slash made explicit. */
export function resolveBaseUrl(value) {
	const base = new URL(String(value), typeof location === 'undefined' ? undefined : location.href);
	if (base.protocol !== 'http:' && base.protocol !== 'https:') {
		throw new Error('baseUrl must use HTTP(S).');
	}
	if (!base.pathname.endsWith('/')) base.pathname += '/';
	return base;
}

/**
 * Load archives, whichever source is in play.
 *
 * @param {object} options
 * @param {(name: string) => Promise<Uint8Array>} options.read - the gzipped bytes of one
 *   archive, checked against its receipt
 * @param {(name: string) => Promise<Uint8Array>} options.inflate
 * @param {string[]} [options.only] - just these archives, by name; the point of one file
 *   each is that a caller can take only what it links
 * @param {(text: string) => void} [options.onStatus]
 * @param {(fraction: number) => void} [options.onProgress] - 0 to 1, by bytes
 * @returns {Promise<Record<string, Uint8Array>>} inflated archives, keyed by name
 */
export async function loadArchives({ read, inflate, only, onStatus, onProgress }) {
	const wanted = only ? only.slice().sort() : assetNames();
	for (const name of wanted) {
		if (!ASSET_RECEIPTS[name]) throw new Error(`No such archive: ${name}`);
	}

	const total = wanted.reduce((sum, name) => sum + ASSET_RECEIPTS[name].bytes, 0);
	let loaded = 0;
	const out = {};

	for (const name of wanted) {
		onStatus?.(name);
		const gzipped = await read(name);
		loaded += gzipped.byteLength;
		onProgress?.(total ? Math.min(1, loaded / total) : 0);
		out[name] = await inflate(gzipped);
	}

	return out;
}
