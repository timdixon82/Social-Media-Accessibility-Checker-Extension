# ADR-002: Webpack as the build tool, retained

## Status

State: Active

## Decision

Webpack 5 in production mode is the build tool, with one entry per extension surface (`background/service_worker`, `popup/popup`, `app/app`, `offscreen/offscreen`, `sandbox/sandbox`, `content/content_script`). No migration to Vite or esbuild.

## Rationale

The project bundles a non-trivial WASM and ONNX model set through webpack's `CopyPlugin`, and `experiments.asyncWebAssembly` is configured. The brief excludes a bundler migration. Webpack is the right tool for the job at this code size.

## Source

Jacob's architecture review, 2026-05-23 (`.claude/work/012-smace-setup/jacob-architecture-review.md`).
