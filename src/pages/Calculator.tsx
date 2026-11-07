import { useState } from 'react';
import { computeEdpi, EDPI_SETTINGS } from '../lib/edpi';
import { fmtRs } from '../lib/format';
import { Field } from '../components/ui';
import { BreakdownTable, parseHoursList, ScoreSummary } from '../components/edpi';

const EXAMPLE = {
  plannedVolunteers: '40', plannedHours: '4', impactTarget: '1000', budget: '60000', hasPartner: '1',
  spent: '50000', peopleHelped: '800', volunteers: '50', hours: Array(50).fill('3').join(', '), impactDone: '900',
};
const BLANK = Object.fromEntries(Object.keys(EXAMPLE).map((k) => [k, k === 'hasPartner' ? '0' : ''])) as typeof EXAMPLE;

/** Stand-alone EDPI calculator (EDPI Volunteer Guide, Section 6). Nothing is saved. */
export function CalculatorPage() {
  const [f, setF] = useState(BLANK);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const hours = parseHoursList(f.hours);
  const ready = f.plannedVolunteers && f.plannedHours && f.impactTarget && f.budget && f.spent !== '' && f.peopleHelped !== '' && f.volunteers !== '' && f.impactDone !== '' && hours;

  const outcome = ready
    ? computeEdpi(
        {
          plannedVolunteers: Number(f.plannedVolunteers),
          plannedHours: Number(f.plannedHours),
          impactTarget: Number(f.impactTarget),
          budget: Number(f.budget),
          normalCost: EDPI_SETTINGS.NormalCost,
          hasPartner: f.hasPartner === '1' ? 1 : 0,
        },
        { spent: Number(f.spent), peopleHelped: Number(f.peopleHelped), impactDone: Number(f.impactDone), hoursEach: hours!, volunteers: Number(f.volunteers) },
      )
    : null;

  const num = (k: keyof typeof f, label: string, hint?: string, step = 'any') => (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min={0} step={step} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>EDPI calculator</h1>
          <p>ElevateX Drive Performance Index — type in your planning sheet and results sheet. Nothing here is saved.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setF(EXAMPLE)}>Load worked example</button>
          <button className="btn btn-ghost" onClick={() => setF(BLANK)}>Clear</button>
        </div>
      </div>
      <div className="callout info" style={{ marginBottom: 18 }}>
        For drives organised on the Hub, use the <b>EDPI score</b> tab on the drive's page instead — it locks the plan and pulls verified volunteer hours automatically.
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <section className="card card-pad stack">
            <h2>Planning sheet <span className="muted small">(before the drive)</span></h2>
            <div className="form-grid">
              {num('plannedVolunteers', 'Planned volunteers', undefined, '1')}
              {num('plannedHours', 'Planned hours (each)')}
              {num('impactTarget', 'Impact target', 'Meals, kg, books, trees…')}
              {num('budget', 'Budget (Rs.)')}
              <Field label="Normal cost"><input className="input" value={fmtRs(EDPI_SETTINGS.NormalCost)} disabled /></Field>
              <Field label="Outside partner?">
                <select className="select" value={f.hasPartner} onChange={(e) => set('hasPartner', e.target.value)}>
                  <option value="0">No (0)</option><option value="1">Yes (1)</option>
                </select>
              </Field>
            </div>
          </section>
          <section className="card card-pad stack">
            <h2>Results sheet <span className="muted small">(after the drive)</span></h2>
            <div className="form-grid">
              {num('spent', 'Spent (Rs.)')}
              {num('peopleHelped', 'People helped', 'Count each person once', '1')}
              {num('volunteers', 'Volunteers', 'Who actually took part', '1')}
              {num('impactDone', 'Impact done', 'Same unit as the target')}
              <Field label="Hours each" className="full" hint={`One entry per volunteer, separated by commas. ${hours ? `${hours.length} entries` : 'Only numbers, please.'}`}>
                <textarea className="textarea" value={f.hours} onChange={(e) => set('hours', e.target.value)} placeholder="3, 2.5, 4, 3.5" />
              </Field>
            </div>
          </section>
        </div>

        <section className="card card-pad stack" style={{ position: 'sticky', top: 16 }}>
          <h2>Your score</h2>
          {!outcome && <p className="muted small">Fill in every field to see the score. Run through the checks in the volunteer guide first — most wrong scores come from typing mistakes.</p>}
          {outcome && outcome.rejections.length > 0 && (
            <div className="callout bad"><b>Submission rejected</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{outcome.rejections.map((r) => <li key={r}>{r}</li>)}</ul></div>
          )}
          {outcome?.score && (
            <>
              <ScoreSummary s={outcome.score} flags={outcome.flags} />
              <BreakdownTable s={outcome.score} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
