/**
 * ElevateX Drive Performance Index (EDPI)
 *
 * A direct implementation of the official EDPI framework document
 * (designed and developed by Vivaan Agarwal for ElevateX, 14 Nov 2025).
 * Every fixed setting lives in EDPI_SETTINGS; change it there and nowhere else.
 *
 * This module is pure (no Firebase, no React) so it can be unit-tested and
 * reused by the calculator, the drive scoring panel and the analytics page.
 */

export const EDPI_SETTINGS = {
  NormalCost: 53.42,
  OverspendStart: 1.0,
  OverspendZero: 1.5,
  TurnoutMax: 150,
  WMoney: 0.25,
  WVolunteer: 0.25,
  WImpact: 0.5,
  PartnerBonusMax: 10,
  MinHours: 0.5,
  MaxHours: 24,
} as const;

export interface EdpiPlan {
  plannedVolunteers: number;
  plannedHours: number;
  impactTarget: number;
  budget: number;
  normalCost: number;
  hasPartner: 0 | 1;
}

export interface EdpiResults {
  spent: number;
  peopleHelped: number;
  /** One entry per volunteer, in hours. Volunteers = hoursEach.length. */
  hoursEach: number[];
  impactDone: number;
  /** Optional explicit volunteer count. If given and it differs from hoursEach.length the submission is rejected. */
  volunteers?: number;
}

export interface EdpiBreakdown {
  totalHours: number;
  volunteers: number;
  avgHours: number;
  costPerPerson: number;
  budgetUsed: number;
  costScore: number;
  budgetScore: number;
  turnoutScore: number;
  timeScore: number;
  moneyScore: number;
  volunteerScore: number;
  impactScore: number;
  partnerBonus: number;
  edpi: number;
}

export interface EdpiOutcome {
  /** Reasons the submission must be rejected (Table 6). If non-empty, `score` is null. */
  rejections: string[];
  /** Records that are scored but flagged for review (Table 6). */
  flags: string[];
  score: EdpiBreakdown | null;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function validatePlan(plan: Partial<EdpiPlan>): string[] {
  const errors: string[] = [];
  const positive: [keyof EdpiPlan, string][] = [
    ['plannedVolunteers', 'Planned volunteers'],
    ['plannedHours', 'Planned hours'],
    ['impactTarget', 'Impact target'],
    ['budget', 'Budget'],
    ['normalCost', 'Normal cost'],
  ];
  for (const [key, label] of positive) {
    const v = plan[key];
    if (!isNum(v) || v <= 0) errors.push(`${label} must be more than 0 — the plan is not valid.`);
  }
  if (plan.hasPartner !== 0 && plan.hasPartner !== 1) errors.push('Has partner must be 0 or 1.');
  return errors;
}

export function computeEdpi(plan: EdpiPlan, results: EdpiResults): EdpiOutcome {
  const S = EDPI_SETTINGS;
  const rejections = validatePlan(plan);
  const flags: string[] = [];

  const { spent, peopleHelped, hoursEach, impactDone } = results;
  if (!isNum(spent) || spent < 0) rejections.push('Spent must be 0 or more.');
  if (!isNum(peopleHelped) || peopleHelped < 0 || !Number.isInteger(peopleHelped))
    rejections.push('People helped must be a whole number, 0 or more.');
  if (!isNum(impactDone) || impactDone < 0) rejections.push('Impact done must be 0 or more.');
  if (!Array.isArray(hoursEach) || hoursEach.some((h) => !isNum(h) || h < 0))
    rejections.push('Every hours entry must be a number, 0 or more.');
  if (results.volunteers !== undefined && results.volunteers !== hoursEach.length)
    rejections.push(
      `Number of hours entries (${hoursEach.length}) is not equal to Volunteers (${results.volunteers}).`,
    );

  if (rejections.length) return { rejections, flags, score: null };

  const volunteers = hoursEach.length;
  const outOfRange = hoursEach.filter((h) => h < S.MinHours || h > S.MaxHours);
  if (outOfRange.length)
    flags.push(
      `${outOfRange.length} hours ${outOfRange.length === 1 ? 'entry is' : 'entries are'} outside ${S.MinHours}–${S.MaxHours} h (${outOfRange.join(', ')}). Check the sign-in sheet.`,
    );

  // Step 1: basic figures
  const totalHours = hoursEach.reduce((a, b) => a + b, 0);
  const avgHours = volunteers > 0 ? totalHours / volunteers : 0;
  const costPerPerson = peopleHelped > 0 ? spent / peopleHelped : Infinity;
  const budgetUsed = spent / plan.budget;

  // Step 2: four scores
  let costScore: number;
  if (peopleHelped === 0) {
    costScore = 0;
    flags.push('People helped is 0, so the cost score is 0.');
  } else if (costPerPerson <= plan.normalCost) {
    costScore = 100;
  } else {
    costScore = (100 * plan.normalCost) / costPerPerson;
  }

  let budgetScore: number;
  if (budgetUsed <= S.OverspendStart) budgetScore = 100;
  else if (budgetUsed >= S.OverspendZero) budgetScore = 0;
  else budgetScore = 100 - (100 * (budgetUsed - S.OverspendStart)) / (S.OverspendZero - S.OverspendStart);
  if (spent > 1.5 * plan.budget) flags.push('Spent is more than 1.5× the budget (budget score is already 0).');

  let turnoutScore = 0;
  let timeScore = 0;
  if (volunteers > 0) {
    turnoutScore = Math.min((100 * volunteers) / plan.plannedVolunteers, S.TurnoutMax);
    timeScore = avgHours <= plan.plannedHours ? 100 : (100 * plan.plannedHours) / avgHours;
  }

  // Step 3: pillars and bonus
  const moneyScore = Math.sqrt(costScore * budgetScore);
  const volunteerScore =
    volunteers > 0 && turnoutScore + timeScore > 0
      ? (2 * turnoutScore * timeScore) / (turnoutScore + timeScore)
      : 0;
  const impactScore = impactDone >= plan.impactTarget ? 100 : (100 * impactDone) / plan.impactTarget;
  const partnerBonus = plan.hasPartner === 1 ? S.PartnerBonusMax : 0;

  // Step 4: final index
  const edpi =
    S.WMoney * moneyScore + S.WVolunteer * volunteerScore + S.WImpact * impactScore + partnerBonus;

  return {
    rejections,
    flags,
    score: {
      totalHours,
      volunteers,
      avgHours,
      costPerPerson: Number.isFinite(costPerPerson) ? costPerPerson : 0,
      budgetUsed,
      costScore,
      budgetScore,
      turnoutScore,
      timeScore,
      moneyScore,
      volunteerScore,
      impactScore,
      partnerBonus,
      edpi,
    },
  };
}

/** The pillar furthest below 100 — the area to discuss in the debrief (Section 7). */
export function weakestPillar(s: EdpiBreakdown): { key: 'money' | 'volunteer' | 'impact'; label: string; value: number } {
  const pillars = [
    { key: 'money' as const, label: 'Money', value: s.moneyScore },
    { key: 'volunteer' as const, label: 'Volunteers', value: s.volunteerScore },
    { key: 'impact' as const, label: 'Impact', value: s.impactScore },
  ];
  return pillars.reduce((a, b) => (b.value < a.value ? b : a));
}

export const DEBRIEF_QUESTIONS: Record<'money' | 'volunteer' | 'impact', string> = {
  money: 'Did we spend more per person than usual? Did we go over the fund? What cost more than we expected?',
  volunteer:
    'Did fewer people come than planned? Did a few volunteers carry too many hours? How could we share the work better?',
  impact: 'Was our target realistic? What stopped us from reaching it? What would we change in the plan?',
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
