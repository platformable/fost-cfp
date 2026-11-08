// Receives the Typeform CSV upload (a route handler, not a server action, so files over 1 MB work)
// and stores it as an import batch, then shows its preview. Nothing is imported here.
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/session';
import { createBatch } from '@/lib/imports';
import { fromThisSite } from '@/lib/same-site';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 10 * 1024 * 1024;
// Relative redirects, so they work whatever BASE_URL is set to.
const see = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

export async function POST(req: NextRequest) {
  // Only accept uploads posted from this site's own page (server actions do this check for themselves).
  if (!fromThisSite(req.headers)) {
    return new NextResponse('This upload did not come from the Import page. Go back to Organise → Import and try again.', { status: 403 });
  }
  const user = await currentUser();
  if (!user) return see('/login?next=/admin/import');
  if (user.role !== 'admin') return see('/forbidden');
  const back = (msg: string) => see(`/admin/import?error=${encodeURIComponent(msg)}`);
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
  return see(`/admin/import/${id}`);
}
