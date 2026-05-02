#!/usr/bin/env tsx
/**
 * Image processing pipeline. See:
 *   docs/superpowers/specs/2026-05-01-image-processing-pipeline-design.md
 *
 * Modes:
 *   default            - intake from raw-images/ + public/images/other/ via rename-map.json
 *   --reprocess        - rewrite public/images/*.jpg in place (top-level only, skips logos)
 *
 * Flags:
 *   --upscale          - run Real-ESRGAN on inputs with longest-side < 1600px
 *   --dry-run          - probe and log; do not write outputs or manifest
 *   --only <basename>  - process only the named file (output basename)
 */

import { parseArgs } from "node:util";
import * as path from "node:path";

type Flags = {
  upscale: boolean;
  reprocess: boolean;
  dryRun: boolean;
  only: string | undefined;
};

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

async function main(): Promise<void> {
  const flags = parseFlags();
  console.log("[process-images] flags:", flags);
  console.log("[process-images] (skeleton — no work performed yet)");
}

main().catch((err) => {
  console.error("[process-images] fatal:", err);
  process.exit(1);
});
