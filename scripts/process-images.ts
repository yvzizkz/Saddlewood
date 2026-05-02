#!/usr/bin/env tsx
/**
 * Image processing pipeline. See:
 *   docs/superpowers/specs/2026-05-01-image-processing-pipeline-design.md
 */

import { parseArgs } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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

type ProcessOutcome = {
  originalDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number };
  resized: boolean;
  upscaled: boolean;
  exifStripped: true;
};

const TARGET_LONGEST_SIDE = 2400;
const JPEG_OPTIONS = { quality: 85, mozjpeg: true, progressive: true } as const;

/**
 * Process a single image: optional upscale (handled by caller), then sharp pipeline.
 * Returns dimensions and provenance for the manifest.
 *
 * Sharp pipeline rationale:
 *  - .rotate() FIRST bakes EXIF Orientation into pixels. Required because we
 *    strip EXIF; without this, sideways-shot iPhone photos render rotated.
 *  - .resize(N, N, fit:'inside', withoutEnlargement:false) caps the LONGEST
 *    side at N while preserving aspect ratio. Upscales small inputs.
 *  - .jpeg({quality:85, mozjpeg:true, progressive:true}) is the encode setting.
 *  - No .keepMetadata() call — sharp's default re-encode strips EXIF/GPS/ICC.
 */
async function processOne(
  inputPath: string,
  outputPath: string,
  upscaledFromBin: boolean,
): Promise<ProcessOutcome> {
  const inputMeta = await sharp(inputPath).metadata();
  if (!inputMeta.width || !inputMeta.height) {
    throw new Error(`could not read dimensions of ${inputPath}`);
  }
  const originalDimensions = { width: inputMeta.width, height: inputMeta.height };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const info = await sharp(inputPath)
    .rotate()
    .resize(TARGET_LONGEST_SIDE, TARGET_LONGEST_SIDE, {
      fit: "inside",
      withoutEnlargement: false,
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

async function main(): Promise<void> {
  const flags = parseFlags();
  if (flags.reprocess) {
    console.log("[process-images] --reprocess mode (not yet implemented)");
    return;
  }
  const map = await loadRenameMap();
  let jobs = await enumerateIntakeJobs(map);
  if (flags.only) {
    jobs = jobs.filter((j) => j.outputBasename === flags.only);
    if (jobs.length === 0) {
      console.error(`[only] no rename-map entry produces output ${flags.only}`);
      process.exit(2);
    }
  }
  console.log(`[intake] resolved ${jobs.length} job(s)`);
  if (flags.dryRun) {
    for (const j of jobs) {
      console.log(`  ${j.sourceRelative}  ->  public/images/${j.outputBasename}`);
    }
    return;
  }
  console.log("[process-images] (processing not yet implemented)");
}

main().catch((err) => {
  console.error("[process-images] fatal:", err);
  process.exit(1);
});
