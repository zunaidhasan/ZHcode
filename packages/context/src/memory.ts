/**
 * ProjectMemory — persistent project memory.
 *
 * Stores discoveries, decisions, and preferences in .zhcode/memory.json.
 * This file is git-ignored (runtime state).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProjectMemory, ProjectMemoryEntry } from "./types";

const MEMORY_DIR = ".zhcode";
const MEMORY_FILE = "memory.json";

export class MemoryStore {
  private readonly root: string;
  private readonly memoryPath: string;
  private memory: ProjectMemory;

  constructor(root: string) {
    this.root = root;
    this.memoryPath = path.join(root, MEMORY_DIR, MEMORY_FILE);
    this.memory = { projectRoot: root, entries: [] };
  }

  /** Load memory from disk. */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.memoryPath, "utf-8");
      this.memory = JSON.parse(content);
    } catch {
      // File doesn't exist or is invalid — start fresh.
      this.memory = { projectRoot: this.root, entries: [] };
    }
  }

  /** Save memory to disk. */
  async save(): Promise<void> {
    const dir = path.join(this.root, MEMORY_DIR);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.memoryPath, JSON.stringify(this.memory, null, 2), "utf-8");
  }

  /** Add a memory entry. */
  async add(
    key: string,
    category: ProjectMemoryEntry["category"],
    content: string,
  ): Promise<void> {
    const now = Date.now();
    const existing = this.memory.entries.find((e) => e.key === key);

    if (existing) {
      existing.content = content;
      existing.category = category;
      existing.updatedAt = now;
    } else {
      this.memory.entries.push({
        key,
        category,
        content,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.save();
  }

  /** Get a memory entry by key. */
  get(key: string): ProjectMemoryEntry | undefined {
    return this.memory.entries.find((e) => e.key === key);
  }

  /** Get all entries, optionally filtered by category. */
  getAll(category?: ProjectMemoryEntry["category"]): ProjectMemoryEntry[] {
    if (category) {
      return this.memory.entries.filter((e) => e.category === category);
    }
    return [...this.memory.entries];
  }

  /** Delete a memory entry. */
  async delete(key: string): Promise<boolean> {
    const idx = this.memory.entries.findIndex((e) => e.key === key);
    if (idx === -1) return false;
    this.memory.entries.splice(idx, 1);
    await this.save();
    return true;
  }

  /** Format memory as text for model context. */
  format(): string {
    if (this.memory.entries.length === 0) return "";

    const lines = ["## Project Memory"];
    for (const entry of this.memory.entries) {
      lines.push(`\n### [${entry.category}] ${entry.key}`);
      lines.push(entry.content);
    }
    return lines.join("\n");
  }
}
