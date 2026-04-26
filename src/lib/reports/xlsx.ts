import 'server-only';
import ExcelJS from 'exceljs';

export async function rowsToXlsxBuffer(
  sheetName: string,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Corgly';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    ws.addRow(headers.map((h) => {
      const v = row[h];
      if (v instanceof Date) return v;
      return v ?? '';
    }));
  }
  ws.columns.forEach((col) => {
    col.width = Math.max(12, (col.header as string | undefined)?.length ?? 12);
  });
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}
