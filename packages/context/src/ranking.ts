/**
 * RelevanceRanking — ranks files by relevance to a query.
 *
 * Uses simple heuristics (filename match, path match, extension,
 * importance) without embeddings or vector databases.
 */

import type { FileMetadata, FileSearchResult } from "./types";

/** Weight for each ranking factor. */
const WEIGHTS = {
  filenameMatch: 0.35,
  pathMatch: 0.25,
  extensionBonus: 0.15,
  importanceBonus: 0.15,
  recencyBonus: 0.1,
};

/** Extensions that are more likely to contain relevant code. */
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".php",
  ".go",
  ".rs",
  ".java",
  ".rb",
]);

export class RelevanceRanker {
  /**
   * Rank files by relevance to a query.
   * Returns files sorted by score (highest first).
   */
  rank(
    files: FileMetadata[],
    query: string,
    maxResults?: number,
  ): FileSearchResult[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);

    const results: FileSearchResult[] = files.map((file) => {
      const score = this.calculateScore(file, queryLower, queryTerms);
      const reasons = this.getReasons(file, queryLower, queryTerms);

      return {
        path: file.path,
        score,
        reasons,
      };
    });

    // Sort by score descending.
    results.sort((a, b) => b.score - a.score);

    // Filter out zero-score results.
    const filtered = results.filter((r) => r.score > 0);

    return maxResults ? filtered.slice(0, maxResults) : filtered;
  }

  // -------------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------------

  private calculateScore(
    file: FileMetadata,
    queryLower: string,
    queryTerms: string[],
  ): number {
    let score = 0;

    // Filename match
    const filename = file.path.split("/").pop()?.toLowerCase() ?? "";
    if (filename.includes(queryLower)) {
      score += WEIGHTS.filenameMatch;
    } else {
      // Partial term matches
      for (const term of queryTerms) {
        if (filename.includes(term)) {
          score += WEIGHTS.filenameMatch * 0.5;
          break;
        }
      }
    }

    // Path match
    if (file.path.toLowerCase().includes(queryLower)) {
      score += WEIGHTS.pathMatch;
    } else {
      for (const term of queryTerms) {
        if (file.path.toLowerCase().includes(term)) {
          score += WEIGHTS.pathMatch * 0.5;
          break;
        }
      }
    }

    // Extension bonus (code files are more relevant)
    if (CODE_EXTENSIONS.has(file.extension)) {
      score += WEIGHTS.extensionBonus;
    }

    // Importance bonus
    if (file.isImportant) {
      score += WEIGHTS.importanceBonus;
    }

    // Recency bonus (files modified in last 24h get a boost)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (file.lastModified > dayAgo) {
      score += WEIGHTS.recencyBonus;
    }

    return Math.min(1, score);
  }

  private getReasons(
    file: FileMetadata,
    queryLower: string,
    queryTerms: string[],
  ): string[] {
    const reasons: string[] = [];
    const filename = file.path.split("/").pop()?.toLowerCase() ?? "";

    if (filename.includes(queryLower)) {
      reasons.push("filename matches query");
    } else if (queryTerms.some((t) => filename.includes(t))) {
      reasons.push("filename contains query term");
    }

    if (file.path.toLowerCase().includes(queryLower)) {
      reasons.push("path matches query");
    }

    if (file.isImportant) {
      reasons.push("important file (entry point/config)");
    }

    if (CODE_EXTENSIONS.has(file.extension)) {
      reasons.push("code file");
    }

    return reasons;
  }
}
