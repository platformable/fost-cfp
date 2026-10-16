import { badgeClass, formatDate, statusLabel } from '@/lib/format';
import type { EditWindow } from '@/lib/proposals';

export function Badge({ status, label }: { status: string; label?: string }) {
  return <span className={badgeClass(status)}>{label ?? statusLabel(status)}</span>;
}

export function Errors({ errors }: { errors?: string[] | string | null }) {
  const list = !errors ? [] : Array.isArray(errors) ? errors : [errors];
  if (!list.length) return null;
  return (
    <div className="flash flash-error" role="alert">
      {list.length === 1 ? list[0] : <ul>{list.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

export function EditWindowLabel({ edit, inline = false }: { edit: EditWindow; inline?: boolean }) {
  return (
    <>
      <span className={`edit-window edit-${edit.tone}`}>{edit.label}</span>
      {edit.editable && edit.deadline && (inline
        ? <> (until {formatDate(edit.deadline)})</>
        : <><br /><span className="small muted">until {formatDate(edit.deadline)}</span></>)}
    </>
  );
}

export const Prose = ({ children }: { children: React.ReactNode }) => <div className="prose">{children}</div>;
