import { useState } from 'react';
import { collection, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData, useLive } from '../context/DataContext';
import * as api from '../lib/api';
import type { Poll } from '../lib/types';
import { fmtDateTime, toLocalInput } from '../lib/format';
import { Confirm, Empty, Field, Modal, useAction, useToast } from '../components/ui';
import { IconChart, IconPlus, IconX } from '../components/icons';

interface Vote { id: string; choices: number[]; name?: string | null }

export const pollIsOpen = (p: Poll) => !p.closed && (!p.closesAt || p.closesAt.getTime() > Date.now());

export function PollsPage() {
  const { can } = useMe();
  const { polls } = useData();
  const [creating, setCreating] = useState(false);
  const open = polls.filter(pollIsOpen);
  const closed = polls.filter((p) => !pollIsOpen(p));
  return (
    <>
      <div className="page-head">
        <div><h1>Polls</h1><p>Quick votes on venues, dates and decisions.</p></div>
        {can.isCore && <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus />New poll</button>}
      </div>
      {polls.length === 0 ? <div className="card"><Empty title="No polls yet" icon={<IconChart />} /></div> : (
        <div className="stack">
          {open.map((p) => <PollCard key={p.id} p={p} />)}
          {closed.length > 0 && <div className="tier" style={{ marginTop: 10 }}>Closed</div>}
          {closed.map((p) => <PollCard key={p.id} p={p} />)}
        </div>
      )}
      {creating && <CreatePoll onClose={() => setCreating(false)} />}
    </>
  );
}

function PollCard({ p }: { p: Poll }) {
  const { profile, can } = useMe();
  const { departmentById, userById } = useData();
  // Wait until the server has saved the poll (createdAt is filled in by the server) before reading its votes.
  const [votes] = useLive<Vote>(p.createdAt ? `votes:${p.id}` : null, () => query(collection(db, 'polls', p.id, 'votes')));
  const mine = votes.find((v) => v.id === profile.id);
  const [choice, setChoice] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);
  const { busy, run } = useAction();
  const open = pollIsOpen(p);
  const owner = p.createdBy === profile.id || can.isTop;
  const showResults = !!mine || !open || owner || can.isLeadership;
  const counts = p.options.map((_, i) => votes.filter((v) => v.choices.includes(i)).length);
  const total = votes.length;
  const who = p.audience === 'all' ? 'Everyone' : p.audience === 'people' ? `${p.uids.length} people` : p.departmentIds.map((d) => departmentById.get(d)?.name ?? d).join(', ');
  const toggle = (i: number) => setChoice((c) => (p.multi ? (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]) : [i]));

  return (
    <article className="card card-pad stack">
      <div className="spread">
        <div className="row"><span className={`badge ${open ? 'ok' : ''}`}>{open ? 'Open' : 'Closed'}</span><span className="badge plain">{who}</span></div>
        <span className="small muted">{p.createdByName ?? ''}{p.closesAt ? ` · ${open ? 'closes' : 'closed'} ${fmtDateTime(p.closesAt)}` : ''}</span>
      </div>
      <h2>{p.question}</h2>
      {showResults ? (
        <div className="stack-sm">
          {p.options.map((o, i) => {
            const pct = total ? Math.round((counts[i]! / total) * 100) : 0;
            return (
              <div key={i} className="poll-result">
                <div className="spread small"><span>{o}{mine?.choices.includes(i) && <b> · your vote</b>}</span><span className="num">{counts[i]} · {pct}%</span></div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          <p className="small muted">{total} vote{total === 1 ? '' : 's'}{owner || can.isLeadership ? '' : '. Votes are visible to whoever made the poll.'}</p>
          {(owner || can.isLeadership) && total > 0 && (
            <details className="small"><summary style={{ cursor: 'pointer' }}>Who voted for what</summary>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{votes.map((v) => <li key={v.id}>{v.name ?? userById.get(v.id)?.name ?? 'Member'}: {v.choices.map((c) => p.options[c]).join(', ')}</li>)}</ul>
            </details>
          )}
          {mine && open && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.unvote(p), 'Vote removed. You can vote again.')} style={{ alignSelf: 'flex-start' }}>Change my vote</button>}
        </div>
      ) : (
        <div className="stack-sm">
          {p.options.map((o, i) => (
            <label key={i} className="poll-option">
              <input type={p.multi ? 'checkbox' : 'radio'} name={`poll-${p.id}`} checked={choice.includes(i)} onChange={() => toggle(i)} />{o}
            </label>
          ))}
          {p.multi && <p className="small muted">You can pick more than one.</p>}
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy || choice.length === 0} onClick={() => run(() => api.vote(p, choice), 'Vote saved')}>Vote</button>
        </div>
      )}
      {owner && (
        <div className="row">
          {open && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.closePoll(p), 'Poll closed')}>Close poll</button>}
          <button className="btn btn-sm btn-danger" onClick={() => setDeleting(true)}>Delete</button>
        </div>
      )}
      {deleting && <Confirm title="Delete this poll?" danger confirmLabel="Delete" message="The poll and its results are removed." onClose={() => setDeleting(false)} onConfirm={() => run(() => api.deletePoll(p), 'Deleted')} />}
    </article>
  );
}

function CreatePoll({ onClose }: { onClose: () => void }) {
  const { can, profile } = useMe();
  const { users, departments } = useData();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [audience, setAudience] = useState<Poll['audience']>(can.isLeadership ? 'all' : 'departments');
  const [depts, setDepts] = useState<string[]>(can.isLeadership ? [] : can.dept ? [can.dept] : []);
  const [people, setPeople] = useState<string[]>([]);
  const [closes, setCloses] = useState('');
  const [q, setQ] = useState('');
  const { busy, run } = useAction();
  const opts = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim() && opts.length >= 2 && (audience !== 'departments' || depts.length) && (audience !== 'people' || people.length);
  const pickable = users.filter((u) => u.status === 'active' && u.id !== profile.id && (!q || u.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <Modal title="New poll" wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !valid}
        onClick={async () => {
          let n = 0;
          const ok = await run(async () => {
            n = await api.createPoll({ question, options: opts, multi, audience, departmentIds: audience === 'departments' ? depts : [], uids: audience === 'people' ? people : [], closesAt: closes ? new Date(closes) : null }, users);
          });
          if (ok) { toast(n < 0 ? 'Poll created, but notifications could not be sent' : `Poll created. ${n} people notified.`); onClose(); }
        }}>Create poll</button></>}>
      <Field label="Question"><input className="input" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Where should we hold the December drive?" autoFocus /></Field>
      <Field label="Options">
        <div className="stack-sm">
          {options.map((o, i) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" value={o} maxLength={120} onChange={(e) => setOptions((x) => x.map((y, j) => (j === i ? e.target.value : y)))} placeholder={`Option ${i + 1}`} />
              {options.length > 2 && <button type="button" className="icon-btn" aria-label="Remove option" onClick={() => setOptions((x) => x.filter((_, j) => j !== i))}><IconX /></button>}
            </div>
          ))}
          {options.length < 8 && <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOptions((x) => [...x, ''])}><IconPlus />Add option</button>}
        </div>
      </Field>
      <label className="check"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />People can pick more than one</label>
      {can.isLeadership ? (
        <>
          <Field label="Who votes">
            <div className="segmented">
              {(['all', 'departments', 'people'] as const).map((a) => <button key={a} type="button" className={audience === a ? 'on' : ''} onClick={() => setAudience(a)}>{a === 'all' ? 'Everyone' : a === 'departments' ? 'Departments' : 'Specific people'}</button>)}
            </div>
          </Field>
          {audience === 'departments' && (
            <div className="row">{departments.map((d) => (
              <label key={d.id} className="check" style={{ marginRight: 12 }}><input type="checkbox" checked={depts.includes(d.id)} onChange={() => setDepts((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} />{d.name}</label>
            ))}</div>
          )}
          {audience === 'people' && (
            <div className="stack-sm">
              <input className="input" placeholder="Search names…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="people-pick">{pickable.map((u) => (
                <label key={u.id} className="check"><input type="checkbox" checked={people.includes(u.id)} onChange={() => setPeople((x) => (x.includes(u.id) ? x.filter((y) => y !== u.id) : [...x, u.id]))} />{u.name}</label>
              ))}</div>
              <span className="small muted">{people.length} chosen</span>
            </div>
          )}
        </>
      ) : <p className="small muted">Your department votes on this.</p>}
      <Field label="Closes (optional)"><input className="input" type="datetime-local" min={toLocalInput(new Date())} value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
    </Modal>
  );
}
