// Tools — Phase 3.
// Tool registry, built-in file/search/git tools and permission layer.

// Core types
export type { Tool, ToolResult, PermissionLevel, ToolErrorCode } from "./types";
export { ToolError } from "./types";

// Context
export { ToolContext, type ToolContextOptions, type ToolLogger } from "./context";

// Registry
export { ToolRegistry } from "./registry";

// Permissions
export { PermissionManager, PermissionProfiles, type PermissionManagerOptions } from "./permissions";

// Built-in tools
export { listFilesTool } from "./tools/list_files";
export { readFileTool } from "./tools/read_file";
export { searchFilesTool } from "./tools/search_files";
export { writeFileTool } from "./tools/write_file";
export { editFileTool } from "./tools/edit_file";
export { runCommandTool } from "./tools/run_command";
export { gitStatusTool } from "./tools/git_status";

// Convenience: create a registry with all built-in tools registered.
import { ToolRegistry } from "./registry";
import { listFilesTool } from "./tools/list_files";
import { readFileTool } from "./tools/read_file";
import { searchFilesTool } from "./tools/search_files";
import { writeFileTool } from "./tools/write_file";
import { editFileTool } from "./tools/edit_file";
import { runCommandTool } from "./tools/run_command";
import { gitStatusTool } from "./tools/git_status";

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(listFilesTool);
  registry.register(readFileTool);
  registry.register(searchFilesTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(runCommandTool);
  registry.register(gitStatusTool);
  return registry;
}
