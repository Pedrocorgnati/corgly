import 'server-only';

/**
 * RFC 4180 CSV escaper. Fields containing ", comma, CR or LF are quoted;
 * internal quotes are doubled.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const head = headers.map(escapeCell).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCell(r[h])).join(',')).join('\r\n');
  return body ? `${head}\r\n${body}\r\n` : `${head}\r\n`;
}

/**
 * ReadableStream CSV emitter for large datasets. Yields the header first,
 * then one line per row as the generator yields batches.
 */
export function csvStream(
  headers: string[],
  batches: AsyncIterable<Array<Record<string, unknown>>>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(headers.map(escapeCell).join(',') + '\r\n'));
      try {
        for await (const batch of batches) {
          for (const row of batch) {
            controller.enqueue(
              encoder.encode(headers.map((h) => escapeCell(row[h])).join(',') + '\r\n'),
            );
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
