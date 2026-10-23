# Offline Office graphics adapter - AUTHOR CHECKPOINT, NOT RELEASE READY

Historical initial, untested WASM draft only. Superseded by the actually tested
existing-Canvas result in `ADAPTER_REVIEW.md`; the draft itself is preserved at
`dist/rc172-graphics-wasm-source-checkpoint-20261023/office-visual-decoder.js`.
Hashes and NOT READY statements below describe that historical state, not the
new Canvas adapter. resvg is not in the selected product dependency lock.

2026-10-23. Work paused at the main agent's explicit checkpoint request while
the independently demonstrated PDF ToUnicode/table-order regressions are fixed.
Do not import this adapter into the product worker or claim a decoder PASS yet.

## Preserved files and state

- `plugins/data-secure/server/standalone/office-visual-decoder.js`: source draft,
  syntax checked with pinned Node 22.23.2 only; SHA256
  `b449b60ffe9273648a2ed5bd7a0d031100d9cbc041e698c7ebc689fe37f9f045`.
- Exact package/lock under this directory. Installed using `npm install
  --ignore-scripts --legacy-peer-deps --no-audit --no-fund`; two packages only,
  no Canvas peer installation or upgrade. No foreign package/wasm executed.
- `package.json` SHA256
  `d11e04aa131b47ef3795fd268c95692283921399b97b7c8fc873fa72726d66ee`.
- `package-lock.json` SHA256
  `fee862f93c3340a98da038be596ab060599d8e934f1a92655b18f3a89c89a9cd`.
- Upstream resvg MPL-2.0 text preserved because the npm package omits a licence
  file. `LICENSE_RESVG_MPL_2_0.txt` SHA256
  `1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5`.
- No original user files/diagnostics/fixtures read, changed or uploaded.
- No own terminal processes remain. No build, UI, commit, worker/runner or
  packaging-helper changes in this second task.

## Draft byte-only API

`inspectOfficeVisual(Buffer, format)` preflights headers/structure, then
`decodeOfficeVisual(Buffer, format, options)` is an async generator yielding
`{png,width,height,index,total,warning_codes}` or an explicit
`{index,total,omission_code}`. Options provide an already-approved `canvasApi`,
immutable `fontBuffers`, `defaultFontFamily` and trusted closed
`loadBundledModule` / `loadBundledWasm` callbacks. No document-controlled module,
font or file path is accepted by the adapter.

Planned scope present in the draft, NOT yet validated:

- Static SVG through resvg WASM with strict XML/element/reference gate,
  injected bundled fonts and no system-font loading.
- GIF frame/disposal-aware first-party bounded LZW/compositing, not first frame.
- Classic TIFF separate pages, 1/8-bit grayscale/palette/RGB, uncompressed,
  PackBits and native zlib with explicit expected-output limit. Other codecs,
  BigTIFF, orientation, tiles and sub-IFDs are explicit unsupported features.
- Static WebP preflight plus the approved existing Canvas raster decoder;
  animated WebP explicitly unsupported, never silently first-frame only.
- Closed basic plain-GDI EMF/placeable-WMF records, SVG-only conversion; unknown
  records, EMF+, escapes, bitmap/nested-metafile records explicitly unsupported.

## Required next work / known risks before any integration

1. Create synthetic tests for every admission/refusal, all GIF disposal types,
   interlace, truncation/EOI, multipage TIFF, predictor/alpha/endianness,
   bounded-deflate bomb, both WebP encodings/animation, EMF/WMF header/record/text
   offsets, unknown records and no-FS/network callback evidence.
2. Bound SVG reference-graph traversal by total operations as well as depth;
   current branching references could exceed a useful work cap. Audit CSS and
   SVG feature admission against actual resvg rendering (no silent omissions).
3. Check malformed-input early throws/cleanup and every preflight dimension
   against actual decoded dimensions. Add bounded synchronous decoder work,
   cancellation/parent-deadline tests and explicit frame ownership cleanup.
4. Revalidate native source bindings, exact pixels and meaningful glyph output,
   including intentionally wrong font/encoding countercases. Native Unicode or
   matching source metadata alone is not proof of visible content correctness.
5. Inspect actual SVG-only emf-converter import/call behaviour: no optional
   Canvas ^1.0.9 load, system-font discovery or hidden decoder call. Do not rely
   only on its stated API. Closed record support is deliberately narrow.
6. Complete licence/NOTICE/SBOM and pinned Rust/WASM transitive licence/source
   availability inventory. resvg npm publisher is MPL-2.0, not MIT. emf-converter
   Apache-2.0 bundle also contains jpeg-js, gifuct-js, js-binary-schema-parser,
   UTIF, pako and IJG-derived components; preserve its THIRD_PARTY_NOTICES even
   when the closed adapter does not call the bundled image codecs.
7. Main agent must register tests, package exact selected modules/WASM/licences
   and existing Liberation Sans font bytes/licence, connect typed omissions to
   allowed product coverage reasons, maintain privacy-before-publication, and
   obtain Windows / both-Mac native evidence. None of that is done here.

## Sources actually inspected (read-only)

- emf-converter 4.18.1, Apache-2.0, git
  `29fa0496779d6ec4bc11e289614e3a05299eb6b7`:
  https://github.com/ChristopherVR/emf-converter/tree/29fa0496779d6ec4bc11e289614e3a05299eb6b7
  `src/emf-converter.ts`, `emf-record-replay.ts`, `svg-context.ts`,
  `load-system-fonts.ts`, `emf-logging.ts`, package.json, LICENSE and
  THIRD_PARTY_NOTICES. Unknown records/limits can warn and return an SVG, so a
  permissive pass-through is not acceptable. The Node Canvas peer is ^1.0.9,
  whereas the existing approved converter uses 1.0.7.
- resvg-wasm 2.6.2, MPL-2.0:
  https://github.com/yisibl/resvg-js/tree/v2.6.2/wasm
  type definitions, JS loader/init API, package and upstream LICENSE.
  `initWasm` can fetch URL inputs; only immutable supplied Uint8Array bytes may
  reach it. Font buffers must be explicit; no fontFiles/fontDirs.
- TIFF 7.1.3, MIT:
  https://github.com/image-js/tiff/tree/v7.1.3/src
  `tiff_decoder.ts`, `types.ts`, `index.ts`, `lzw.ts`, `zlib.ts`, licence and
  package metadata. Rejected as a direct decoder dependency: its Deflate and
  LZW expand into dynamically growing buffers before dimensions constrain the
  output. Not installed. Its page-select API alone does not solve that issue.
- gifuct-js 2.1.2, MIT metadata and upstream `src/index.js`, `src/lzw.js`,
  LICENSE. Not installed separately. Its permissive LZW pads truncated pixels
  with zero; the draft instead has strict first-party bounded decoding.
- Existing bundled LiberationSans-Regular.ttf and LICENSE_LIBERATION were
  inspected in PDF.js standard_fonts. OFL-1.1, no font modification or new
  system font search. The caller still must supply approved exact bytes.

This is a checkpoint, not a completed security review, execution result,
native-platform validation, licence clearance or publication approval.
