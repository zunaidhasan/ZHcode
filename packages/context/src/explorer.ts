/**
 * CodebaseExplorer — finds relevant files for a user query.
 *
 * Given a user request, searches the project and returns the files
 * most likely to matter. Deterministic (no LLM calls) for speed
 * and predictability.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FileMetadata, FileSearchResult } from "./types";
import { FileIndex } from "./file-index";
import { RelevanceRanker } from "./ranking";
import { BudgetManager } from "./budget";

const execFileAsync = promisify(execFile);

/** Max search results from rg. */
const MAX_SEARCH_RESULTS = 100;

export interface ExplorerOptions {
  /** Project root. */
  root: string;
  /** Max files to return (default: 10). */
  maxFiles?: number;
}

export class CodebaseExplorer {
  private readonly root: string;
  private readonly maxFiles: number;
  private fileIndex: FileIndex;
  private ranker: RelevanceRanker;
  private budget: BudgetManager;

  constructor(options: ExplorerOptions) {
    this.root = options.root;
    this.maxFiles = options.maxFiles ?? 10;
    this.fileIndex = new FileIndex(options.root);
    this.ranker = new RelevanceRanker();
    this.budget = new BudgetManager({ maxFiles: this.maxFiles });
  }

  /** Initialize the explorer (build file index). */
  async init(): Promise<void> {
    await this.fileIndex.build();
  }

  /** Find relevant files for a query. */
  async findRelevant(query: string): Promise<FileSearchResult[]> {
    // Step 1: Get all files from index.
    const allFiles = this.fileIndex.getAll();

    // Step 2: Search for matches using ripgrep (if available).
    const searchMatches = await this.searchWithRipgrep(query);

    // Step 3: Combine indexed files with search results.
    // Files that appear in search results get a boost.
    const filesWithBoost = allFiles.map((f) => ({
      ...f,
      _searchMatch: searchMatches.has(f.path),
    }));

    // Step 4: Rank by relevance.
    const ranked = this.ranker.rank(
      filesWithBoost as unknown as FileMetadata[],
      query,
      this.maxFiles * 2, // Get more candidates than needed
    );

    // Boost files that were found by ripgrep.
    for (const result of ranked) {
      if (searchMatches.has(result.path)) {
        result.score = Math.min(1, result.score + 0.2);
        result.reasons.push("found by text search");
      }
    }

    // Re-sort after boosting.
    ranked.sort((a, b) => b.score - a.score);

    return ranked.slice(0, this.maxFiles);
  }

  /** Read file contents for the given paths. */
  async readFiles(filePaths: string[]): Promise<Map<string, string>> {
    const contents = new Map<string, string>();

    for (const filePath of filePaths) {
      const absPath = path.join(this.root, filePath);
      try {
        const content = await fs.readFile(absPath, "utf-8");
        contents.set(filePath, content);
      } catch {
        // Skip files that can't be read.
      }
    }

    return contents;
  }

  /** Get the file index. */
  get index(): FileIndex {
    return this.fileIndex;
  }

  /** Get the budget manager. */
  get budgetManager(): BudgetManager {
    return this.budget;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async searchWithRipgrep(query: string): Promise<Set<string>> {
    const matches = new Set<string>();

    try {
      const args = [
        "--no-heading",
        "-l", // List files only
        "--glob",
        "!node_modules",
        "--glob",
        "!.git",
        "--glob",
        "!dist",
        "--glob",
        "!build",
        "--max-count",
        String(MAX_SEARCH_RESULTS),
        "--",
        query,
        this.root,
      ];

      const { stdout } = await execFileAsync("rg", args, {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });

      for (const line of stdout.split("\n").filter(Boolean)) {
        const relative = path.relative(this.root, line).replace(/\\/g, "/");
        matches.add(relative);
      }
    } catch {
      // rg not available or no matches — that's fine.
    }

    return matches;
  }
}
