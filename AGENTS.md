# NOPE agent guide

You are an AI assistant working in the NOPE repository. This file is your entry point and it is short on purpose. The real content lives in two files, read them.

- `CONTRIBUTING.md`: the developer workflow, the setup, the lint traps, the code conventions, the prose and docstring conventions.
- `ARCHITECTURE.md`: the internals, the map into the code, the cross-file invariants, the design decisions and their rationale.

`skill/SKILL.md` holds the authoring conventions a user writes against. `example-vault/` has one document per feature and is also the test corpus.

## Do not reopen these

Decisions that are already made. Do not rediscover or relitigate them.

- Desktop-only. `isDesktopOnly: true`, the plugin uses Node and Electron. There is no mobile target. Do not add mobile guards, do not test for mobile, do not suggest avoiding Node or Electron for mobile compatibility.
- Docker is required at runtime and the export pulls a prebuilt image. That network access is the documented core mechanism, not telemetry.
- Never reinstall `@types/node`. Node types are ambient in `src/node-modules.d.ts`. The rationale is in `ARCHITECTURE.md`.
- `npm run lint` must be clean before you finish.

Everything else you need is in `CONTRIBUTING.md` and `ARCHITECTURE.md`.
