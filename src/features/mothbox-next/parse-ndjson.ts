export async function parseNdjsonLines<T>(text: string): Promise<T[]> {
  const rows: T[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    rows.push(JSON.parse(trimmed) as T)
  }
  return rows
}

export async function parseNdjsonFile<T>(params: { readText: () => Promise<string> }): Promise<T[]> {
  const text = await params.readText()
  return parseNdjsonLines<T>(text)
}

export function serializeNdjsonLines<T>(rows: T[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '')
}
