# @live-codes/llvm-wasm

**libLLVM 20.1.8, built as a library for `wasm32-wasip1`** — so a compiler written in another
language can itself be compiled to WebAssembly.

This is an artifact that does not exist anywhere else to download. It is a wasm *library* you link a
program against, which is a different thing from the Clang/LLD *tools*
([`@live-codes/clang-wasm`](https://github.com/live-codes/clang-wasm)) that are wasm *applications*
you run. Its first consumer is
[`@live-codes/crystal-wasm`](https://github.com/live-codes/browser-crystal): Crystal's compiler is
itself a Crystal program that links LLVM, and this is what it links.

## Use

```bash
npm install @live-codes/llvm-wasm
LLVM_WASM=$(npx llvm-wasm-path)     # …/node_modules/@live-codes/llvm-wasm
```

| in the package | what it is |
| --- | --- |
| `out/lib/*.a` | **99 static archives** — LLVM and its WebAssembly backend, for `wasm32-wasip1` |
| `out/include/` | the matching headers |
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

## The size, honestly

The published tarball is **38 MB**, and it installs to **143 MB**: 99 archives (113 MB) and their
headers (33 MB), committed rather than built on install. That is deliberate — rebuilding takes an
hour of someone's machine and produces byte-identical output (`llvm-wasm.lock.json` pins every
input) — and it is the difference between a dependency and a build step for a port. It is heavier
than most packages, though not the 140 MB the installed size suggests.

If even that becomes the deciding factor, the escape hatch is to publish `out/` as a release asset
and fetch it on install — the shape `@live-codes/clang-wasm` uses for its own ~29 MB of tools.
Nothing else in the package would change.

## Licence

MIT for the pipeline, patches and compatibility layer; the archives are LLVM's, under Apache-2.0
WITH LLVM-exception. See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
