---
description: Apply the latest Astra animation review to the Forma project
agent: build
---

Call `astra.read_animation_feedback` from the local Astra MCP server. If it is missing, ask the user to render an authored timeline animation and use Astra's **Send feedback to Forma** action first.

1. Inspect the feedback instruction, room context, sampled animation frames, and referenced Forma project identity.
2. Call `astra.read_forma_project` for the corresponding `demo/forma-project.json` or other local compiled Forma manifest. Preserve the existing electrical design unless the feedback explicitly requires a change.
3. Apply the requested mechanical or workflow change to the project IR and call `forma.opencode.update_project` to validate and persist the revised Forma project.
4. Call `astra.save_forma_project` with the returned `project_ir` so the revised artifact is ready for Astra.
5. Report validation findings and tell the user to reimport the revised Forma JSON into Astra and rerun the animation review.

Never claim that animation feedback was applied if the Forma MCP tool is unavailable or validation fails.
