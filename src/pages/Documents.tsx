import { useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData, useLive } from '../context/DataContext';
import * as api from '../lib/api';
import type { LibraryDoc, PostAudience } from '../lib/types';
import { fmtDate } from '../lib/format';
import { Confirm, Empty, Field, Modal, useAction } from '../components/ui';
import { IconLink, IconPlus } from '../components/icons';

/** Brochures, templates, guides and logos: links to files in Google Drive, organised by department. */
export function DocumentsPage() {
  const { profile, can } = useMe();
  const { departments, departmentById } = useData();
  const [all] = useLive<LibraryDoc>(can.isCore ? 'docs:all' : null, () => collection(db, 'docs'));
  const [pub] = useLive<LibraryDoc>(can.isCore ? null : 'docs:public', () => query(collection(db, 'docs'), where('audience', '==', 'all')));
  const [mine] = useLive<LibraryDoc>(!can.isCore && can.dept ? `docs:dept:${can.dept}` : null, () => query(collection(db, 'docs'), where('departmentId', '==', can.dept)));
  const docs = [...new Map([...all, ...pub, ...mine].map((d) => [d.id, d])).values()].sort((x, y) => x.title.localeCompare(y.title));
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<LibraryDoc | null>(null);
  const [q, setQ] = useState('');
  const { run } = useAction();
  const canAdd = can.isLeadership || can.isHod;
  const shown = docs.filter((d) => !q || `${d.title} ${d.description ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [
    { key: 'all', name: 'For everyone', list: shown.filter((d) => d.audience === 'all') },
    { key: 'core', name: 'Core team', list: shown.filter((d) => d.audience === 'core') },
    ...departments.map((dep) => ({ key: dep.id, name: dep.name, list: shown.filter((d) => d.audience === 'department' && d.departmentId === dep.id) })),
  ].filter((g) => g.list.length);

  return (
    <>
      <div className="page-head">
        <div><h1>Documents</h1><p>Brochures, templates, guides and logos. Open them straight from here.</p></div>
        <div className="page-actions">
          <input className="input" style={{ width: 220 }} placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
          {canAdd && <button className="btn btn-primary" onClick={() => setAdding(true)}><IconPlus />Add document</button>}
        </div>
      </div>
      {groups.length === 0 ? <div className="card"><Empty title={docs.length ? 'Nothing matches' : 'No documents yet'} icon={<IconLink />}>{canAdd && !docs.length ? 'Add the first one. Upload the file to Google Drive and paste the share link.' : null}</Empty></div> : (
        <div className="stack">
          {groups.map((g) => (
            <section key={g.key} className="stack-sm">
              <div className="tier">{g.name}</div>
              <div className="card menu-list">
                {g.list.map((d) => (
                  <div key={d.id} className="menu-item" style={{ cursor: 'default' }}>
                    <span className="mi-icon"><IconLink /></span>
                    <a className="mi-text" href={d.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <b>{d.title}</b><span>{d.description ?? `Added by ${d.createdByName ?? 'ElevateX'}${d.createdAt ? ` · ${fmtDate(d.createdAt)}` : ''}`}</span>
                    </a>
                    {(d.createdBy === profile.id || can.isLeadership) && <button className="btn btn-sm btn-ghost" onClick={() => setDeleting(d)}>Remove</button>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {adding && <AddDoc onClose={() => setAdding(false)} departments={departments} departmentById={departmentById} />}
      {deleting && <Confirm title={`Remove “${deleting.title}”?`} danger confirmLabel="Remove" message="Only the link is removed from the Hub. The file itself stays where it is." onClose={() => setDeleting(null)} onConfirm={() => run(() => api.deleteLibraryDoc(deleting), 'Removed')} />}
    </>
  );
}

function AddDoc({ onClose, departments }: { onClose: () => void; departments: { id: string; name: string }[]; departmentById: Map<string, { name: string }> }) {
  const { can } = useMe();
  const [f, setF] = useState({ title: '', url: '', description: '', audience: (can.isLeadership ? 'all' : 'department') as PostAudience, departmentId: can.isLeadership ? '' : can.dept ?? '' });
  const { busy, run } = useAction();
  const urlOk = /^https:\/\/\S+/.test(f.url.trim());
  const valid = f.title.trim() && urlOk && (f.audience !== 'department' || f.departmentId);
  return (
    <Modal title="Add a document" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !valid} onClick={async () => { if (await run(() => api.addLibraryDoc({ ...f, departmentId: f.audience === 'department' ? f.departmentId : null }), 'Document added')) onClose(); }}>Add</button></>}>
      <Field label="Name"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. ElevateX brochure 2026" autoFocus /></Field>
      <Field label="Link" hint="Upload the file to Google Drive, set sharing to “Anyone with the link”, and paste the link here.">
        <input className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://drive.google.com/…" />
      </Field>
      {f.url && !urlOk && <div className="callout bad">The link must start with https://</div>}
      <Field label="Short description (optional)"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      {can.isLeadership ? (
        <div className="form-grid">
          <Field label="Who can see it">
            <select className="select" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as PostAudience })}>
              <option value="all">Everyone</option><option value="core">Core team</option><option value="department">One department</option>
            </select>
          </Field>
          {f.audience === 'department' && (
            <Field label="Department">
              <select className="select" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
                <option value="">Choose…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      ) : <p className="small muted">Visible to your department and the core team.</p>}
    </Modal>
  );
}
