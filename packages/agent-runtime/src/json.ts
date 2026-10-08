/**
 * Extract a JSON object from model output.
 *
 * Prefers a fenced ```json block, then falls back to the first {...} span.
 * Returns null when nothing parseable is found — callers decide how to repair.
 */

export function extractJsonBlock<T>(content: string): T | null {
  const fenced = content.match(/```json\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? firstObjectSpan(content);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function firstObjectSpan(content: string): string | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return content.slice(start, end + 1);
}
