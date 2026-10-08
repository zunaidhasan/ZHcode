/**
 * Format a ContextResponse as compact text for agent prompts.
 */

import type { ContextResponse } from "./types";

export function formatContext(response: ContextResponse): string {
  const lines: string[] = [];
  const project = response.project;
  lines.push(
    `Project: ${project.name ?? "unknown"} (${project.language}, ${project.packageManager})`,
  );
  if (project.description) lines.push(project.description);

  if (response.structure.directories.length > 0) {
    lines.push(`Directories: ${response.structure.directories.join(", ")}`);
  }

  const files = response.files.slice(0, 12);
  if (files.length > 0) {
    lines.push("Relevant files:");
    for (const file of files) {
      lines.push(`- ${file.path}`);
    }
  }

  const entries = Object.entries(response.contents).slice(0, 6);
  for (const [path, content] of entries) {
    const clipped = content.length > 1200 ? `${content.slice(0, 1200)}\n// ...` : content;
    lines.push(`\n### ${path}\n${clipped}`);
  }

  return lines.join("\n");
}
