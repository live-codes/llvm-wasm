# Third-party notices

The pipeline here — `build.sh`, `fetch.sh`, `toolchain-wasi.cmake`, `patches/`,
`wasi-compat/`, `verify/` — is MIT (see [LICENSE](./LICENSE)). The archives it produces
are not this project's work.

| component | version | licence | what is redistributed |
| --- | --- | --- | --- |
| **LLVM** | 20.1.8 | Apache-2.0 WITH LLVM-exception | `out/lib/*.a` (99 archives) and `out/include/` — the whole built library |
| **wasi-sdk** (clang 22 and the WASI sysroot) | 33 | Apache-2.0 WITH LLVM-exception / MIT | nothing: it built the archives and is not shipped |
| **wasi-libc** | as shipped with wasi-sdk 33 | MIT OR Apache-2.0 WITH LLVM-exception | nothing: a *consumer* links it, the archives only refer to it |

`patches/apply-patches.py` modifies LLVM's source before it is built. The patched files stay
LLVM's, under the same licence as the rest of LLVM; the patch text itself is MIT like the rest
of the pipeline, and every patch is commented with why it exists.

LLVM carries third-party code of its own (zlib among others), all under permissive licences.
`LICENSE.TXT` and `ThirdPartyNotices.txt`, in the LLVM source the archives are built from —
identified by version and by digest in `llvm-wasm.lock.json` — list them.

The `verify/llvm-probe.c` probe is this project's own code, and exists to prove a consumer can
link the archives and call the C API.
