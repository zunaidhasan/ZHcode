/**
 * ProjectScanner — detects project type, languages, and frameworks.
 *
 * Analyzes configuration files (package.json, tsconfig.json, etc.)
 * to understand what kind of project this is.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ProjectContext,
  ProjectLanguage,
  ProjectFramework,
  PackageManager,
} from "./types";

interface PackageJson {
  name?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

export class ProjectScanner {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  /** Scan the project and return context. */
  async scan(): Promise<ProjectContext> {
    const [language, frameworks, packageManager, packageInfo] = await Promise.all([
      this.detectLanguage(),
      this.detectFrameworks(),
      this.detectPackageManager(),
      this.readPackageJson(),
    ]);

    const workspaces = await this.detectWorkspaces(packageInfo);

    return {
      root: this.root,
      language,
      frameworks,
      packageManager,
      name: packageInfo?.name,
      description: packageInfo?.description,
      isMonorepo: workspaces.length > 0,
      workspaces: workspaces.length > 0 ? workspaces : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Language detection
  // -------------------------------------------------------------------------

  private async detectLanguage(): Promise<ProjectLanguage> {
    // Check for language-specific config files.
    if (await this.exists("tsconfig.json")) return "typescript";
    if (await this.exists("pyproject.toml")) return "python";
    if (await this.exists("composer.json")) return "php";
    if (await this.exists("go.mod")) return "go";
    if (await this.exists("Cargo.toml")) return "rust";
    if (await this.exists("pom.xml")) return "java";
    if (await this.exists("Gemfile")) return "ruby";

    // Check package.json for TypeScript.
    const pkg = await this.readPackageJson();
    if (pkg) {
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      if ("typescript" in deps || "@types/node" in deps) return "typescript";
    }

    // Check for common JS/TS files.
    if (await this.exists("index.js") || await this.exists("index.mjs")) return "javascript";
    if (await this.exists("index.ts") || await this.exists("index.mts")) return "typescript";

    return "unknown";
  }

  // -------------------------------------------------------------------------
  // Framework detection
  // -------------------------------------------------------------------------

  private async detectFrameworks(): Promise<ProjectFramework[]> {
    const frameworks: ProjectFramework[] = [];
    const pkg = await this.readPackageJson();

    if (pkg) {
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      const depNames = Object.keys(allDeps);

      // React ecosystem
      if (depNames.includes("react")) frameworks.push("react");
      if (depNames.includes("next")) frameworks.push("next");
      if (depNames.includes("vue")) frameworks.push("vue");
      if (depNames.includes("nuxt")) frameworks.push("nuxt");
      if (depNames.includes("svelte")) frameworks.push("svelte");
      if (depNames.includes("@angular/core")) frameworks.push("angular");

      // Backend
      if (depNames.includes("express")) frameworks.push("express");
      if (depNames.includes("fastify")) frameworks.push("fastify");
    }

    // PHP frameworks
    if (await this.exists("artisan")) frameworks.push("laravel");

    // Python frameworks
    if (await this.exists("manage.py")) {
      // Could be Django
      const settingsExists = await this.pathExists("settings.py") ||
        await this.globExists("*/settings.py");
      if (settingsExists) frameworks.push("django");
    }

    // Ruby
    if (await this.exists("Gemfile")) {
      const gemfile = await this.readFileSafe("Gemfile");
      if (gemfile.includes("rails")) frameworks.push("rails");
    }

    return frameworks.length > 0 ? frameworks : ["unknown"];
  }

  // -------------------------------------------------------------------------
  // Package manager detection
  // -------------------------------------------------------------------------

  private async detectPackageManager(): Promise<PackageManager> {
    if (await this.exists("bun.lockb") || await this.exists("bun.lock")) return "bun";
    if (await this.exists("pnpm-lock.yaml")) return "pnpm";
    if (await this.exists("yarn.lock")) return "yarn";
    if (await this.exists("package-lock.json")) return "npm";
    if (await this.exists("composer.lock")) return "composer";
    if (await this.exists("Cargo.lock")) return "cargo";

    // Python
    if (await this.exists("requirements.txt") || await this.exists("pyproject.toml")) return "pip";

    return "unknown";
  }

  // -------------------------------------------------------------------------
  // Monorepo detection
  // -------------------------------------------------------------------------

  private async detectWorkspaces(pkg: PackageJson | null): Promise<string[]> {
    if (!pkg?.workspaces) return [];

    const workspaces = pkg.workspaces;
    if (Array.isArray(workspaces)) {
      return workspaces;
    }
    return workspaces.packages ?? [];
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async readPackageJson(): Promise<PackageJson | null> {
    try {
      const content = await fs.readFile(path.join(this.root, "package.json"), "utf-8");
      return JSON.parse(content) as PackageJson;
    } catch {
      return null;
    }
  }

  private async exists(filename: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.root, filename));
      return true;
    } catch {
      return false;
    }
  }

  private async pathExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.root, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  private async globExists(pattern: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(this.root);
      for (const entry of entries) {
        if (entry.match(pattern.replace("*", ".*"))) {
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  }

  private async readFileSafe(filename: string): Promise<string> {
    try {
      return await fs.readFile(path.join(this.root, filename), "utf-8");
    } catch {
      return "";
    }
  }
}
