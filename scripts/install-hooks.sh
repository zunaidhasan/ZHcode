#!/usr/bin/env bash
# Point git at .githooks so pre-commit checks run on every commit.
set -euo pipefail

git config core.hooksPath .githooks
echo "Git hooks enabled: $(git config core.hooksPath)"
