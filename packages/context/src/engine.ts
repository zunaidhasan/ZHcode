/**
 * ContextEngine — the orchestrator for context building.
 *
 * Combines project scanning, file indexing, exploration, ranking,
 * and budget management into a single API. This is what the agent
 * runtime calls to get context for a user query.
 */

import type {
  ContextBudget,
  ContextRequest,
  ContextResponse,
  ContextIntent,
  ProjectContext,
  ProjectStructure,
  FileMetadata,
} from "./types";
import { ProjectScanner } from "./scanner";
import { StructureBuilder } from "./structure";
import { CodebaseExplorer } from "./explorer";
import { BudgetManager } from "./budget";
import { MemoryStore } from "./memory";

export interface ContextEngineOptions {
  /** Project root. */
  root: string;
  /** Budget overrides. */
  budget?: Partial<ContextBudget>;
}

export class ContextEngine {
  private scanner: ProjectScanner;
  private structureBuilder: StructureBuilder;
  private explorer: CodebaseExplorer;
  private budget: BudgetManager;
  private memory: MemoryStore;

  /** Cached project context. */
  private projectContext: ProjectContext | null = null;
  private projectStructure: ProjectStructure | null = null;

  constructor(options: ContextEngineOptions) {
    this.scanner = new ProjectScanner(options.root);
    this.structureBuilder = new StructureBuilder(options.root);
    this.explorer = new CodebaseExplorer({ root: options.root, maxFiles: 15 });
    this.budget = new BudgetManager(options.budget);
    this.memory = new MemoryStore(options.root);
  }

  /** Initialize the engine (scan project, build index). */
  async init(): Promise<void> {
    this.projectContext = await this.scanner.scan();
    this.projectStructure = await this.structureBuilder.build();
    await this.explorer.init();
    await this.memory.load();
  }

  /** Get project context (cached). */
  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  /** Get project structure (cached). */
  getStructure(): ProjectStructure | null {
    return this.projectStructure;
  }

  /** Get project memory. */
  getMemory(): MemoryStore {
    return this.memory;
  }

  /**
   * Build context for a user query.
   *
   * This is the main API. It:
   * 1. Detects intent from the query
   * 2. Finds relevant files
   * 3. Reads their contents
   * 4. Applies budget limits
   * 5. Returns a context response
   */
  async buildContext(request: ContextRequest): Promise<ContextResponse> {
    const intent = request.intent;

    // For general questions, return minimal context.
    if (intent === "general") {
      return {
        project: this.projectContext!,
        files: [],
        contents: {},
        structure: this.projectStructure!,
        tokensUsed: 0,
        budgetExceeded: false,
      };
    }

    // Find relevant files based on intent.
    const relevantFiles = await this.explorer.findRelevant(request.query);

    // Read file contents.
    const filePaths = relevantFiles.map((r) => r.path);
    const contents = await this.explorer.readFiles(filePaths);

    // Apply budget.
    const fileMetadata: FileMetadata[] = filePaths
      .map((p) => this.explorer.index.getByPath(p))
      .filter((f): f is FileMetadata => f !== undefined);

    const { selected, totalTokens, budgetExceeded } = this.budget.selectFiles(
      fileMetadata,
      contents,
    );

    // Build final contents map (only selected files).
    const selectedContents: Record<string, string> = {};
    for (const file of selected) {
      const content = contents.get(file.path);
      if (content) {
        selectedContents[file.path] = content;
      }
    }

    // Add memory context if available.
    const memoryText = this.memory.format();
    const memoryTokens = memoryText
      ? this.budget.estimateTokens(memoryText)
      : 0;

    return {
      project: this.projectContext!,
      files: selected,
      contents: selectedContents,
      structure: this.projectStructure!,
      tokensUsed: totalTokens + memoryTokens,
      budgetExceeded,
    };
  }

  /**
   * Detect intent from a user query.
   */
  detectIntent(query: string): ContextIntent {
    const lower = query.toLowerCase();

    // Project explanation
    if (
      lower.includes("explain this project") ||
      lower.includes("what is this project") ||
      lower.includes("overview") ||
      lower.includes("what does this do")
    ) {
      return "explain_project";
    }

    // Finding code
    if (
      lower.includes("where is") ||
      lower.includes("find") ||
      lower.includes("search for") ||
      lower.includes("show me") ||
      lower.includes("implemented")
    ) {
      return "find_code";
    }

    // Bug fixes
    if (
      lower.includes("fix") ||
      lower.includes("bug") ||
      lower.includes("broken") ||
      lower.includes("error") ||
      lower.includes("not working")
    ) {
      return "fix_bug";
    }

    // New features
    if (
      lower.includes("add") ||
      lower.includes("create") ||
      lower.includes("implement") ||
      lower.includes("new feature")
    ) {
      return "add_feature";
    }

    // Refactoring
    if (
      lower.includes("refactor") ||
      lower.includes("clean up") ||
      lower.includes("improve") ||
      lower.includes("optimize")
    ) {
      return "refactor";
    }

    return "general";
  }
}
