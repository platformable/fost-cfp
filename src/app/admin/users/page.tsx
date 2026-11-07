import Link from 'next/link';
import { copyPasswordLinkAction, setRoleAction } from '@/actions/admin';
import { copyConfirmationLinkAction } from '@/actions/guests';
import { CopyLink } from './CopyLink';
import { listUsers } from '@/lib/users';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/session';
import { AutoSubmitSelect } from '@/components/AutoSubmitSelect';

export const metadata = { title: 'People' };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole(['admin'], '/admin/users');
  const q = (await searchParams).q ?? '';
  const users = await listUsers(q);
  return (
    <>
      <p><Link href="/admin">← Organiser dashboard</Link></p>
      <div className="row-between">
        <h1>People</h1>
        <form method="get" className="inline-form">
          <input name="q" defaultValue={q} placeholder="Search name, email, organisation" aria-label="Search" />
          <button className="btn btn-small">Search</button>
        </form>
      </div>
      <div className="table-wrap card flush">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Organisation</th><th className="num">Proposals</th><th>Joined</th><th>Role</th><th>Password</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong>{!u.password_hash && u.role === 'speaker' && <> <span className="badge badge-paused">Guest</span></>}</td>
                <td><a href={`mailto:${u.email}`}>{u.email}</a></td>
                <td>{u.organization}</td>
                <td className="num">{u.proposal_count}{u.awaiting_count > 0 && <><br /><span className="small muted nowrap">+{u.awaiting_count} awaiting confirmation</span><br /><CopyLink action={copyConfirmationLinkAction.bind(null, u.id)} name={u.name} label="Copy confirmation link" note="Works once, for 6 months." /></>}</td>
                <td className="nowrap">{formatDate(u.created_at)}</td>
                <td>
                  <form action={setRoleAction.bind(null, u.id)} className="inline-form">
                    <AutoSubmitSelect name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`}>
                      {['speaker', 'reviewer', 'admin'].map((r) => <option key={r}>{r}</option>)}
                    </AutoSubmitSelect>
                    <noscript><button className="btn btn-small">Save</button></noscript>
                  </form>
                </td>
                <td>
                  {!u.password_hash && <><span className="small muted">Not set yet</span><br /></>}
                  <CopyLink action={copyPasswordLinkAction.bind(null, u.id)} name={u.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
