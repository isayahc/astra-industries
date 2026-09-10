# Forma Handoff Contract

Astra accepts compiled Forma project artifacts produced by the Forma SDK, OpenCode, or Codex. Authoring and compilation remain outside Astra; Astra imports the accepted artifact for spatial review and layout.

## Supported Artifact

The preferred file is a `forma-project.json` manifest containing a compiled `project_ir`:

```json
{
  "format": "forma-project",
  "version": 1,
  "project_id": "project-id",
  "project_ir": {
    "hardware_ir_version": "0.2",
    "overview": { "title": "Example project" },
    "mechanical": {},
    "components": [],
    "part_definitions": []
  },
  "agent": "opencode",
  "artifacts": [{ "path": "models/enclosure.step", "sha256": "..." }]
}
```

The importer also accepts these existing Forma representations:

- A top-level `hardware_ir` object.
- A top-level `project_ir` object.
- A `forma.project` namespace object containing `project.meta`, `product.overview`, `product.electrical`, and `product.mech` payloads.

Compiled IR is preferred over a draft IR. The compiled project is the source of truth for validation, component identity, mechanical placements, and CAD references.

## Provenance

When present, the manifest should include:

- `project_id`: stable Forma project identity.
- `revision`: source revision or namespace object revision.
- `agent`: one of `sdk`, `opencode`, or `codex`.
- `hardware_ir_version`: supported Hardware IR version (`0.1` or `0.2`).
- `validation`: compiler validation summary and findings.
- `artifacts`: local artifact paths and optional SHA-256 digests.

Provider credentials, MCP tokens, API keys, prompts containing secrets, and server logs must not be written to the artifact.

## CAD Resolution

Astra resolves CAD only from files explicitly selected with the project JSON. A CAD reference may be a path, filename, or nested CAD source object. The importer matches normalized paths or filenames and verifies an `artifacts[].sha256` value when supplied.

Remote URLs and server-local paths are metadata only and are not fetched automatically. Missing CAD may fall back to `mechanical.component_placements` or `mechanical.render_dimensions` envelopes when those fields are available.

Forma mechanical placement coordinates are millimeters with Z-up. Astra normalizes imported geometry to meters with Y-up and keeps the normalization offset in the scene asset metadata.

## Agent Workflows

The SDK, OpenCode, and Codex workflows converge on the same compiled artifact:

```text
SDK or agent authors Hardware IR
  -> forma.compile_project
  -> forma-project.json with compiled project_ir
  -> Astra imports JSON and selected CAD artifacts
  -> Astra reviews and arranges the project spatially
```

OpenCode and Codex should use the `forma-hardware` skill and set the authoring agent explicitly when compiling:

```bash
python .agents/skills/forma-hardware/scripts/forma.py compile \
  "$PROJECT_DIR/forma-project.json" \
  --authoring-agent opencode \
  --output "$PROJECT_DIR/compiled-project.json" \
  --update-project
```

Use `--authoring-agent codex` for Codex-authored projects. The resulting manifest, not the pre-compiled draft, is the file to import into Astra.

## Ownership Boundary

Forma owns the authored Hardware IR, electrical validation, component identity, and compiled project revision. Astra owns room placement, camera context, visibility, and spatial review state. Astra spatial edits are not electrically revalidated by Forma unless a later explicit handoff workflow is used.

## Compatibility

Unsupported versions and malformed variants must fail with an actionable message. Astra must retain local file import when Forma MCP is unavailable. Direct MCP integration is optional and must remain server-side; credentials must never enter the browser bundle or saved scene files.
