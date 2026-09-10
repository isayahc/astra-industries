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

Planning and issue tracking. Features above are planned, not yet implemented. See the [issue tracker](https://github.com/isayahc/astra-industries/issues) for scope, acceptance criteria, and dependencies.
