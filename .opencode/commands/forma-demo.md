---
description: Create a compiled Forma project that can be imported into Astra
agent: build
---

Use the local `forma` and `astra` MCP servers for this demo. Create a low-voltage hardware project with useful mechanical dimensions and component placements for a room-scale Astra scene.

1. Author a complete Hardware IR project for the user's request, defaulting to a small 5V laboratory temperature monitor if no request is provided.
2. Call `forma.opencode.compile_project` to normalize and validate the project. Do not use server-side LLM generation or simulation as a substitute for the MCP compiler.
3. Save the compiled manifest as `demo/forma-project.json` in the Astra checkout using `astra.save_forma_project`. Keep the manifest self-contained where possible and do not include credentials, tokens, prompts containing secrets, or server logs.
4. Report the validation summary and tell the user to import `demo/forma-project.json` into the running Astra workbench.

If the Forma MCP server is unavailable, stop with the exact local setup requirement rather than silently producing an uncompiled artifact.
