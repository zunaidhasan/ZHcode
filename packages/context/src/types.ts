/**
 * Core types for the ZHcode Context Engine.
 *
 * These types define how ZHcode understands and represents a project's
 * codebase structure, files, and relevant context.
 */

// ---------------------------------------------------------------------------
// Project context
// ---------------------------------------------------------------------------

export type ProjectLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "php"
  | "go"
  | "rust"
  | "java"
  | "ruby"
  | "unknown";

export type ProjectFramework =
  | "react"
  | "next"
  | "vue"
  | "nuxt"
  | "svelte"
  | "angular"
  | "express"
  | "fastify"
  | "laravel"
  | "django"
  | "flask"
  | "rails"
  | "unknown";

export type PackageManager =
  "npm" | "yarn" | "pnpm" | "bun" | "pip" | "composer" | "cargo" | "unknown";

export interface ProjectContext {
  /** Absolute path to project root. */
  root: string;
  /** Detected primary language. */
  language: ProjectLanguage;
  /** Detected frameworks. */
  frameworks: ProjectFramework[];
  /** Detected package manager. */
  packageManager: PackageManager;
  /** Project name from package.json or similar. */
  name?: string;
  /** Short description. */
  description?: string;
  /** Whether this is a monorepo. */
  isMonorepo: boolean;
  /** Workspace packages (if monorepo). */
  workspaces?: string[];
}

// ---------------------------------------------------------------------------
// File context
// ---------------------------------------------------------------------------

export interface FileMetadata {
  /** Relative path from project root. */
  path: string;
  /** File extension (e.g. ".ts"). */
  extension: string;
  /** Size in bytes. */
  size: number;
  /** Detected language. */
  language: ProjectLanguage;
  /** Last modified timestamp. */
  lastModified: number;
  /** Whether this file is likely important (entry points, configs). */
  isImportant: boolean;
}

// ---------------------------------------------------------------------------
// Project structure
// ---------------------------------------------------------------------------

export interface ProjectStructure {
  /** Top-level directories. */
  directories: string[];
  /** Top-level files. */
  files: string[];
  /** Key directories with their contents (shallow). */
  keyDirectories: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Search and discovery
// ---------------------------------------------------------------------------

export interface FileSearchResult {
  /** Relative path. */
  path: string;
  /** Relevance score (0-1). */
  score: number;
  /** Why this file is relevant. */
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Context request/response
// ---------------------------------------------------------------------------

export interface ContextRequest {
  /** The user's query or intent. */
  query: string;
  /** Intent type for context strategy. */
  intent: ContextIntent;
  /** Max files to include (default from budget). */
  maxFiles?: number;
  /** Max total tokens (default from budget). */
  maxTokens?: number;
}

export type ContextIntent =
  | "explain_project" // "Explain this project"
  | "find_code" // "Where is X implemented?"
  | "fix_bug" // "Fix the login bug"
  | "add_feature" // "Add a new feature"
  | "refactor" // "Refactor this code"
  | "general" // General questions
  | "unknown";

export interface ContextResponse {
  /** The project context. */
  project: ProjectContext;
  /** Relevant files found. */
  files: FileMetadata[];
  /** File contents (path -> content). */
  contents: Record<string, string>;
  /** Structure summary. */
  structure: ProjectStructure;
  /** Total tokens used (estimated). */
  tokensUsed: number;
  /** Whether budget was exceeded. */
  budgetExceeded: boolean;
}

// ---------------------------------------------------------------------------
// Context budget
// ---------------------------------------------------------------------------

export interface ContextBudget {
  /** Max files to include. */
  maxFiles: number;
  /** Max tokens for all file contents. */
  maxTokens: number;
  /** Reserved tokens for model output. */
  reservedOutputTokens: number;
  /** Max size per file in bytes. */
  maxFileSize: number;
}

// ---------------------------------------------------------------------------
// Project memory
// ---------------------------------------------------------------------------

export interface ProjectMemoryEntry {
  /** Unique key. */
  key: string;
  /** Category. */
  category: "architecture" | "decision" | "preference" | "issue" | "discovery";
  /** The memory content. */
  content: string;
  /** When it was created. */
  createdAt: number;
  /** When it was last updated. */
  updatedAt: number;
}

export interface ProjectMemory {
  /** Project root. */
  projectRoot: string;
  /** Stored entries. */
  entries: ProjectMemoryEntry[];
}
