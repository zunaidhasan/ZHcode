// Context — Codebase Context & Explorer.
// Project scanning, file indexing, exploration, and context building.

// Core types
export type {
  ProjectLanguage,
  ProjectFramework,
  PackageManager,
  ProjectContext,
  FileMetadata,
  ProjectStructure,
  FileSearchResult,
  ContextRequest,
  ContextResponse,
  ContextIntent,
  ContextBudget,
  ProjectMemoryEntry,
  ProjectMemory,
} from "./types";

// Scanner
export { ProjectScanner } from "./scanner";

// File index
export { FileIndex } from "./file-index";

// Structure
export { StructureBuilder } from "./structure";

// Ranking
export { RelevanceRanker } from "./ranking";

// Budget
export { BudgetManager } from "./budget";

// Explorer
export { CodebaseExplorer, type ExplorerOptions } from "./explorer";

// Memory
export { MemoryStore } from "./memory";

// Context Engine
export { ContextEngine, type ContextEngineOptions } from "./engine";
