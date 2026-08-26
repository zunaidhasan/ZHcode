/**
 * Environment variable handling for ZHcode.
 *
 * Values are read from the actual process environment first; if missing,
 * a local `.env` file (if present) is used as fallback. `.env` is git-ignored.
 */

let cachedEnv: Record<string, string> | null = null;

async function loadDotEnv(): Promise<Record<string, string>> {
  if (cachedEnv) return cachedEnv;
  cachedEnv = {};
  try {
    const file = Bun.file(".env");
    if (await file.exists()) {
      for (const line of (await file.text()).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        cachedEnv[key] = value;
      }
    }
  } catch {
    // .env is optional; ignore read errors.
  }
  return cachedEnv;
}

/** Read an env var from process.env, falling back to the local `.env` file. */
export async function getEnv(key: string): Promise<string | undefined> {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined) return fromProcess;
  const dotenv = await loadDotEnv();
  return dotenv[key];
}

/** Read a required env var; throws with a helpful message when missing. */
export async function requireEnv(key: string): Promise<string> {
  const value = await getEnv(key);
  if (value === undefined) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Set it in your shell or add it to a local .env file.`,
    );
  }
  return value;
}
