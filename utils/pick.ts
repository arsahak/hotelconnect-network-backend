/** Copies only the listed fields that were sent (so a PATCH never wipes the rest). */
export function pick<T extends Record<string, unknown>>(source: T, fields: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const field of fields) if (source[field] !== undefined) out[field] = source[field];
  return out;
}
