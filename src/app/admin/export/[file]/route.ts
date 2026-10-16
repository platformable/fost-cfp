import { NextResponse, type NextRequest } from 'next/server';
import { exportResponse, filtersFrom, parseExportFile } from '@/lib/export';
import { currentUser } from '@/lib/session';

// Spreadsheet downloads for signed-in organisers: /admin/export/<dataset>.<csv|xlsx|json>
export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url));
  if (user.role !== 'admin') return new Response('Not allowed', { status: 403 });
  const m = parseExportFile((await params).file);
  if (!m) return new Response('Not found', { status: 404 });
  return exportResponse(m[1], m[2], await filtersFrom(req.nextUrl.searchParams));
}
