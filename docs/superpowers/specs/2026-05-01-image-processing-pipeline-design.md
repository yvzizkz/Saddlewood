> SUPERSEDED (2026-08-27): the image pipeline and photo hero were removed in the Night Blueprint photo-free redesign. Kept for history.

# Image Processing Pipeline — Design

**Date:** 2026-05-01
**Status:** Approved

## Problem

New photos for the site arrive as a mix of MLS exports and phone shots — inconsistent dimensions, possible GPS EXIF embedded, and unknown quality levels. Privacy is the primary driver: these are photos of private luxury homes in Paradise Valley and we cannot ship images carrying location metadata. Secondary driver: producing a consistent source-resolution baseline so Next.js Image (which already handles responsive variants and AVIF/WebP negotiation at request time) gets a predictable input.

The ~95 production images already in `public/images/` may also be carrying GPS EXIF baked in by prior workflows. Cleaning them up retroactively is part of scope.

## Non-goals

- Replacing Next.js Image. Next.js continues to handle responsive variants and format negotiation at request time. This pipeline produces a single source JPEG per photo.
- Pre-generating AVIF/WebP/JPEG variants at multiple widths. That work is done by Next.js Image at request time.
- A skip-if-already-processed gate. The pipeline is intended for one-shot intake (default mode) and one-shot migration (`--reprocess` mode). Re-running incurs a small cumulative re-encode loss; we accept this rather than build a date/hash gate.
- Watch mode, file-system triggers, per-image quality overrides, HEIC input, subfolder recursion in `--reprocess`.

## Architecture

A single TypeScript script, `scripts/process-images.ts`, run via `tsx`. Configuration lives in `scripts/rename-map.json`. Audit log is generated at `public/images/manifest.json`.

```
┌─ default mode (intake) ─────────────────┐    ┌─ --reprocess mode (migration) ──┐
│ inputs: rename-map.json keys, found in: │    │ inputs: public/images/*.jpg     │
│   1. raw-images/<basename>              │    │ (top-level only; excludes       │
│   2. public/images/other/<basename>     │    │  logo.png, logo.svg)            │
│ output basename: rename-map[key]        │    │ output basename: same as input  │
└─────────┬───────────────────────────────┘    └─────────┬───────────────────────┘
          │                                              │
          └──────────────┬───────────────────────────────┘
                         ▼
        ┌────────── per-file pipeline ─────────────┐
        │ 1. probe original dims and size          │
        │ 2. if --upscale AND longest_side<1600:   │
        │      try realesrgan-ncnn-vulkan          │
        │      (PATH lookup, graceful skip)        │
        │ 3. sharp:                                │
        │      .rotate()           bake EXIF orient│
        │      .resize(2400,2400,                  │
        │              fit:'inside',               │
        │              withoutEnlargement:false)   │
        │      .jpeg({quality:85,                  │
        │             mozjpeg:true,                │
        │             progressive:true})           │
        │      (no .keepMetadata → EXIF stripped)  │
        │ 4. write to public/images/<output>       │
        │ 5. record manifest entry                 │
        └──────────────────────────────────────────┘
                         ▼
              public/images/manifest.json
```

### Modes

**Default (intake):** Reads `scripts/rename-map.json`, processes each entry. For each rename-map key, the script searches for the file in `raw-images/` first, then `public/images/other/`. First match wins. Output basename comes from the rename-map value. Output is written to `public/images/<output>`.

**`--reprocess`:** Reads top-level `*.jpg` files in `public/images/`. Skips logos and any subfolder. Each input is processed in place — same basename in, same basename out. Strips EXIF and resizes if it exceeds the 2400px longest-side cap.

The two modes share the same per-file processing core. They can be combined with `--upscale`, though that combination is pointless on the existing production files (already > 2000px).

## Per-file pipeline

1. **Probe.** Read original width, height, file size via `sharp(input).metadata()`.
2. **Optional upscale.** Only when `--upscale` flag is set AND longest side of source is below 1600px (see Real-ESRGAN section).
3. **Sharp transform.**
   - `.rotate()` first — bakes the EXIF Orientation tag into pixel data. Required because the next step strips EXIF; without `.rotate()` first, sideways-shot iPhone photos would render rotated.
   - `.resize(2400, 2400, { fit: 'inside', withoutEnlargement: false })` — preserves aspect ratio, scales up small images (matters for portrait inputs and when not using Real-ESRGAN), caps the longest side at 2400.
   - `.jpeg({ quality: 85, mozjpeg: true, progressive: true })` — see Output settings.
   - No `.keepMetadata()` call — sharp's default re-encode strips EXIF, GPS, ICC profile, and all other metadata.
4. **Write** to `public/images/<output-basename>`. Default mode uses the rename map; `--reprocess` uses the input basename unchanged.
5. **Manifest entry** recorded for the output.

## Manifest schema

`public/images/manifest.json` — committed to git as the audit trail.

```json
{
  "version": 1,
  "generated_at": "2026-05-01T17:42:00.000Z",
  "images": {
    "pv-master-bath-silver-tub-wide.jpg": {
      "source": "raw-images/IMG_5031.JPEG",
      "source_mode": "intake",
      "original_dimensions": { "width": 4032, "height": 3024 },
      "output_dimensions":   { "width": 2400, "height": 1800 },
      "resized": true,
      "upscaled": false,
      "exif_stripped": true,
      "processed_at": "2026-05-01T17:42:00.000Z"
    },
    "pv-kitchen-island-wide.jpg": {
      "source": "public/images/pv-kitchen-island-wide.jpg",
      "source_mode": "reprocess",
      "original_dimensions": { "width": 1920, "height": 1280 },
      "output_dimensions":   { "width": 1920, "height": 1280 },
      "resized": false,
      "upscaled": false,
      "exif_stripped": true,
      "processed_at": "2026-05-01T17:42:00.000Z"
    }
  }
}
```

- **Keyed by output basename** — easy lookup, exactly one entry per output file. Re-processing the same file overwrites its entry.
- **`generated_at`** — updated each run.
- **`processed_at`** — per-image, set when that image was last processed.
- **`source_mode`** — `"intake"` or `"reprocess"`. Helps audit which files came through which path.
- **`upscaled: true`** means Real-ESRGAN ran and produced the input to sharp. `false` covers both "didn't run" and "binary missing or failed" — the run log shows which.
- **`resized: true`** means output dimensions differ from original.

The manifest preserves entries from prior runs; rerunning either mode updates only the entries it touches. Removing an output file does not auto-remove its manifest entry — manifest cleanup is manual if it ever matters.

## JPEG output settings

- **Quality 85, mozjpeg encoder, progressive.** Mozjpeg gives ~10–15% smaller files than libjpeg-turbo at the same visual quality. Progressive helps perceived performance. For luxury-home photography, 85 is the sweet spot — 90 wastes bytes; 80 starts showing artifacts in smooth gradients (skies, walls).
- **Chroma subsampling 4:2:0** (sharp default). Standard for web. 4:4:4 would be ~30–40% bigger for color fidelity most viewers cannot see.
- **EXIF stripped, ICC profile dropped.** All outputs assumed sRGB. Modern browsers handle sRGB-without-profile correctly.

## Real-ESRGAN integration

Triggered only when `--upscale` flag is set AND source longest-side < 1600px.

Pseudocode:

```ts
async function maybeUpscale(inputPath: string, dims: { w: number; h: number }):
    Promise<{ path: string; upscaled: boolean }> {
  if (!flags.upscale) return { path: inputPath, upscaled: false };
  if (Math.max(dims.w, dims.h) >= 1600) return { path: inputPath, upscaled: false };

  const bin = await which('realesrgan-ncnn-vulkan');
  if (!bin) {
    if (!installHintShown) {
      console.warn('[upscale] realesrgan-ncnn-vulkan not found on PATH.');
      console.warn('[upscale] Install: https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases');
      console.warn('[upscale] Extract zip, add directory to PATH. Skipping upscaling for this run.');
      installHintShown = true;
    }
    return { path: inputPath, upscaled: false };
  }

  const tmpOut = path.join(os.tmpdir(), `upscale-${randomId()}.png`);
  try {
    await execFile(bin, ['-i', inputPath, '-o', tmpOut,
                         '-n', 'realesrgan-x4plus', '-s', '4']);
    return { path: tmpOut, upscaled: true };
  } catch (err) {
    console.warn(`[upscale] realesrgan failed for ${inputPath}, falling back to sharp-only:`, err);
    return { path: inputPath, upscaled: false };
  }
}
```

Tempfile cleanup happens in a `finally` block per-file.

The current batch will not exercise this code path — every input image is already > 2000px on the longest side. The graceful-skip behavior on missing binary is the only path that will be tested in this round; the actual upscaling path is future infrastructure.

## CLI surface

```jsonc
// package.json scripts
{
  "images:process":           "tsx scripts/process-images.ts",
  "images:process:upscale":   "tsx scripts/process-images.ts --upscale",
  "images:process:reprocess": "tsx scripts/process-images.ts --reprocess"
}
```

Flags supported:

- `--upscale` — enable Real-ESRGAN pre-pass for inputs below 1600px longest side
- `--reprocess` — switch to migration mode (rewrites `public/images/*.jpg` in place)
- `--dry-run` — probe, log what would happen, do not write outputs or manifest
- `--only <basename>` — process only the named file. Matches against the **output** basename in default mode (so `--only pv-master-bath-silver-tub-wide.jpg` reprocesses that one rename-map entry) and against the input/output basename in `--reprocess` mode (input and output are identical there). Errors out on a name that does not match anything — fail-fast for typos.

Combinable: `--reprocess --upscale` works (though pointless on existing files).

## Error handling

- **Rename-map entry has no source file in either input dir:** warn, skip, continue.
- **File in `raw-images/` not listed in rename map:** warn, skip, continue. (You may stage files for the next batch.)
- **Sharp throws on a file:** log the error with filename, skip, continue. Other files still process.
- **Real-ESRGAN binary missing:** warn once at start, run script in sharp-only mode.
- **Real-ESRGAN exits non-zero on a specific file:** warn for that file, fall back to sharp-only for that file, continue.
- **Manifest write failure:** fail loudly. Processed images are already on disk; rerunning rebuilds the manifest.
- **Output filename collision** (two rename-map entries point to the same output basename, or `--reprocess` and intake try to write the same target in one combined run): error and abort before processing anything.

## Dependencies

New devDependencies in `package.json`:

- `sharp` (^0.33) — image processing. Ships prebuilt win32-x64 binary; already transitively pulled in by Next.js so the binaries are cached.
- `tsx` (^4) — TypeScript runner.
- `which` (^4) — PATH lookup helper for the Real-ESRGAN binary check.

## Setup steps (one-time, executed by the implementation plan, not by the script at runtime)

1. `mkdir raw-images`
2. Move 37 `IMG_5031.JPEG` … `IMG_5068.JPEG` from `public/images/` → `raw-images/`. (Note: `IMG_5059.JPEG` is missing from the sequence — preserve that gap.)
3. Add `raw-images/` to `.gitignore`
4. Write `scripts/rename-map.json` with the 37 IMG entries plus the two PNG entries (`new-bathroom-glass-shower.png` and `new-kitchen-shaker-range.png` as keys, sourced from `public/images/other/`).
5. Add `sharp`, `tsx`, `which` to `devDependencies` and run `npm install`.

## Verification

No formal test suite — YAGNI for a one-shot intake script. Verification is performed by running the pipeline on real inputs:

1. **Real run on raw inputs.** Process the 37 IMG files + 2 PNGs in default mode, then run `--reprocess` on the existing ~95 production JPEGs.
2. **EXIF audit.** Spot-check 5 outputs with `sharp(file).metadata()` — the `exif` field should be `undefined`, no GPS data should be present.
3. **Manifest sanity check.** Number of entries should equal number of outputs. Every entry's `output_dimensions.width` and `output_dimensions.height` should both be ≤ 2400.
4. **File-size report.** Print a before/after table per file. If outputs are unexpectedly large or small, tune quality.
5. **Visual spot-check.** Open 5 outputs and compare against the originals for any obvious quality regression.

After implementation, report new dimensions, file sizes, and quality observations across the full run.

## Risks and mitigations

- **Privacy regression on a missed file.** Mitigation: the `--reprocess` mode is the explicit safety net. Run it once across all top-level `public/images/*.jpg` to guarantee every shipped photo has been EXIF-stripped, regardless of when it was originally added. The manifest's `exif_stripped: true` field gives an audit trail.
- **Quality regression on the existing production files.** A one-time re-encode at quality 85 mozjpeg of files that may have been encoded at higher quality previously will be slightly lossy. Mitigation: visual spot-check before committing. If a particular file regresses noticeably, we can exclude it via `--only`-style targeted reruns at a higher quality, but the default settings are designed to be visually transparent.
- **Rename-map drift.** If the rename map is wrong, files get the wrong output names and components reference broken paths. Mitigation: the rename map is reviewed once before running, and the dry-run flag lets us preview output names. Also: this is a one-shot migration — get it right once, then the script is mostly idle.
- **Real-ESRGAN code path bit-rot.** Since we won't exercise upscaling on this batch, the upscaling path could silently break in a future Node/sharp upgrade. Mitigation: accepted risk. The graceful-fallback path (binary missing) is exercised by every default run, which keeps the most important behavior alive. We can add a real upscale test the first time we have a small-input batch.

## Out of scope for this design

These would be additive features in a follow-up if needed:

- Skip-if-already-processed gate based on file hash or `processed_at` date
- HEIC input support
- AVIF/WebP pre-generation (handled by Next.js Image at request time)
- Subfolder recursion in `--reprocess`
- Per-image quality override via the rename map
- Watch mode / file-system trigger
