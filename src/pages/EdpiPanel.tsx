import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import type { Activity, EdpiRecord, Participation } from '../lib/types';
import { computeEdpi, EDPI_SETTINGS, validatePlan } from '../lib/edpi';
import { fmtDateTime, fmtHours, fmtNum, fmtRs } from '../lib/format';
import { Confirm, Field, useAction } from '../components/ui';
import { BreakdownTable, parseHoursList, ScoreSummary } from '../components/edpi';
import { IconLock } from '../components/icons';

/** EDPI for one drive: plan → lock → results → score (EDPI framework, Section 2). */
export function EdpiPanel({ a, parts, record, canManage }: { a: Activity; parts: Participation[]; record?: EdpiRecord; canManage: boolean }) {
  const started = a.startAt.getTime() <= Date.now();
  if (!canManage && !record?.locked)
    return <div className="callout info">The organiser hasn't locked an EDPI plan for this drive yet, so results can't be entered.</div>;
  const volunteerCanEnter = !canManage && a.status === 'completed';

  return (
    <div className="stack">
      <Steps record={record} />
      {!record?.locked ? (
        <PlanForm a={a} record={record} started={started} />
      ) : (
        <>
          <LockedPlan record={record} />
          {canManage || volunteerCanEnter ? (
            <ResultsForm a={a} record={record} parts={parts} />
          ) : (
            <>
              <div className="callout info">You attended this drive, so you can help enter its results once the organiser marks it <b>completed</b>.</div>
              {record.score && <section className="card card-pad"><ScoreSummary s={record.score} flags={record.flags ?? []} /></section>}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Steps({ record }: { record?: EdpiRecord }) {
  const step = !record ? 1 : !record.locked ? 2 : !record.score ? 3 : 5;
  const labels = ['Plan', 'Lock', 'Record', 'Enter', 'Score'];
  return (
    <div className="segmented" aria-label="EDPI progress" style={{ alignSelf: 'flex-start' }}>
      {labels.map((l, i) => (
        <button key={l} className={i + 1 === step ? 'on' : ''} tabIndex={-1} style={{ cursor: 'default', opacity: i + 1 <= step ? 1 : 0.5 }}>
          {i + 1 < step ? '✓ ' : `${i + 1}. `}{l}
        </button>
      ))}
    </div>
  );
}

function PlanForm({ a, record, started }: { a: Activity; record?: EdpiRecord; started: boolean }) {
  const p = record?.plan;
  const [f, setF] = useState({
    plannedVolunteers: p?.plannedVolunteers?.toString() ?? '',
    plannedHours: p?.plannedHours?.toString() ?? '',
    impactTarget: p?.impactTarget?.toString() ?? '',
    impactUnit: p?.impactUnit ?? '',
    budget: p?.budget?.toString() ?? '',
    hasPartner: p?.hasPartner ?? 0,
  });
  const [confirmLock, setConfirmLock] = useState(false);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));

  const plan = {
    plannedVolunteers: Number(f.plannedVolunteers),
    plannedHours: Number(f.plannedHours),
    impactTarget: Number(f.impactTarget),
    impactUnit: f.impactUnit.trim(),
    budget: Number(f.budget),
    normalCost: EDPI_SETTINGS.NormalCost,
    hasPartner: f.hasPartner as 0 | 1,
  };
  const errors = [...validatePlan(plan), ...(plan.impactUnit ? [] : ['Pick one countable impact unit (meals, kg, books, trees…).'])];
  const keys = ['plannedVolunteers', 'plannedHours', 'impactTarget', 'impactUnit', 'budget', 'hasPartner'] as const;
  const dirty = !record || keys.some((k) => record.plan[k] !== plan[k]);

  if (started && !record)
    return (
      <div className="callout warn">
        <b>The drive has already started</b> ({fmtDateTime(a.startAt)}), so a plan can no longer be created — EDPI only accepts plans written down and locked before the drive.
        You can still work out a score by hand in the <Link to="/edpi">EDPI calculator</Link>.
      </div>
    );

  return (
    <section className="card">
      <div className="card-head">
        <div><h2>1. Planning sheet</h2><p>Fill these in before the drive. They are the targets the drive is judged against — be honest and realistic.</p></div>
        {record && <span className="badge warn">Draft — not locked</span>}
      </div>
      <div className="card-body stack">
        {started ? (
          <div className="callout warn">The drive has started, so the plan can't be edited any more. Lock it to start recording results.</div>
        ) : null}
        <div className="form-grid">
          <Field label="Planned volunteers" hint="How many volunteers you expect to take part">
            <input className="input" type="number" min={1} disabled={started} value={f.plannedVolunteers} onChange={(e) => set('plannedVolunteers', e.target.value)} />
          </Field>
          <Field label="Planned hours (each)" hint="Average hours you expect from each volunteer">
            <input className="input" type="number" min={0.5} step={0.5} disabled={started} value={f.plannedHours} onChange={(e) => set('plannedHours', e.target.value)} />
          </Field>
          <Field label="Impact target" hint="One countable number">
            <input className="input" type="number" min={1} disabled={started} value={f.impactTarget} onChange={(e) => set('impactTarget', e.target.value)} />
          </Field>
          <Field label="Impact unit" hint="“500 meals served” works. “Help the community” can't be counted.">
            <input className="input" disabled={started} value={f.impactUnit} onChange={(e) => set('impactUnit', e.target.value)} placeholder="meals, kg, books, trees…" />
          </Field>
          <Field label="Budget (Rs.)" hint="The real amount set aside for this drive, not the month's fund">
            <input className="input" type="number" min={1} disabled={started} value={f.budget} onChange={(e) => set('budget', e.target.value)} />
          </Field>
          <Field label="Outside partner?" hint="At least one outside partner organisation">
            <select className="select" disabled={started} value={f.hasPartner} onChange={(e) => set('hasPartner', Number(e.target.value))}>
              <option value={0}>No</option>
              <option value={1}>Yes</option>
            </select>
          </Field>
        </div>
        <p className="small muted">Normal cost per beneficiary is fixed at {fmtRs(EDPI_SETTINGS.NormalCost)} by ElevateX.</p>
        {!started && errors.length > 0 && (f.plannedVolunteers || f.budget) ? <div className="callout warn">{errors[0]}</div> : null}
        <div className="row">
          {!started && (
            <button className="btn btn-primary" disabled={busy || errors.length > 0 || !dirty} onClick={() => run(() => api.saveEdpiPlan(a.id, plan, !!record), 'Plan saved as draft')}>
              {record ? 'Save changes' : 'Save plan'}
            </button>
          )}
          {record && (
            <button className="btn" disabled={busy || dirty} onClick={() => setConfirmLock(true)} title={dirty ? 'Save your changes first' : ''}>
              <IconLock />Lock plan
            </button>
          )}
        </div>
      </div>
      {confirmLock && (
        <Confirm title="Lock the plan?" confirmLabel="Lock plan"
          message="Once locked, nobody can change these planning values — not even the Admin. A plan edited after the fact makes the score meaningless. Results can only be entered against a locked plan."
          onClose={() => setConfirmLock(false)} onConfirm={() => run(() => api.lockEdpiPlan(a.id), 'Plan locked')} />
      )}
    </section>
  );
}

function LockedPlan({ record }: { record: EdpiRecord }) {
  const p = record.plan;
  return (
    <section className="card">
      <div className="card-head">
        <div><h2>Plan</h2><p>Locked{record.lockedAt ? ` on ${fmtDateTime(record.lockedAt)}` : ''}. These values can't change.</p></div>
        <span className="badge brand"><IconLock width={12} /> Locked</span>
      </div>
      <div className="card-body">
        <dl className="detail-list">
          <dt>Volunteers</dt><dd>{p.plannedVolunteers} × {fmtHours(p.plannedHours)} each</dd>
          <dt>Impact target</dt><dd>{fmtNum(p.impactTarget)} {p.impactUnit}</dd>
          <dt>Budget</dt><dd>{fmtRs(p.budget)}</dd>
          <dt>Normal cost</dt><dd>{fmtRs(p.normalCost)} per beneficiary</dd>
          <dt>Partner</dt><dd>{p.hasPartner ? 'Yes' : 'No'}</dd>
        </dl>
      </div>
    </section>
  );
}

function ResultsForm({ a, record, parts }: { a: Activity; record: EdpiRecord; parts: Participation[] }) {
  const r = record.results;
  const [f, setF] = useState({
    spent: r?.spent?.toString() ?? '',
    peopleHelped: r?.peopleHelped?.toString() ?? '',
    impactDone: r?.impactDone?.toString() ?? '',
    extra: r?.extraHours?.join(', ') ?? '',
  });
  const { busy, run } = useAction();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const verified = parts.filter((p) => p.hoursStatus === 'verified').map((p) => p.verifiedHours ?? 0);
  const unverified = parts.filter((p) => p.attendance === 'present' && p.hoursStatus !== 'verified').length;
  const extraHours = parseHoursList(f.extra);
  const filled = f.spent !== '' && f.peopleHelped !== '' && f.impactDone !== '';

  const preview = useMemo(() => {
    if (!filled || !extraHours) return null;
    return computeEdpi(record.plan, {
      spent: Number(f.spent),
      peopleHelped: Number(f.peopleHelped),
      impactDone: Number(f.impactDone),
      hoursEach: [...verified, ...extraHours],
    });
  }, [filled, f, extraHours?.join(','), verified.join(','), record.plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const started = a.startAt.getTime() <= Date.now();

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div><h2>4. Results sheet</h2><p>Fill this in after the drive, from receipts, the sign-in sheet and your counts.</p></div>
          {record.score && <span className="badge ok">Scored</span>}
        </div>
        <div className="card-body stack">
          {!started && <div className="callout info">The drive hasn't happened yet. Come back afterwards to enter results.</div>}
          <div className="form-grid">
            <Field label="Spent (Rs.)" hint="Total of every receipt">
              <input className="input" type="number" min={0} value={f.spent} onChange={(e) => set('spent', e.target.value)} />
            </Field>
            <Field label="People helped" hint="Count each person once">
              <input className="input" type="number" min={0} step={1} value={f.peopleHelped} onChange={(e) => set('peopleHelped', e.target.value)} />
            </Field>
            <Field label={`Impact done (${record.plan.impactUnit})`} hint="Same unit as the target">
              <input className="input" type="number" min={0} value={f.impactDone} onChange={(e) => set('impactDone', e.target.value)} />
            </Field>
            <Field label="Extra volunteers' hours (optional)" hint="People not on the Hub, from the sign-in sheet — one number per volunteer, e.g. 3, 2.5, 4">
              <input className="input" value={f.extra} onChange={(e) => set('extra', e.target.value)} />
            </Field>
          </div>
          <div className="callout">
            <b>Volunteer hours come from the Hub.</b> {verified.length} verified volunteer{verified.length === 1 ? '' : 's'} ({fmtHours(verified.reduce((s, h) => s + h, 0))})
            {extraHours && extraHours.length > 0 ? ` + ${extraHours.length} extra from the sign-in sheet` : ''} = <b>{verified.length + (extraHours?.length ?? 0)} volunteers</b>.
            {unverified > 0 && <> <span style={{ color: 'var(--warn)' }}>{unverified} present volunteer{unverified === 1 ? ' has' : 's have'} unverified hours — verify them in “Attendance & hours” first or they won't count.</span></>}
          </div>
          {!extraHours && <div className="callout bad">Extra hours must be numbers separated by commas.</div>}
          {preview?.rejections.length ? <div className="callout bad">{preview.rejections.join(' ')}</div> : null}
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={busy || !filled || !extraHours || !preview?.score}
              onClick={() => run(() => api.saveEdpiResults(record, { spent: Number(f.spent), peopleHelped: Number(f.peopleHelped), impactDone: Number(f.impactDone), extraHours: extraHours ?? [] }, verified), 'EDPI score saved')}
            >
              {record.score ? 'Re-score & save' : 'Save & score'}
            </button>
            {preview?.score && (!record.score || Math.abs(preview.score.edpi - record.score.edpi) > 0.005) && (
              <span className="small muted">Preview: <b>{preview.score.edpi.toFixed(2)}</b> {record.score ? '(not saved yet)' : ''}</span>
            )}
          </div>
        </div>
      </section>

      {record.score && (
        <section className="card">
          <div className="card-head"><div><h2>5. Score</h2><p>Saved {record.scoredAt ? fmtDateTime(record.scoredAt) : ''} — a starting point for the debrief, not a grade.</p></div></div>
          <div className="card-body stack">
            <ScoreSummary s={record.score} flags={record.flags ?? []} />
            <details>
              <summary className="small" style={{ cursor: 'pointer', fontWeight: 500 }}>Show full working</summary>
              <div style={{ marginTop: 12 }}><BreakdownTable s={record.score} /></div>
            </details>
          </div>
        </section>
      )}
    </>
  );
}
