import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useLive } from '../context/DataContext';
import type { AuditEntry } from '../lib/types';
import { fmtDateTime } from '../lib/format';
import { Empty } from '../components/ui';

const LABEL: Record<string, string> = {
  'member.added': 'Added a person',
  'member.updated': 'Changed a person',
  'member.removed': 'Removed access',
  'member.active': 'Restored access',
  'member.alumni': 'Marked as alumni',
  'credits.given': 'Gave credits',
  'credits.removed': 'Took away credits',
  'credits.changed': 'Changed credits',
  'past.activity': 'Recorded a past activity',
  'past.credits': 'Gave credits for a past activity',
  'drive.approved': 'Approved a drive',
  'drive.declined': 'Declined a drive',
  'activity.deleted': 'Deleted an activity',
  'department.approved': 'Moved someone to another department',
  'department.declined': 'Declined a department change',
  'certificate.issued': 'Issued a certificate',
  'certificate.declined': 'Declined a certificate',
  'certificate.pending': 'Updated a certificate request',
  'edpi.locked': 'Locked an EDPI plan',
  'application.added': 'Added an applicant to the Hub',
};
const GROUPS: [string, string][] = [['all', 'Everything'], ['member', 'People'], ['credits', 'Credits'], ['past', 'Past records'], ['drive', 'Approvals'], ['certificate', 'Certificates'], ['department', 'Departments']];

/** Who changed what, for accountability. Leadership only; entries can't be edited or deleted. */
export function HistoryPage() {
  const { can } = useMe();
  const [rows] = useLive<AuditEntry>(can.isLeadership ? 'audit' : null, () => query(collection(db, 'audit'), orderBy('at', 'desc'), limit(500)));
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  if (!can.isLeadership) return <Navigate to="/" replace />;
  const shown = rows
    .filter((r) => group === 'all' || r.action.startsWith(group))
    .filter((r) => !q || `${r.actorName} ${r.targetName} ${r.detail} ${LABEL[r.action] ?? r.action}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head">
        <div><h1>Change history</h1><p>Every change to people, credits, approvals and certificates, with who made it. Nobody can edit or delete these entries.</p></div>
      </div>
      <div className="spread" style={{ marginBottom: 14 }}>
        <div className="segmented">{GROUPS.map(([k, l]) => <button key={k} className={group === k ? 'on' : ''} onClick={() => setGroup(k)}>{l}</button>)}</div>
        <input className="input" style={{ width: 240 }} placeholder="Search names or details…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search history" />
      </div>
      <section className="card">
        {shown.length === 0 ? <Empty title="Nothing recorded yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="small nowrap">{r.at ? fmtDateTime(r.at) : '—'}</td>
                    <td className="small">{r.actorName ?? 'Someone'}</td>
                    <td className="small"><b>{LABEL[r.action] ?? r.action}</b>{r.targetName && <div className="muted">{r.targetName}</div>}</td>
                    <td className="small muted" style={{ maxWidth: 380 }}>{r.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="small muted" style={{ marginTop: 12 }}>Shows the latest 500 entries. History starts from when this feature was added.</p>
    </>
  );
}
