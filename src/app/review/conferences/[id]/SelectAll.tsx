'use client';

export function SelectAll() {
  return (
    <input type="checkbox" aria-label="Select all"
      onChange={(e) => e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[name=ids]').forEach((c) => { c.checked = e.currentTarget.checked; })} />
  );
}
