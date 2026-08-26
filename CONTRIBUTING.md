# Contributing to ZHcode

This is a solo personal project, but the rules below keep it healthy.

## Ground rule: always-runnable repo

The repository must be **runnable at the end of every day**.
A commit should never leave `bun install && bun test && bun run typecheck` broken.

## Workflow

1. Create a branch per feature/fix: `feat/model-gateway`, `fix/env-loader`.
2. Commit small and often — aim for at least one commit per day.
3. Before pushing:
   ```bash
   bun run typecheck
   bun test
   bun run lint
   ```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add mock model provider
fix: handle missing OPENROUTER_API_KEY gracefully
chore: configure TypeScript and Bun
docs: add phase 2 design notes
test: cover env fallback loading
refactor: extract provider adapter interface
```

Scope prefixes are optional: `feat(cli): streaming output`.

## Tags

Each milestone gets a tag matching the plan:

```bash
git tag v0.1.0-foundation
```

## Environment variables

Never commit real API keys. Copy `.env.example` to `.env` locally;
`.env` is git-ignored.
