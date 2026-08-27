# Changelog

All notable changes to ZHcode are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each milestone in the [README roadmap](README.md) gets a matching tag and entry here.

## [Unreleased]

- Interactive `/init` project setup command.
- `ModelProvider` + `ChatMessage` types promoted to `@zhcode/core`.
- DeepSeek provider adapter (real, low-cost model backend).
- Streaming responses wired through the agent loop and CLI.
- Default blocking of sensitive paths (`.env`, `.git`) in the tool permission layer.

## [v0.2.0-cli] — Interactive CLI

### Added

- Interactive REPL with streaming model output and live agent-event rendering.
- Slash commands: `/help`, `/clear`, `/version`, `/exit`, `/init`.
- ASCII art banner (`╭─ ZHcode ─╮`) and colored prompt on startup.
- Graceful `Ctrl+C` (SIGINT) handling: cancel the running agent first, exit on a second press.
- Conversation `Session` that records history for the agent runtime.
- Agent loop connected to the CLI: typing a message runs the real tool-calling loop.

### Changed

- Provider-agnostic `ModelProvider` interface now lives in `@zhcode/core`.
- Tool context blocks reads of `.env` and `.git` by default.

## [v0.1.0-foundation] — Foundation

### Added

- Bun + TypeScript monorepo (`apps/*`, `packages/*`, `agents/*`).
- `@zhcode/core` — env loading and shared types.
- `@zhcode/model-gateway` — provider-agnostic gateway with a deterministic `MockProvider`
  (zero-cost development) and an OpenRouter adapter for real LLMs.
- `@zhcode/tools` — `Tool` interface, `ToolRegistry`, permission layer, and built-in
  safe tools: `read_file`, `list_files`, `search_files`, `write_file`, `edit_file`,
  `run_command`, `git_status`.
- `@zhcode/agent-runtime` — model → tool → result loop with cancellation and limits.
- `@zhcode/context` — project scanning, file indexing, ranking, and budget management.
- `@zhcode/git` — git status and worktree primitives.
- Tooling: ESLint, Prettier, pre-commit hooks (`bun run hooks`), and 180+ unit tests.
- `CONTRIBUTING.md` with the "always-runnable repo" rule.
