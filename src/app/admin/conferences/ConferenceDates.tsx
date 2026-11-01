'use client';

import { useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad2 = (n: string | number) => String(n).padStart(2, '0');

type Values = Record<string, string | boolean | null | undefined>;

// Conference dates as either exact days or, while the days aren't known yet, just the month and year.
export function ConferenceDates({ values }: { values: Values }) {
  const str = (k: string) => (values[k] == null ? '' : String(values[k]));
  const savedPrecision = str('date_precision') === 'month' ? 'month' : 'day';
  const savedStart = str('start_date');

  const [precision, setPrecision] = useState<'day' | 'month'>(savedPrecision);
  const [start, setStart] = useState(savedPrecision === 'day' ? savedStart : '');
  const [end, setEnd] = useState(savedPrecision === 'day' ? str('end_date') : '');
  const [month, setMonth] = useState(str('start_month') || (savedStart ? String(Number(savedStart.slice(5, 7))) : ''));
  const [year, setYear] = useState(str('start_year') || savedStart.slice(0, 4));

  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: 6 }, (_, i) => String(thisYear + i));
  if (year && !years.includes(year)) years.unshift(year);

  const choose = (next: 'day' | 'month') => {
    // Carry the month across so the organiser only has to adjust the day, or vice versa.
    if (next === 'day' && !start && month && year) setStart(`${year}-${pad2(month)}-01`);
    if (next === 'month' && start) {
      setMonth(String(Number(start.slice(5, 7))));
      setYear(start.slice(0, 4));
    }
    setPrecision(next);
  };

  return (
    <fieldset className="date-choice">
      <legend>Conference dates</legend>
      <div className="choice-row">
        <label className="check"><input type="radio" name="date_precision" value="day" checked={precision === 'day'} onChange={() => choose('day')} /> Exact dates</label>
        <label className="check"><input type="radio" name="date_precision" value="month" checked={precision === 'month'} onChange={() => choose('month')} /> Month only</label>
      </div>
      {precision === 'day' ? (
        <div className="field-row">
          <label>Starts <input type="date" name="start_date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Ends <input type="date" name="end_date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
      ) : (
        <>
          <div className="field-row">
            <label>Month
              <select name="start_month" value={month} onChange={(e) => setMonth(e.target.value)} required>
                <option value="">Choose…</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
              </select></label>
            <label>Year
              <select name="start_year" value={year} onChange={(e) => setYear(e.target.value)} required>
                <option value="">Choose…</option>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select></label>
          </div>
          <p className="small muted">Speakers will see the month, for example &ldquo;June {year || thisYear + 1}&rdquo;. Add the exact dates when you know them. Until then, speakers can keep editing their proposals.</p>
        </>
      )}
    </fieldset>
  );
}
