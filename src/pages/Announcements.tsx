import { useEffect, useState } from 'react';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import type { Announcement, PostAudience } from '../lib/types';
import { fmtDateTime } from '../lib/format';
import { Confirm, Empty, Field, Modal, useAction, useToast } from '../components/ui';
import { IconBell, IconPlus } from '../components/icons';

const SEEN_KEY = 'ex-ann-read';
/** Announcements this person has already opened (kept on the device; the receipt itself is in the database). */
export function readSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); }
}
function remember(ids: string[]) {
  try { const s = readSet(); ids.forEach((i) => s.add(i)); localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* storage unavailable */ }
}

export function canPostAnnouncements(can: ReturnType<typeof useMe>['can']) {
  return can.isLeadership || can.isHod;
}

export function AnnouncementsPage() {
  const { profile, can } = useMe();
  const { announcements, departmentById } = useData();
  const [composing, setComposing] = useState(false);
  const [readers, setReaders] = useState<{ a: Announcement; list: { uid: string; name: string | null }[] } | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const { busy, run } = useAction();

  // Opening this page counts as reading what's on it.
  useEffect(() => {
    const seen = readSet();
    const fresh = announcements.filter((a) => !seen.has(a.id) && a.createdBy !== profile.id);
    if (!fresh.length) return;
    remember(fresh.map((a) => a.id));
    fresh.forEach((a) => api.markAnnouncementRead(a).catch(() => {}));
  }, [announcements, profile.id]);

  const audienceText = (a: Announcement) => (a.audience === 'all' ? 'Everyone' : a.audience === 'core' ? 'Core team' : departmentById.get(a.departmentId ?? '')?.name ?? 'Department');

  return (
    <>
      <div className="page-head">
        <div><h1>Announcements</h1><p>News and notices from leadership and your department head.</p></div>
        {canPostAnnouncements(can) && <button className="btn btn-primary" onClick={() => setComposing(true)}><IconPlus />New announcement</button>}
      </div>
      {announcements.length === 0 ? (
        <div className="card"><Empty title="No announcements yet" icon={<IconBell />} /></div>
      ) : (
        <div className="stack">
          {announcements.map((a) => {
            const mine = a.createdBy === profile.id || can.isTop;
            return (
              <article key={a.id} className="card card-pad stack" style={a.pinned ? { borderColor: 'var(--brand-2)' } : undefined}>
                <div className="spread">
                  <div className="row">{a.pinned && <span className="badge brand">Pinned</span>}<span className="badge plain">{audienceText(a)}</span></div>
                  <span className="small muted">{a.createdByName ?? 'ElevateX'} · {a.createdAt ? fmtDateTime(a.createdAt) : 'Just now'}</span>
                </div>
                <h2>{a.title}</h2>
                <p className="prose">{a.body}</p>
                {mine && (
                  <div className="row">
                    <button className="btn btn-sm" disabled={busy} onClick={() => run(async () => setReaders({ a, list: await api.announcementReaders(a) }))}>Who has read it</button>
                    <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.updateAnnouncement(a, { pinned: !a.pinned }), a.pinned ? 'Unpinned' : 'Pinned to everyone’s home page')}>{a.pinned ? 'Unpin' : 'Pin'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleting(a)}>Delete</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {composing && <Compose onClose={() => setComposing(false)} />}
      {readers && (
        <Modal title={`Read by ${readers.list.length}`} onClose={() => setReaders(null)}>
          {readers.list.length === 0 ? <p className="muted">Nobody has opened it yet.</p> : <p>{readers.list.map((r) => r.name ?? 'Member').sort().join(', ')}</p>}
        </Modal>
      )}
      {deleting && <Confirm title="Delete this announcement?" danger confirmLabel="Delete" message="It disappears for everyone." onClose={() => setDeleting(null)} onConfirm={() => run(() => api.deleteAnnouncement(deleting), 'Deleted')} />}
    </>
  );
}

function Compose({ onClose }: { onClose: () => void }) {
  const { can } = useMe();
  const { users, departments } = useData();
  const toast = useToast();
  const [f, setF] = useState({ title: '', body: '', audience: (can.isLeadership ? 'all' : 'department') as PostAudience, departmentId: can.isLeadership ? '' : can.dept ?? '', pinned: false });
  const { busy, run } = useAction();
  const valid = f.title.trim() && f.body.trim() && (f.audience !== 'department' || f.departmentId);
  return (
    <Modal title="New announcement" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !valid}
        onClick={async () => {
          let notified = 0;
          const ok = await run(async () => { notified = (await api.postAnnouncement({ ...f, departmentId: f.audience === 'department' ? f.departmentId : null }, users)).notified; });
          if (ok) { toast(notified < 0 ? 'Posted, but notifications could not be sent' : `Posted. ${notified} people notified.`); onClose(); }
        }}>Post</button></>}>
      <Field label="Title"><input className="input" maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
      <Field label="Message"><textarea className="textarea" style={{ minHeight: 140 }} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      {can.isLeadership ? (
        <div className="form-grid">
          <Field label="Who sees it">
            <select className="select" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as PostAudience })}>
              <option value="all">Everyone</option>
              <option value="core">Core team</option>
              <option value="department">One department</option>
            </select>
          </Field>
          {f.audience === 'department' && (
            <Field label="Department">
              <select className="select" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
                <option value="">Choose…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      ) : <p className="small muted">Goes to everyone in your department.</p>}
      <label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />Pin it to the top of their home page</label>
    </Modal>
  );
}
