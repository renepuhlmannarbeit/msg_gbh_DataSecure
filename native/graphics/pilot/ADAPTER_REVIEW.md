# Bounded offline Office graphics adapter — author result

2026-10-23. Ready for the main agent's independent source review and native
integration, NOT a release, security certification or universal-format promise.
The prior untested WASM draft/checkpoint is preserved and is not the selected
product implementation.

## Delivered source and actual checks

- `plugins/data-secure/server/standalone/office-visual-decoder.js`:
  SHA256 `013ba1c6e86a5b6158589f7d5ff690d9c23a9e36867158cf6dd28628856e536b`.
- `tests/test-office-visual-decoder.mjs`:
  SHA256 `10a101f8dccd516780e87f1b614463cb6abb2b9e416af24102476353e78ebb33`.
- Pinned Node 22.23.2: 31/31 bounded synthetic test groups, actual exit 0.
  Exact output and input/dependency hashes:
  `dist/rc172-graphics-source-ready-20261023/TEST-RESULT.json`.
- Actual raster executions used the existing approved Windows Canvas 1.0.7
  addon: SVG shape pixels; German glyph text; static WebP; EMF and placeable WMF
  basic shapes; EMF Unicode text; first-party GIF/TIFF to Canvas PNG.
- GIF tests include disposal 2/3, transparency, interlace, strict truncated LZW,
  real Canvas-generated dictionary growth, multiple frames and 151-frame limit.
  TIFF includes both byte orders, bilevel/gray/RGB/palette/straight and
  premultiplied alpha, PackBits, Deflate predictor, output-bomb refusal,
  ten pages, unsupported-page omission with a surviving later page, 151-page
  limit, IFD cycles and out-of-file strips. Test group count is 31, not 31 files.
- Real WebP downsampling countercase verifies both colored image halves survive
  a 20x10 to 10x5 scale; the initial unscaled drawImage crop was corrected.
- SVG external refs, source fonts, CSS escapes/important, script, image,
  foreignObject, filters, DTD, invalid/path/transform/point grammar, reference
  cycles/expansion and huge dimensions are rejected before native rendering.
- Unknown/EMF+/bad-handle/invalid UTF-16/matrix/offset and WMF-checksum
  countercases reject before upstream permissive replay. The EMF browser module
  was loaded with any Canvas-peer module request set to throw: zero requests.
- After modules and fonts were supplied, JS filesystem-read and fetch functions
  were made to throw while actual SVG/EMF renders still passed. This is scoped
  evidence, NOT proof of zero native filesystem operations; see font limits.
- Early generator return and source byte immutability checked. Unexpected
  backend diagnostics are converted to content-free typed errors. Existing
  explicit cancellation/timeout codes are preserved.

No Office worker/OOXML integration, runner registration, packaging helper,
version, product docs, commit, full build, Desktop UI or macOS runtime was
changed/tested by this author task. PDF delta is now owned by another author;
independent ToUnicode/table-order counterexamples are not rebutted here.

## Integration API and output ownership

CommonJS exports:

```js
inspectOfficeVisual(buffer, format)
async function* decodeOfficeVisual(buffer, format, {
  canvasApi,          // existing approved @napi-rs/canvas 1.0.7 API
  fontBuffers,        // immutable fixed bundled TTF bytes, not source fonts
  loadBundledModule, // only accepts emf-converter/dist/browser.js
  maxOutputPixels,   // optional integer 1..30,000,000; aggregate per asset
})
graphicsDecoderContract
```

Accepted format strings: `svg`, `gif`, `tif`, `tiff`, `webp`, `emf`, `wmf`.
No path, URI, font name, OS command, plugin path or user-controlled loader is
accepted. Root buffers are preflighted before passing any bytes to Canvas.
The trusted caller must load fixed approved modules/fonts before decoding,
with `DISABLE_SYSTEM_FONTS_LOAD=1` set before Canvas import. Main integration
must keep the existing isolated worker/parent timeout, memory, cancellation,
ownership, request-snapshot and privacy-before-publication boundaries.

Output is one item for every admitted frame/page, never silent first-frame-only:

```js
{ png, width, height, index, total, downsampled, warning_codes }
// or an explicitly unsupported/over-budget independent TIFF page or late frame
{ index, total, omission_code }
```

`index` is 1-based; the caller owns yielded PNG bytes. `maxOutputPixels` is
fairly divided by the number of pages/frames; a too-small budget emits explicit
omissions, not a zero-size fake image. Scaling preserves the whole field of
view and emits `VISUAL_RASTER_DOWNSAMPLED`; OCR quality can fall after scaling.
Single decode peak remains 30 MP; 25 MiB source bytes, 150 units, 10,000
records/nodes, 32,768 per axis and 120 MP cumulative GIF/TIFF source work are
additional caps, not enlarged product limits. Do not multiply the caller's
shared OCR budget by asset/frame count. No source bytes are mutated.

Main must map typed reasons into its closed coverage schema and preserve
partial-file notices. Root structural failure stops this asset; caller keeps
independently extracted safe Office text and other usable assets. This adapter
does not disable original archive/reference/guard checks to salvage media.

## Admitted subsets and honest omissions

| Format | Bounded admission | Explicit unsupported / limitations |
| --- | --- | --- |
| SVG | Strict static SVG namespace, shapes/paths/groups, closed internal references and gradients/clips, text with pinned bundled alias | No external/file/data image refs, fonts, CSS imports/escape, script, foreignObject, filters or animation; malformed and unbounded path/ref graphs refuse; native Skia subset/typography is not an Office rendering-equivalence proof |
| GIF | All bounded frames with transparency, interlace, disposal 0/1/2/3 and strict LZW | PlainText/user-input and unsupported disposal extensions refuse; per-asset unit/work/pixel caps remain explicit |
| TIFF | Classic endian TIFF, orientation 1, chunky strips, 1/8-bit grayscale/palette, 8-bit RGB and explicit alpha; raw/PackBits/Deflate with expected output cap | BigTIFF, LZW, CCITT, JPEG, tiled/sub-IFD, non-default orientation, other sample formats/depths or unsupported independent pages are not silently flattened |
| WebP | Header-checked static VP8/VP8L byte buffer through existing approved Canvas | Animation explicitly unsupported before decode, not first-frame success; actual positive raster test covers lossy VP8; VP8L header path remains dependent on existing native support, not newly claimed bit-exact validation |
| EMF | Closed basic plain-GDI records/shapes/transforms/handles/Unicode text; fixed browser build to strict SVG then existing Canvas | No EMF+, comments/escapes, bitmap/nested files, unknown records or approximate ROP2; source fonts substituted and warned; not a full GDI renderer |
| WMF | Placeable header/checksum/units plus closed basic shapes/state/handles/default Windows character-set font subset | No guessed nonplaceable bounds, unknown/escape/bitmap records or guessed Symbol/DOS/CJK encodings; not full WMF/EMF fidelity |

Warning codes: `VISUAL_BUNDLED_FONT_SUBSTITUTION`,
`VISUAL_RASTER_DOWNSAMPLED`.

Error/omission codes: `VISUAL_CONTENT_DAMAGED`,
`VISUAL_FEATURE_UNSUPPORTED`, `VISUAL_PROCESSING_LIMIT`,
`VISUAL_EXTERNAL_REFERENCE`, `VISUAL_ANIMATION_UNSUPPORTED`,
`VISUAL_FONT_UNAVAILABLE`, `VISUAL_DECODER_POLICY`,
`VISUAL_METAFILE_RECORD_UNSUPPORTED`, `VISUAL_EMF_PLUS_UNSUPPORTED`.
No native exception text, content or user path is appended to them.

## Selected dependency and license closure

Only new npm dependency: **emf-converter 4.18.1**, Apache-2.0,
git `29fa0496779d6ec4bc11e289614e3a05299eb6b7`.
Registry integrity is fixed in package-lock:
`sha512-e/H8eBnj/QO8sWL2Yav02n58wWVo3GWYqFM2SqJh2bk9Prc2rgexPUSs8VV42GL5l/x49GaK/kPueCDW+j+6Sg==`.
No new transitive npm dependency is selected by the lock. Installation used
`--ignore-scripts --legacy-peer-deps --no-audit --no-fund`; no Canvas upgrade.

Runtime selection below is an unmodified published browser bundle, not the
Node entry. The Node entry's SVG API unconditionally attempts the optional
Canvas ^1.0.9 loader; **do not use it**. Node package `exports` does not expose
the `dist/browser.js` subpath, so the trusted runtime loader must resolve its
fixed approved bundled absolute file, not call bare require on a forbidden
package subpath or permit a source-controlled loader.

| Selected package-relative file | SHA256 |
| --- | --- |
| `dist/browser.js` | `00d79f4bf38405d7cae45129ca8367451f866cfb29a0722f8b21d3f107834634` |
| `package.json` | `41a46e1120222387d7bcad8abb98c4b3a02f6f01a9bd882f2c1eff9f70d216f4` |
| `LICENSE` | `2c27550900d2cabf83527a04600ba8042e3ba89e70ec077ff220afa48c8230a7` |
| `THIRD_PARTY_NOTICES` | `704660e21c5c53db7b50e86edc948d6121cb34019b65264411b109d6b6044c0c` |

Retain the full unmodified LICENSE and THIRD_PARTY_NOTICES even though the
closed record gate does not invoke the bundle's other image codecs. Notices
cover jpeg-js (BSD-3-Clause), gifuct-js, js-binary-schema-parser, UTIF and pako
(MIT), plus IJG-derived decoder code and the required acknowledgement:
**This software is based in part on the work of the Independent JPEG Group.**
The complete notice also retains repository-only test-image/ICC notices;
those images/profile files are not selected runtime assets. No Wine/Microsoft
code, proprietary Office runtime or private fonts are added by this adapter.

Reuse existing unchanged **@napi-rs/canvas 1.0.7** (existing license closure,
MIT package and already approved target addon) and existing PDF.js
`LiberationSans-Regular.ttf` (OFL-1.1, unchanged bytes). Include its
`LICENSE_LIBERATION` alongside selected font bytes. Actual test font SHA256:
`f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f`;
font license SHA256:
`93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b`.
The worker may choose more fixed approved fonts, but a worker lifetime permits
only one exact font-buffer set; do not repeatedly unregister/re-register.

No resvg WASM is selected. `LICENSE_RESVG_MPL_2_0.txt` and the initial draft
are historical research, NOT runtime/approval files. The package is MPL-2.0,
not MIT; exact compiled WASM transitive-source provenance was unresolved, so
it was deliberately replaced, not claimed cleared. The ignored development
node_modules may still contain that experimental package: **never copy the
entire node_modules tree**, select only the closure above. No actual resvg
WASM execution is claimed for the selected result.

## Source basis and native-font constraint

Primary sources inspected for the relevant loading/rendering paths:

- [emf-converter pinned source](https://github.com/ChristopherVR/emf-converter/tree/29fa0496779d6ec4bc11e289614e3a05299eb6b7):
  public converter path, replay, SVG context, browser-runtime.ts,
  tsup.browser.config.ts, font loader, LICENSE and full THIRD_PARTY_NOTICES.
  Browser substitutions return no Node Canvas module/system-font collection.
- [Canvas exact v1.0.7 commit](https://github.com/Brooooooklyn/canvas/tree/062130c03715f275fd46a59a4bb224e907c91686):
  index.js, load-image.js, src/image.rs, src/global_fonts.rs, src/svg.rs and
  skia-c/skia_c.cpp/.hpp memory-buffer SVG rendering and font manager paths.
- [TIFF 7.1.3 candidate](https://github.com/image-js/tiff/tree/v7.1.3/src):
  its growing Deflate/LZW output path was not suitable for this bounded
  pre-decode budget; rejected, not installed. The implementation here is a
  narrow first-party decoder with exact expected strip output length.

Important existing-backend limitation: `DISABLE_SYSTEM_FONTS_LOAD=1` disables
Canvas JS system/private-home font discovery, but the native 1.0.7
FontCollection still initializes its fixed standard OS font directory
(`C:/Windows/Fonts`, `/System/Library/Fonts`, or `/usr/share/fonts`). Thus
**zero native filesystem access cannot be claimed** without a native addon
change/rebuild, which this task deliberately does not perform. No user
directory scan is requested by this adapter. It rewrites document font
families to an owned alias, injects only fixed bundled buffers, validates
Unicode cmap coverage before rendering and refuses unavailable glyphs rather
than accepting private/system fallback as success. Source font substitution
is always a warning. This does not prove every glyph's semantic visibility
or cross-OS typographic equivalence; no universal font/rendering claim.

The caller/main must still verify the final target bundles, package/source
bindings, real Mac execution and global regression before publication.
