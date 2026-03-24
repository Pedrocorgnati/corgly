import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Sem cache — health check deve sempre refletir estado atual
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const version = process.env.npm_package_version ?? '0.1.0';
  const timestamp = new Date().toISOString();
  const noCache = { 'Cache-Control': 'no-store, no-cache' };

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB health check timeout')), 5000),
      ),
    ]);

    return NextResponse.json(
      { status: 'ok', db: 'connected', version, timestamp },
      { status: 200, headers: noCache },
    );
  } catch (error) {
    const isTimeout =
      error instanceof Error && error.message.includes('timeout');
    return NextResponse.json(
      {
        status: 'error',
        db: 'disconnected',
        error: isTimeout ? 'SYS_003: DB health check timeout' : String(error),
        timestamp,
      },
      { status: isTimeout ? 504 : 503, headers: noCache },
    );
  }
}
