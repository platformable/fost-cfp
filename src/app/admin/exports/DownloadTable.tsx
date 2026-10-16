'use client';

import { useState } from 'react';

const DATASETS: [string, string, string[]][] = [
  ['workbook', 'All of the below, one tab each', ['xlsx']],
  ['submissions', 'One row per proposal: talk details, speaker contact details, status, review scores, confirmation, feedback, timestamps, links', ['xlsx', 'csv']],
  ['program', 'Accepted talks only, with speaker bio, country, headshot and confirmation status: for the website, schedule and speaker comms', ['xlsx', 'csv']],
  ['speakers', 'One row per speaker with proposal counts by outcome: for mailing lists and speaker management', ['xlsx', 'csv']],
  ['reviews', 'One row per review: reviewer, score, recommendation, comments', ['xlsx', 'csv']],
  ['conferences', 'Conference settings and headline numbers', ['xlsx', 'csv']],
];

export function DownloadTable({ conferences }: { conferences: { slug: string; name: string }[] }) {
  const [conf, setConf] = useState('');
  const q = conf ? `?conference=${encodeURIComponent(conf)}` : '';
  return (
    <>
      <div className="filters">
        <label>Conference
          <select value={conf} onChange={(e) => setConf(e.target.value)}>
            <option value="">All conferences</option>
            {conferences.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Dataset</th><th>What&apos;s in it</th><th>Download</th></tr></thead>
          <tbody>
            {DATASETS.map(([name, desc, exts]) => (
              <tr key={name}>
                <td><strong>{name}</strong></td><td>{desc}</td>
                <td className="nowrap">{exts.map((ext) => <a key={ext} className="btn btn-small btn-ghost" href={`/admin/export/${name}.${ext}${q}`} style={{ marginRight: 6 }}>.{ext}</a>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
