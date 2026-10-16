import { notFound, redirect } from 'next/navigation';
import { editProposalAction } from '@/actions/proposals';
import { LEVELS, getConference } from '@/lib/conferences';
import { toFormConference } from '@/lib/form-conferences';
import { COMMON_FIELDS, editWindow, getProposal } from '@/lib/proposals';
import { requireUser } from '@/lib/session';
import { ProposalForm } from '@/components/ProposalForm';
import { EditWindowLabel } from '@/components/ui';

export const metadata = { title: 'Edit proposal' };

export default async function EditProposal({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const user = await requireUser(`/proposals/${id}/edit`);
  const p = await getProposal(id);
  if (!p || p.speaker_id !== user.id) notFound();
  const conf = (await getConference(p.conference_id))!;
  const edit = editWindow(p, conf);
  if (!edit.editable) redirect(`/proposals/${id}`);
  return (
    <>
      <h1>Edit proposal</h1>
      <p className="muted">Conference: <strong>{conf.name}</strong> · <EditWindowLabel edit={edit} inline /></p>
      <ProposalForm
        mode="edit"
        action={editProposalAction.bind(null, id)}
        conferences={[toFormConference(conf)]}
        levels={LEVELS}
        initial={{
          values: Object.fromEntries(COMMON_FIELDS.map((f) => [f, p[f]])),
          selected: [conf.id],
          picks: { [conf.id]: { format: p.format, topic: p.topic } },
        }}
        cancelHref={`/proposals/${id}`}
      />
    </>
  );
}
