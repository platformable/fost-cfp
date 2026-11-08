// Receives the Typeform CSV upload (a route handler, not a server action, so files over 1 MB work)
// and stores it as an import batch, then shows its preview. Nothing is imported here.
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/session';
import { createBatch } from '@/lib/imports';
import { baseUrl } from '@/lib/links';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Only accept uploads posted from this site's own page (server actions do this check for themselves).
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(baseUrl()).origin && origin !== req.nextUrl.origin) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/admin/import', baseUrl()), 303);
  if (user.role !== 'admin') return NextResponse.redirect(new URL('/forbidden', baseUrl()), 303);
  const back = (msg: string) => NextResponse.redirect(new URL(`/admin/import?error=${encodeURIComponent(msg)}`, baseUrl()), 303);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 100_000) return back('The file is larger than 10 MB.');
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    file = f instanceof File ? f : null;
  } catch {
    return back('The upload did not arrive. Please try again.');
  }
  if (!file || !file.size) return back('Choose the Typeform CSV export to upload.');
  if (file.size > MAX_BYTES) return back('The file is larger than 10 MB.');
  const id = await createBatch(file.name, await file.text(), user.id);
  return NextResponse.redirect(new URL(`/admin/import/${id}`, baseUrl()), 303);
}
