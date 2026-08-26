# ZHcode

**ZHcode** is a hybrid multi-agent coding system that runs in your terminal —
starting as a Freebuff-style CLI coding agent and growing into an orchestrated
team of specialized agents (Explorer → Planner → Coder → Tester → Reviewer)
with parallel execution, git worktree isolation, and a cost-aware model router.

## Requirements

- [Bun](https://bun.sh) >= 1.1
- Git

## Getting started

```bash
git clone <your-repo-url> zhcode
cd zhcode
bun install
cp .env.example .env   # add your API keys (never commit .env)

bun run dev            # run the CLI stub
bun test               # run tests
bun run typecheck      # typecheck the monorepo
bun run lint           # eslint
```

Enable git hooks (typecheck + tests before every commit):

```bash
bun run hooks
```

## Project structure

```
zhcode/
├── apps/
│   └── cli/              # Terminal entry point (Phase 1+)
├── packages/
│   ├── core/             # Shared types & utilities (env handling, …)
│   ├── agent-runtime/    # Agent loop, lifecycle (Phase 4+)
│   ├── model-gateway/    # Provider-agnostic model access (Phase 2)
│   ├── tools/            # Tool registry + built-in tools (Phase 3)
│   ├── context/          # Codebase exploration, project memory (5, 13)
│   └── git/              # Git integration & worktrees (3, 10)
├── agents/               # Domain-specific agents (Phase 15+)
├── tests/                # Cross-package / integration tests
├── docs/                 # Design docs
└── scripts/              # Dev scripts
```

## Roadmap

| Phase | Milestone | Focus |
| ----- | ----------------------------- | ---------------------------------------------------------- || 0 | `v0.1.0-foundation` | Repo, Bun monorepo, tooling |
| 1 | `v0.2.0-cli` | Interactive CLI with commands ← **you are here** |
| 2 | `v0.3.0-model-gateway` | Model gateway + OpenRouter/mock providers |
| 3 | `v0.4.0-tools` | Tool system + permission layer |
| 4 | `v0.5.0-first-agent` | First real coder agent |
| 5–7 | `v0.6–v0.8` | Explorer, Planner, Reviewer/Test loop |
| 8–9 | `v0.9–v0.10` | Orchestrator + task graph scheduler |
| 10 | `v0.11.0-isolated-workspaces` | Git worktree isolation |
| 11–12 | `v0.12–v0.13` | Model router + cost management |
| 13–16 | `v0.14–v0.17` | Persistent memory, advanced tools, specialized agents, MCP |
| 17 | `v1.0.0` | Polish, install script, public release |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
