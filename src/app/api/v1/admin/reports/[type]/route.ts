import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loadReport, type ReportType } from '@/lib/reports/queries';
import { rowsToCsv } from '@/lib/reports/csv';
import { rowsToXlsxBuffer } from '@/lib/reports/xlsx';
import { checkReportRateLimit } from '@/lib/reports/rate-limit';

const TYPES: ReportType[] = ['financial', 'sessions', 'users', 'feedback'];

const querySchema = z.object({
  format:   z.enum(['csv', 'xlsx']).default('csv'),
  from:     z.string().datetime().optional(),
  to:       z.string().datetime().optional(),
  status:   z.string().optional(),
  language: z.string().optional(),
});

/**
 * GET /api/v1/admin/reports/[type]?format=csv|xlsx&from=&to=&status=&language=
 * Streams (CSV) or buffers (XLSX) an admin report. Writes AuditLog.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { type } = await ctx.params;
  if (!TYPES.includes(type as ReportType)) {
    return NextResponse.json(apiResponse(null, 'Tipo de relatorio invalido.'), { status: 400 });
  }

  const rl = checkReportRateLimit(auth.id);
  if (!rl.ok) {
    return NextResponse.json(
      apiResponse(null, 'Limite de 10 downloads/hora atingido.'),
      { status: 429, headers: { 'X-RateLimit-Reset': String(rl.resetAt) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(apiResponse(null, 'Filtros invalidos.'), { status: 400 });
  }
  const q = parsed.data;

  const filters = {
    from:     q.from ? new Date(q.from) : undefined,
    to:       q.to ? new Date(q.to) : undefined,
    status:   q.status,
    language: q.language,
  };

  const report = await loadReport(type as ReportType, filters);
  const timestamp = new Date().toISOString().split('T')[0];
  const baseName = `corgly-${report.filename}-${timestamp}`;

  await prisma.auditLog.create({
    data: {
      adminId:      auth.id,
      action:       'report_exported',
      resourceType: 'report',
      resourceId:   type,
      metadata:     { format: q.format, filters, rowCount: report.rows.length },
    },
  }).catch((err) => console.error('auditLog report', err));

  if (q.format === 'csv') {
    const body = rowsToCsv(report.headers, report.rows);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}.csv"`,
        'Cache-Control':       'no-store',
      },
    });
  }

  const buffer = await rowsToXlsxBuffer(report.sheet, report.headers, report.rows);
  // `Buffer` e um `Uint8Array<ArrayBufferLike>`, e `ArrayBufferLike` inclui
  // `SharedArrayBuffer`, que nao e `BodyInit`. Copiar para um `Uint8Array`
  // respaldado por `ArrayBuffer` satisfaz o tipo sem mudar o conteudo enviado.
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${baseName}.xlsx"`,
      'Cache-Control':       'no-store',
    },
  });
}
