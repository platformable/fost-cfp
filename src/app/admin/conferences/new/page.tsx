import Link from 'next/link';
import { saveConferenceAction } from '@/actions/admin';
import { requireRole } from '@/lib/session';
import { ConferenceForm } from '../ConferenceForm';

export const metadata = { title: 'New conference' };

export default async function NewConference() {
  await requireRole(['admin'], '/admin/conferences/new');
  return (
    <>
      <p><Link href="/admin">← Organiser dashboard</Link></p>
      <h1>New conference</h1>
      <section className="card"><ConferenceForm action={saveConferenceAction.bind(null, null)} initial={{}} isNew /></section>
    </>
  );
}
