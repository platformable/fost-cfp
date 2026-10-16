import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { ensureSecret } from '@/lib/db';
import { exportResponse, filtersFrom, parseExportFile } from '@/lib/export';

// The same exports behind a secret token, for automations (Google Sheets IMPORTDATA, Zapier, Make, cron...).
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await params;
  const expected = Buffer.from(await ensureSecret('export_token'));
  const given = Buffer.from(token);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return new Response('Invalid export token', { status: 401 });
  }
  const m = parseExportFile(file);
  if (!m) return new Response('Not found', { status: 404 });
  return exportResponse(m[1], m[2], await filtersFrom(req.nextUrl.searchParams));
}
