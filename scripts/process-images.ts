#!/usr/bin/env tsx
/**
 * Image processing pipeline. See:
 *   docs/superpowers/specs/2026-05-01-image-processing-pipeline-design.md
 */

import { parseArgs, promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import which from "which";

const execFileAsync = promisify(execFile);

type Flags = {
  upscale: boolean;
  reprocess: boolean;
  dryRun: boolean;
  only: string | undefined;
};

type RenameMap = Record<string, string>;

type JobInput = {
  /** Absolute path to the source file. */
  sourcePath: string;
  /** Path relative to repo root, for manifest. */
  sourceRelative: string;
  /** Output basename in public/images/. */
  outputBasename: string;
  /** Whether this came from raw-images intake or in-place reprocess. */
  sourceMode: "intake" | "reprocess";
};

// tsx may load this file as either CJS or ESM depending on package.json "type".
// Resolve script directory in both cases so REPO_ROOT works regardless.
const SCRIPT_DIR =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const RAW_IMAGES_DIR = path.join(REPO_ROOT, "raw-images");
const PUBLIC_IMAGES_DIR = path.join(REPO_ROOT, "public", "images");
const PUBLIC_IMAGES_OTHER_DIR = path.join(PUBLIC_IMAGES_DIR, "other");
const RENAME_MAP_PATH = path.join(REPO_ROOT, "scripts", "rename-map.json");
const MANIFEST_PATH = path.join(PUBLIC_IMAGES_DIR, "manifest.json");

// Exit codes:
//   0  success / --help
//   1  fatal (uncaught error)
//   2  --only matched no jobs
//   3  output basename collision
function parseFlags(): Flags {
  const { values } = parseArgs({
    options: {
      upscale: { type: "boolean", default: false },
      reprocess: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      only: { type: "string" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.help) {
    printHelp();
    process.exit(0);
  }
  return {
    upscale: values.upscale ?? false,
    reprocess: values.reprocess ?? false,
    dryRun: values["dry-run"] ?? false,
    only: values.only,
  };
}

function printHelp(): void {
  console.log(`process-images.ts

USAGE:
  npm run images:process              Default intake from raw-images/ + public/images/other/
  npm run images:process:upscale      Intake with Real-ESRGAN pre-pass for sub-1600px inputs
  npm run images:process:reprocess    Rewrite public/images/*.jpg in place (EXIF strip + resize)

FLAGS:
  --upscale            Enable Real-ESRGAN for source images < 1600px longest side
  --reprocess          Migration mode: rewrite top-level public/images/*.jpg in place
  --dry-run            Probe and log; do not write outputs or manifest
  --only <basename>    Process only the named file (output basename)
  --help               Show this help`);
}

async function loadRenameMap(): Promise<RenameMap> {
  const raw = await fs.readFile(RENAME_MAP_PATH, "utf8");
  return JSON.parse(raw) as RenameMap;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Default-mode input resolution. For each rename-map key, search
 * raw-images/ first, then public/images/other/. First match wins.
 * Files in the rename map but not present in either dir are warned and skipped.
 */
async function enumerateIntakeJobs(map: RenameMap): Promise<JobInput[]> {
  const jobs: JobInput[] = [];
  for (const [inputBasename, outputBasename] of Object.entries(map)) {
    const candidates = [
      path.join(RAW_IMAGES_DIR, inputBasename),
      path.join(PUBLIC_IMAGES_OTHER_DIR, inputBasename),
    ];
    let resolved: string | null = null;
    for (const c of candidates) {
      if (await fileExists(c)) {
        resolved = c;
        break;
      }
    }
    if (!resolved) {
      console.warn(
        `[intake] WARN: ${inputBasename} not found in raw-images/ or public/images/other/, skipping`,
      );
      continue;
    }
    jobs.push({
      sourcePath: resolved,
      sourceRelative: path.relative(REPO_ROOT, resolved).replace(/\\/g, "/"),
      outputBasename,
      sourceMode: "intake",
    });
  }
  return jobs;
}

const REPROCESS_EXCLUSIONS = new Set(["logo.png", "logo.svg"]);

/**
 * Reprocess-mode input enumeration.
 * Top-level public/images/*.jpg only. Subfolders skipped, logos skipped.
 * Input and output basenames are identical — files are rewritten in place.
 */
async function enumerateReprocessJobs(): Promise<JobInput[]> {
  const entries = await fs.readdir(PUBLIC_IMAGES_DIR, { withFileTypes: true });
  const jobs: JobInput[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (REPROCESS_EXCLUSIONS.has(e.name)) continue;
    if (!/\.jpe?g$/i.test(e.name)) continue;
    const sourcePath = path.join(PUBLIC_IMAGES_DIR, e.name);
    jobs.push({
      sourcePath,
      sourceRelative: `public/images/${e.name}`,
      outputBasename: e.name,
      sourceMode: "reprocess",
    });
  }
  return jobs;
}

type ProcessOutcome = {
  originalDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number };
  resized: boolean;
  upscaled: boolean;
  exifStripped: true;
};

type ManifestEntry = {
  source: string;
  source_mode: "intake" | "reprocess";
  original_dimensions: { width: number; height: number };
  output_dimensions: { width: number; height: number };
  resized: boolean;
  upscaled: boolean;
  exif_stripped: boolean;
  processed_at: string;
};

type Manifest = {
  version: 1;
  generated_at: string;
  images: Record<string, ManifestEntry>;
};

const TARGET_LONGEST_SIDE = 2400;
const JPEG_OPTIONS = { quality: 85, mozjpeg: true, progressive: true } as const;

/**
 * Process a single image through the sharp pipeline. The caller probes the
 * TRUE original dimensions and passes them in so the manifest records the
 * untouched source size even when inputPath points at an upscaled tempfile
 * produced by maybeUpscale().
 *
 * Sharp pipeline rationale:
 *  - Input is read into a Buffer first because reprocess mode writes back to
 *    the same path, and sharp refuses to read+write the same file path
 *    (libvips lazy-loads pixels and would truncate the input mid-read). When
 *    inputPath is an ESRGAN tempfile the buffer-read is harmless.
 *  - .rotate() FIRST bakes EXIF Orientation into pixels. Required because we
 *    strip EXIF; without this, sideways-shot iPhone photos render rotated.
 *  - .resize(N, N, fit:'inside') caps the LONGEST side at N. Enlargement is
 *    permitted ONLY when the input is an ESRGAN intermediate (upscaledFromBin),
 *    since that case is always a downsize from the 4x intermediate to 2400.
 *    For all other paths (sharp-only intake, reprocess), withoutEnlargement is
 *    true so we never lanczos-upscale a small original — that's exactly the
 *    soft output ESRGAN exists to avoid on this luxury-portfolio site.
 *  - .jpeg({quality:85, mozjpeg:true, progressive:true}) is the encode setting.
 *  - No .keepMetadata() call — sharp's default re-encode strips EXIF/GPS/ICC.
 */
async function processOne(
  inputPath: string,
  outputPath: string,
  originalDimensions: { width: number; height: number },
  upscaledFromBin: boolean,
): Promise<ProcessOutcome> {
  const inputBuffer = await fs.readFile(inputPath);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const info = await sharp(inputBuffer)
    .rotate()
    .resize(TARGET_LONGEST_SIDE, TARGET_LONGEST_SIDE, {
      fit: "inside",
      withoutEnlargement: !upscaledFromBin,
    })
    .jpeg(JPEG_OPTIONS)
    .toFile(outputPath);

  const outputDimensions = { width: info.width, height: info.height };
  const resized =
    outputDimensions.width !== originalDimensions.width ||
    outputDimensions.height !== originalDimensions.height;

  return {
    originalDimensions,
    outputDimensions,
    resized,
    upscaled: upscaledFromBin,
    exifStripped: true,
  };
}

const UPSCALE_THRESHOLD = 1600;
let installHintShown = false;

/**
 * Real-ESRGAN pre-pass. Returns the path that should be passed to sharp.
 * Either the original input (no upscale needed/possible), or a tempfile that
 * the caller MUST delete after sharp processes it.
 *
 * Graceful behavior:
 *  - --upscale not set, or longest side >= 1600px: returns original, upscaled=false.
 *  - realesrgan-ncnn-vulkan binary missing from PATH: warn once, return original.
 *  - Binary present but errors on a file: warn for that file, return original.
 */
async function maybeUpscale(
  inputPath: string,
  dims: { width: number; height: number },
  upscaleEnabled: boolean,
): Promise<{ path: string; upscaled: boolean; tempfile: string | null }> {
  if (!upscaleEnabled) return { path: inputPath, upscaled: false, tempfile: null };
  const longest = Math.max(dims.width, dims.height);
  if (longest >= UPSCALE_THRESHOLD) {
    return { path: inputPath, upscaled: false, tempfile: null };
  }

  const bin = await which("realesrgan-ncnn-vulkan", { nothrow: true });
  if (!bin) {
    if (!installHintShown) {
      console.warn("[upscale] realesrgan-ncnn-vulkan not found on PATH.");
      console.warn("[upscale] Install: https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases");
      console.warn("[upscale] Extract the zip, add the directory to PATH. Skipping upscaling for this run.");
      installHintShown = true;
    }
    return { path: inputPath, upscaled: false, tempfile: null };
  }

  const tempfile = path.join(os.tmpdir(), `upscale-${randomUUID()}.png`);
  try {
    // The binary's -m flag defaults to "models" relative to the CURRENT WORKING
    // DIRECTORY (not the binary's directory). Invoked from a Node script whose
    // CWD is the repo root, the binary would look for <repo-root>/models/ and
    // fail. Derive an absolute models path from the resolved binary location so
    // this works regardless of CWD.
    const modelsDir = path.join(path.dirname(bin), "models");
    await execFileAsync(bin, [
      "-i", inputPath,
      "-o", tempfile,
      "-n", "realesrgan-x4plus",
      "-s", "4",
      "-m", modelsDir,
    ]);
    return { path: tempfile, upscaled: true, tempfile };
  } catch (err) {
    // ESRGAN may have written a partial PNG before erroring; clean it up here
    // since we return tempfile:null and the caller's finally won't see it.
    await fs.unlink(tempfile).catch(() => {});
    console.warn(
      `[upscale] realesrgan failed for ${path.basename(inputPath)}: ${(err as Error).message}`,
    );
    console.warn("[upscale] falling back to sharp-only resize for this file");
    return { path: inputPath, upscaled: false, tempfile: null };
  }
}

async function loadOrInitManifest(): Promise<Manifest> {
  if (await fileExists(MANIFEST_PATH)) {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed.version !== 1) {
      throw new Error(`unknown manifest version: ${parsed.version}`);
    }
    return parsed;
  }
  return { version: 1, generated_at: new Date().toISOString(), images: {} };
}

function makeEntry(
  job: JobInput,
  outcome: ProcessOutcome,
  now: string,
): ManifestEntry {
  return {
    source: job.sourceRelative,
    source_mode: job.sourceMode,
    original_dimensions: outcome.originalDimensions,
    output_dimensions: outcome.outputDimensions,
    resized: outcome.resized,
    upscaled: outcome.upscaled,
    exif_stripped: outcome.exifStripped,
    processed_at: now,
  };
}

async function writeManifest(m: Manifest): Promise<void> {
  m.generated_at = new Date().toISOString();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n", "utf8");
}

async function runJobs(jobs: JobInput[], flags: Flags): Promise<void> {
  const seenByOutput = new Map<string, string>();
  for (const j of jobs) {
    const first = seenByOutput.get(j.outputBasename);
    if (first !== undefined) {
      console.error(
        `[collision] ${first} and ${j.sourceRelative} both produce ${j.outputBasename}; aborting`,
      );
      process.exit(3);
    }
    seenByOutput.set(j.outputBasename, j.sourceRelative);
  }

  console.log(`[run] ${jobs.length} job(s)`);

  if (flags.dryRun) {
    for (const j of jobs) {
      console.log(`  ${j.sourceRelative}  ->  public/images/${j.outputBasename}`);
    }
    return;
  }

  const manifest = await loadOrInitManifest();
  let ok = 0;
  let failed = 0;
  for (const j of jobs) {
    const outputPath = path.join(PUBLIC_IMAGES_DIR, j.outputBasename);
    let upscaleResult: Awaited<ReturnType<typeof maybeUpscale>> | null = null;
    try {
      // Probe TRUE original dims before any upscale step so the manifest
      // records the untouched source size, not the ESRGAN intermediate.
      const probe = await sharp(j.sourcePath).metadata();
      if (!probe.width || !probe.height) {
        throw new Error(`could not read dimensions of ${j.sourcePath}`);
      }
      const originalDimensions = { width: probe.width, height: probe.height };
      upscaleResult = await maybeUpscale(j.sourcePath, originalDimensions, flags.upscale);
      const outcome = await processOne(
        upscaleResult.path,
        outputPath,
        originalDimensions,
        upscaleResult.upscaled,
      );
      manifest.images[j.outputBasename] = makeEntry(j, outcome, new Date().toISOString());
      console.log(
        `  [ok] ${j.outputBasename}  ${outcome.originalDimensions.width}x${outcome.originalDimensions.height}` +
          ` -> ${outcome.outputDimensions.width}x${outcome.outputDimensions.height}` +
          (outcome.resized ? " (resized)" : "") +
          (outcome.upscaled ? " (upscaled)" : ""),
      );
      ok++;
    } catch (err) {
      console.error(`  [err] ${j.outputBasename}: ${(err as Error).message}`);
      failed++;
    } finally {
      // Use .catch(noop) so a stale-tempfile cleanup error doesn't mask a real
      // pipeline error from the try block.
      if (upscaleResult?.tempfile) {
        await fs.unlink(upscaleResult.tempfile).catch(() => {});
      }
    }
  }
  await writeManifest(manifest);
  console.log(`[run] done: ${ok} ok, ${failed} failed; manifest at public/images/manifest.json`);
}

async function main(): Promise<void> {
  const flags = parseFlags();
  let jobs: JobInput[];
  if (flags.reprocess) {
    jobs = await enumerateReprocessJobs();
  } else {
    const map = await loadRenameMap();
    jobs = await enumerateIntakeJobs(map);
  }
  if (flags.only) {
    jobs = jobs.filter((j) => j.outputBasename === flags.only);
    if (jobs.length === 0) {
      console.error(`[only] no job produces output ${flags.only}`);
      process.exit(2);
    }
  }
  await runJobs(jobs, flags);
}

main().catch((err) => {
  console.error("[process-images] fatal:", err);
  process.exit(1);
});
