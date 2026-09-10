# Astra Industries

A hackathon project extending [Forma OSS](https://github.com/caid-technologies/Forma-OSS) by CAID Technologies into room-scale spatial design.

## Vision

Design set pieces, workstations, and equipment layouts for fabrication shops, manufacturing spaces, and laboratories. Build hardware projects with Forma, import existing Forma projects or plain STEP files, place them in a 3D room, and animate how the space works.

## Planned workflow

1. Build a project using Forma OSS, or bring an existing Forma project or STEP model.
2. Import the design as a reusable scene asset with consistent physical units.
3. Configure a room and arrange multiple assets at real-world scale.
4. Preview object motion and assembly or workflow sequences with a simple animation timeline.
5. Save and reopen the room layout for further iteration.

## Initial scope

- Forma OSS integration for project creation and handoff.
- Forma project import, including available mechanical geometry and metadata.
- Standalone .step and .stp import and display.
- Interactive 3D room viewer and layout tools.
- Basic keyframe animation and playback.
- Scene persistence and representative fabrication, manufacturing, and lab demos.

## Upstream integration

Forma provides hardware generation, versioned project objects, and mechanical layouts. Its reusable Python distribution is caid-forma-core (import package: forma_core). Integration details and supported project versions will be established in the implementation issues.

Upstream Forma OSS is licensed under MPL-2.0; preserve applicable notices and license obligations when reusing upstream code.

## Status

Initial local workbench implemented: Forma JSON imports, STEP conversion in a Web Worker, room dimensions, orbit/pan/zoom, asset framing, part inspection, and pip-installed Forma generation/handoff. Animation and scene persistence are upcoming.

## Run locally

Requires Node 22 and Python 3.11+.

```powershell
npm install
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-forma.txt
npm run build
npm start
```

Open http://127.0.0.1:8787. For development use `npm run dev` and http://127.0.0.1:5173.

On macOS/Linux use `.venv/bin/python` for pip installation. Forma is installed through `caid-forma-core==0.3.5`; no Forma source checkout is required. The distribution provides the `forma-oss` and `forma-core` commands. Astra invokes `python -m forma_core` from this environment.

Use **Build with Forma → Deterministic demo** to verify the full creation/import flow without provider credentials. For live generation, configure the appropriate provider environment variables in `.env` (see `.env.example`) and enter its provider/model in the UI. Live provider calls have not yet been verified in this project.

## Import contracts

- Forma: Hardware IR 0.1/0.2, `project_ir` / `hardware_ir` wrappers, `forma-project` manifest v1, and `forma.project` namespace objects. Object versions are revision counters. Mechanical placements and inline CAD mesh vertices use millimeters with Z up.
- Select referenced STEP artifacts together with their Forma JSON. Missing CAD falls back to labeled mechanical envelopes when available; otherwise the import reports an error. Remote CAD URLs and server-local paths are not fetched automatically.
- STEP: `.step` and `.stp` Part 21 files are converted with `occt-import-js@0.0.23`. OpenCascade reads source units; the UI provides source-up-axis and scale correction. Geometry conversion runs in an isolated worker with a 120-second timeout. Successful conversions are cached for repeated imports.
- Scene asset schema v1: stable content-derived asset/part IDs, source filename/digest/project identity, named hierarchy, indexed triangle meshes, dimensions, and warnings. All geometry is normalized to meters, Y up, centered in X/Z and floor-aligned; `originOffset` retains the original normalization offset. Metadata is allowlisted for display.
- Limits: 25 MiB per file, 75 MiB per batch, 2 million vertices per asset. These are protective caps, not a benchmarked performance guarantee. STEP variants and large assemblies need broader fixture validation.

## Verification

With `npm start` running, run `npm test`. The Chrome smoke test checks Forma import, actual STEP conversion using an upstream cube fixture, room controls, invalid JSON recovery, and pip-installed Forma deterministic generation. Screenshots are written to `test-results/`. Chrome and network access for the STEP fixture are required.

## Third-party software

Forma Core is consumed as a pip dependency under MPL-2.0. STEP conversion uses occt-import-js and its OpenCascade/WebAssembly distribution; retain their bundled license notices when redistributing. Upstream test geometry used by the smoke test is fetched from the occt-import-js test suite rather than included in this repository.

## GIF studio and asset library

Open **GIF studio** in the viewer (also available in fullscreen). Everything in this workflow runs in the browser; no Forma process, provider credentials, upload service, or server-side rendering is required.

### Export for visual review

1. Import your Forma/STEP assets and open **Floor export**.
2. Choose **Entire room**, **Floor section**, or **Selected asset**. A section is defined by its X/Z center and width/depth in meters, relative to the room center. Its box is highlighted in the viewport. It must fit within the room and intersect an asset; geometry outside its six boundaries is clipped in the export.
3. Choose 320, 480, or 640 pixels square, a 2–4 second duration, and 10 or 15 fps. Click **Render GIF**; progress and cancellation are available.
4. Inspect the animated preview, then download the GIF and its review metadata JSON. Metadata records source asset IDs, names, provenance, instance positions, units, room/section dimensions, motion mode, frame timing, and geometry approximation warnings. Supply both files to a visual-review agent to preserve spatial context. Astra does not automatically call an LLM or apply corrections.

**Turntable** makes one complete camera orbit around fixed geometry. Selected assets can also use **Sample lift-and-return**, a clearly labeled synthetic motion with a stationary camera. It is a preview preset, not an authored animation timeline or physics simulation. Captures use a separate renderer and never modify the active room or camera.

GIF timing is rounded to the format's 10 ms tick: 15 fps becomes 70 ms/frame. Metadata and preview report the actual duration. At most 60 frames are encoded; frames are processed sequentially with UI yields, and temporary render resources are disposed on completion, failure, or cancellation. GIFs use a 256-color palette per frame, so some color quantization is expected.

### Build a reusable asset library

1. Select a room asset, open **Asset library**, and click **Save selected asset to library**.
2. Render a **turntable** or **sample motion** preview from its card. The latest GIF and review metadata are saved with its geometry in IndexedDB. Saving the same asset ID updates its existing entry.
3. Refresh or reopen Astra on the same browser origin: library entries and previews remain. **Add to room** restores an instance without reimporting the source file. **Remove from library** deletes the stored asset and preview while leaving existing room instances intact.

Library storage is per browser/device/origin, subject to browser quota and eviction, and not cloud synced. Clearing site data removes it. Download previews you want to keep. The room itself still resets on reload; scene persistence remains a separate feature.

### GIF checks

With the app running on port 8787, run `npm run test:gif`. It imports deterministic fixtures, renders and decodes real GIF downloads to check dimensions, moving frames, timing and looping, verifies section filtering/metadata, tests library persistence and both motion presets, and covers cancellation, fullscreen, and mobile layout. No Forma installation or external fixture download is needed for this suite. Run `npm run test:fullscreen` for the existing fullscreen regressions. Screenshots are saved under `test-results/10-*.png`.

GIF encoding uses `gifenc` (MIT); the test-only GIF decoder is `omggif` (MIT).
