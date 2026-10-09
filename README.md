# @live-codes/llvm-wasm

**libLLVM 20.1.8, built as a library for `wasm32-wasip1`** — so a compiler written in another
language can itself be compiled to WebAssembly.

This is an artifact that does not exist anywhere else to download. It is a wasm *library* you link a
program against, which is a different thing from the Clang/LLD *tools*
([`@live-codes/clang-wasm`](https://github.com/live-codes/clang-wasm)) that are wasm *applications*
you run. Its first consumer is
[`@live-codes/crystal-wasm`](https://github.com/live-codes/browser-crystal): Crystal's compiler is
itself a Crystal program that links LLVM, and this is what it links.

## In a browser, from a CDN

The archives ship gzipped, one file each, so a page can take the ones it links and inflate
them with `DecompressionStream` — the only decompressor a browser has:

```js
import { loadArchives, assetNames } from 'https://cdn.jsdelivr.net/npm/@live-codes/llvm-wasm@0.1.0/src/index.js';

const baseUrl = 'https://cdn.jsdelivr.net/npm/@live-codes/llvm-wasm@0.1.0/';

// Only what this link needs — which is the point of one file per archive.
const archives = await loadArchives({ baseUrl, only: ['libLLVMCore.a', 'libLLVMSupport.a'] });
// { 'libLLVMCore.a': Uint8Array, … } — verified and inflated, ready to hand to a linker
// (a WASI `wasm-ld`; see how @live-codes/crystal-wasm runs one in a page).

assetNames();          // every archive, in a stable order
```

Every read is checked against the receipts in `src/asset-receipts.js` — length first, then
SHA-256 — so a truncated download or a host serving something else is a message rather than
a linker error a step later. Nothing is fetched twice, and nothing is fetched that the link
does not name.

`wasi-compat/` is *not* gzipped: it is small, and it has to be compiled and linked alongside
the archives. The same goes for `out/include/`, which a C or C++ build needs as files and a
browser never wants.

## Use on disk

```bash
npm install @live-codes/llvm-wasm       # inflates the archives into out/lib on install
LLVM_WASM=$(npx llvm-wasm-path)         # …/node_modules/@live-codes/llvm-wasm
```

A link on disk wants the plain files — `-L out/lib`, `-I out/include` — so `postinstall`
inflates them. Where lifecycle scripts are skipped (`--ignore-scripts`, or a CI that blocks
them), run it yourself; it is one command, and it checks each archive against its receipt
before writing it:

```bash
npx llvm-wasm-unpack
```

| in the package | what it is |
| --- | --- |
| `out/lib/*.a.gz` | **99 static archives** — LLVM and its WebAssembly backend, for `wasm32-wasip1` — one gzipped file each. **This is what a browser fetches** |
| `out/lib/*.a` | the same archives, inflated, after `llvm-wasm-unpack` or `postinstall` |
| `out/include/` | the headers, loose: a linked build needs them as files, and a browser never wants them |
| `wasi-compat/` | declarations and stub definitions for the POSIX surface WASI does not have — **link this with the archives**, or you will hit undefined `pwd`, `dlopen`, `sigaction`, `fork` and friends |
| `patches/apply-patches.py` | every source edit that made the build possible |
| `verify/` | the C-API probe: links against all 99 archives and runs under Node's WASI |

Linking goes through a cross-compiler for `wasm32-wasip1` (wasi-sdk 33 is the one this was built
with), and the compatibility layer has to be compiled and linked in as `verify/run-probe.sh` does:

```bash
LLVM=$(npx llvm-wasm-path)
clang --target=wasm32-wasip1 --sysroot="$WASI_SDK/share/wasi-sysroot" -O1 \
  -I"$LLVM/wasi-compat/include" -include wasi-compat.h -c "$LLVM/wasi-compat/compat.c" -o compat.o

clang --target=wasm32-wasip1 --sysroot="$WASI_SDK/share/wasi-sysroot" \
  -I"$LLVM/out/include" -nostartfiles \
  your.o compat.o \
  -Wl,--start-group $(ls "$LLVM"/out/lib/libLLVM*.a) -Wl,--end-group \
  -lwasi-emulated-signal -lwasi-emulated-mman -lwasi-emulated-getpid -lwasi-emulated-process-clocks \
  -o your.wasm
```

`--start-group`/`--end-group` costs nothing and is the safe form: LLVM's archives reference each
other, and a plain list only links if it happens to be in an order that resolves. The Crystal
compiler's own link (`build/crystal-wasm/link.sh` in the consuming repository) does use a plain
sorted list, which works — but that is an observation, not a guarantee to rely on.

## How it is built

Three stages, because an LLVM cross-compile cannot run a wasm `llvm-tblgen`:

```
llvm-project-20.1.8.src.tar.xz          147 MB, downloaded with range-resume
  → stage A: llvm-tblgen built natively  (the host tool the cross build needs)
  → stage B: cmake --toolchain-file toolchain-wasi.cmake
             -DLLVM_TABLEGEN=<host tblgen> -DLLVM_TARGETS_TO_BUILD=WebAssembly
             → libLLVM*.a for wasm32-wasip1
  → stage C: pack archives + headers into out/
  → stage D: link verify/llvm-probe.c against them and run it
```

The host cross-compiler is **wasi-sdk 33** (clang 22 targeting `wasm32-wasip1`, plus the WASI
sysroot with libc and libc++). The run is ~an hour on 12 cores.

### Why wasm32-wasi, and why LLVM 20

- **WASI, not Emscripten.** Crystal only ever emits `wasm32-unknown-wasi` — it has no Emscripten
  target — so the libLLVM its compiler links must itself be wasm32-wasi. It also keeps the stack
  coherent: the consumer runs WASI preview 1 modules, and clang-wasm's `lld.wasm` is WASI too.
- **LLVM 20.1.8.** Crystal 1.17 supports LLVM 8–20 (`src/llvm/lib_llvm.cr`: `IS_LT_210` is the last
  comparison). 20.1.8 is the newest release it accepts, so the library is pinned to that rather than
  to whatever is current.
- **WebAssembly backend only.** `LLVM_TARGETS_TO_BUILD=WebAssembly` — the consumer only ever emits
  wasm objects, so no other codegen is built.

## Reproduce

Linux or WSL. Needs `cmake >= 3.20`, `ninja`, a native C/C++ compiler, `curl`, `tar`, `xz`, and an
extracted wasi-sdk (see `llvm-wasm.lock.json`).

```bash
WASI_SDK=/opt/wasi-sdk-33 bash build.sh
# or one stage at a time:
STAGE=fetch bash build.sh
STAGE=host  bash build.sh
STAGE=cross bash build.sh
STAGE=pack  bash build.sh
STAGE=verify bash build.sh
```

Env: `WORK` (build tree, default `/root/bc-llvm`), `CACHE` (downloads, `/root/.cache/browser-crystal`),
`OUT` (packaged result, `out/`), `JOBS`, `WASI_SDK`.

| file | what it is |
| --- | --- |
| `llvm-wasm.lock.json` | Pinned LLVM + wasi-sdk inputs and why |
| `fetch.sh` | Parallel, resumable download (the network throttles a single connection) |
| `toolchain-wasi.cmake` | CMake cross toolchain file for `wasm32-wasip1` |
| `patches/apply-patches.py` | Every LLVM source edit, idempotent and commented |
| `wasi-compat/` | Declarations + stub definitions for the POSIX calls WASI lacks |
| `build.sh` | The four stages |
| `verify/llvm-probe.c` | Links against the built libLLVM and exercises the C API |
| `verify/run-probe.sh` | Compiles, links and runs the probe under Node's WASI |
| `STATUS.md` | Live status: what builds, what remains |

`npm pack` runs `scripts/pack-out.mjs` first: it gzips each archive in `out/lib` and rewrites
`src/asset-receipts.js`, the pin that both the browser entry and `llvm-wasm-unpack` check
against. It re-gzips only what changed, so a stale `.gz` cannot be published, and it refuses to
pack an incomplete `out/`. `npm run check` then loads the archives through the browser entry
over HTTP — the one path the tarball has to keep working.

## The size, honestly

**37.7 MB to download, ~178 MB installed.** The tarball is 32.5 MB of gzipped archives plus
the headers (which npm's own gzip shrinks a little further); `postinstall` inflates the
archives in place, so an installed package holds both the `.gz` a browser would fetch and the
plain `.a` a linker reads.

A single `.tar.xz` of the whole tree would be **22 MB** — half again smaller — and it is the
wrong answer here: a browser cannot open xz without a decoder it does not have, and reaching
one archive would mean inflating all 142 MB. One gzipped file per archive is what a page can
actually use: `DecompressionStream`, and only the archives the link names. The browser is the
target, so the tarball carries the ~15 MB that costs.

The archives are committed rather than built on install, deliberately — a rebuild takes an
hour of someone's machine and produces byte-identical output (`llvm-wasm.lock.json` pins
every input; `src/asset-receipts.js` pins the shipped bytes).

## Licence

MIT for the pipeline, patches and compatibility layer; the archives are LLVM's, under Apache-2.0
WITH LLVM-exception. See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
