/**
 * ContextBudget — controls how much context is sent to the model.
 *
 * Prevents dumping the entire repository into the model context,
 * which would waste tokens and money.
 */

import type { ContextBudget, FileMetadata } from "./types";

/** Default budget configuration. */
const DEFAULT_BUDGET: ContextBudget = {
  maxFiles: 10,
  maxTokens: 12000,
  reservedOutputTokens: 2000,
  maxFileSize: 100 * 1024, // 100KB per file
};

/** Rough estimate: 1 token ≈ 4 characters. */
const CHARS_PER_TOKEN = 4;

export class BudgetManager {
  private budget: ContextBudget;

  constructor(budget?: Partial<ContextBudget>) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  /** Get the current budget. */
  get current(): ContextBudget {
    return { ...this.budget };
  }

  /** Estimate token count for a string. */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Select files that fit within the budget.
   * Assumes files are pre-ranked (highest relevance first).
   */
  selectFiles(
    rankedFiles: FileMetadata[],
    contents: Map<string, string>,
  ): { selected: FileMetadata[]; totalTokens: number; budgetExceeded: boolean } {
    const selected: FileMetadata[] = [];
    let totalTokens = 0;
    const maxTokensForFiles = this.budget.maxTokens - this.budget.reservedOutputTokens;
    let budgetExceeded = false;

    for (const file of rankedFiles) {
      if (selected.length >= this.budget.maxFiles) {
        budgetExceeded = true;
        break;
      }

      const content = contents.get(file.path);
      if (!content) continue;

      // Skip oversized files.
      if (file.size > this.budget.maxFileSize) continue;

      const fileTokens = this.estimateTokens(content);
      if (totalTokens + fileTokens > maxTokensForFiles) {
        budgetExceeded = true;
        continue; // Skip this file, try next (smaller) ones
      }

      selected.push(file);
      totalTokens += fileTokens;
    }

    return { selected, totalTokens, budgetExceeded };
  }

  /**
   * Truncate content to fit within token budget.
   */
  truncateContent(content: string, maxTokens: number): string {
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    if (content.length <= maxChars) return content;
    return content.slice(0, maxChars) + "\n// ... (truncated)";
  }
}
