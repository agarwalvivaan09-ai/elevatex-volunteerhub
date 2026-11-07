import { DEBRIEF_QUESTIONS, EDPI_SETTINGS as S, round2, weakestPillar, type EdpiBreakdown } from '../lib/edpi';
import { fmtNum, fmtRs } from '../lib/format';

const f2 = (n: number) => fmtNum(round2(n), 2);

export function PillarCards({ s }: { s: EdpiBreakdown }) {
  const pillars = [
    { label: 'Money', weight: S.WMoney, v: s.moneyScore, max: 100 },
    { label: 'Volunteers', weight: S.WVolunteer, v: s.volunteerScore, max: 120 },
    { label: 'Impact', weight: S.WImpact, v: s.impactScore, max: 100 },
  ];
  return (
    <div className="pillars">
      {pillars.map((p) => (
        <div className="pillar" key={p.label}>
          <div className="small muted">{p.label} · {p.weight * 100}%</div>
          <div className="v">{f2(p.v)}</div>
          <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (p.v / p.max) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function ScoreSummary({ s, flags }: { s: EdpiBreakdown; flags: string[] }) {
  const weak = weakestPillar(s);
  const verdict = s.edpi >= 100 ? 'Beat or met the plan' : 'Something fell short of the plan';
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
        <div>
          <div className="small muted">EDPI</div>
          <div className="score-big">{f2(s.edpi)}</div>
        </div>
        <div className="small muted" style={{ paddingBottom: 4 }}>
          {verdict}. 100 = did exactly what was planned · max 115
          {s.partnerBonus > 0 && <> · includes +{s.partnerBonus} partner bonus</>}
        </div>
      </div>
      <PillarCards s={s} />
      {flags.length > 0 && (
        <div className="callout warn"><b>Flagged for review</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{flags.map((f) => <li key={f}>{f}</li>)}</ul></div>
      )}
      {weak.value < 100 && (
        <div className="callout info"><b>Debrief focus — {weak.label} ({f2(weak.value)}):</b> {DEBRIEF_QUESTIONS[weak.key]}</div>
      )}
    </div>
  );
}

export function BreakdownTable({ s }: { s: EdpiBreakdown }) {
  const rows: [string, string, string][] = [
    ['TotalHours', 'Sum of every HoursEach entry', `${f2(s.totalHours)} h`],
    ['Volunteers', 'Number of HoursEach entries', String(s.volunteers)],
    ['AvgHours', 'TotalHours ÷ Volunteers', `${f2(s.avgHours)} h`],
    ['CostPerPerson', 'Spent ÷ PeopleHelped', fmtRs(round2(s.costPerPerson))],
    ['BudgetUsed', 'Spent ÷ Budget', fmtNum(s.budgetUsed, 3)],
    ['CostScore', `100 if ≤ NormalCost, else 100 × NormalCost ÷ CostPerPerson`, f2(s.costScore)],
    ['BudgetScore', `100 up to ${S.OverspendStart * 100}% of fund, 0 at ${S.OverspendZero * 100}%`, f2(s.budgetScore)],
    ['TurnoutScore', `100 × Volunteers ÷ PlannedVolunteers (max ${S.TurnoutMax})`, f2(s.turnoutScore)],
    ['TimeScore', '100 if ≤ PlannedHours, else 100 × PlannedHours ÷ AvgHours', f2(s.timeScore)],
    ['MoneyScore', '√(CostScore × BudgetScore)', f2(s.moneyScore)],
    ['VolunteerScore', '2 × Turnout × Time ÷ (Turnout + Time)', f2(s.volunteerScore)],
    ['ImpactScore', '100 × ImpactDone ÷ ImpactTarget (max 100)', f2(s.impactScore)],
    ['PartnerBonus', `${S.PartnerBonusMax} if HasPartner = 1`, f2(s.partnerBonus)],
  ];
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Work out</th><th>How</th><th className="num">Answer</th></tr></thead>
        <tbody>
          {rows.map(([k, how, v]) => (
            <tr key={k}><td className="small"><code>{k}</code></td><td className="small muted">{how}</td><td className="num">{v}</td></tr>
          ))}
          <tr>
            <td><b>EDPI</b></td>
            <td className="small muted">{S.WMoney} × Money + {S.WVolunteer} × Volunteer + {S.WImpact} × Impact + Bonus</td>
            <td className="num"><b>{f2(s.edpi)}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Parses "3, 4.5 2\n1.5" into numbers; returns null if anything is not a number. */
export function parseHoursList(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const nums = parts.map(Number);
  return nums.some((n) => !Number.isFinite(n)) ? null : nums;
}
