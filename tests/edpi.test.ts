import { describe, expect, it } from 'vitest';
import { computeEdpi, EDPI_SETTINGS, round2, weakestPillar, type EdpiPlan } from '../src/lib/edpi';

const plan: EdpiPlan = {
  plannedVolunteers: 40,
  plannedHours: 4,
  impactTarget: 1000,
  budget: 60000,
  normalCost: EDPI_SETTINGS.NormalCost,
  hasPartner: 1,
};

describe('EDPI — worked example from the framework document (Table 5)', () => {
  // 50 volunteers giving 150 hours in total = 3 h each.
  const out = computeEdpi(plan, { spent: 50000, peopleHelped: 800, hoursEach: Array(50).fill(3), impactDone: 900 });
  const s = out.score!;

  it('scores every step exactly as the document', () => {
    expect(out.rejections).toEqual([]);
    expect(s.avgHours).toBe(3);
    expect(round2(s.costPerPerson)).toBe(62.5);
    expect(round2(s.budgetUsed)).toBe(0.83);
    expect(round2(s.costScore)).toBe(85.47);
    expect(s.budgetScore).toBe(100);
    expect(s.turnoutScore).toBe(125);
    expect(s.timeScore).toBe(100);
    expect(round2(s.moneyScore)).toBe(92.45);
    expect(round2(s.volunteerScore)).toBe(111.11);
    expect(s.impactScore).toBe(90);
    expect(s.partnerBonus).toBe(10);
    expect(round2(s.edpi)).toBe(105.89);
  });

  it('identifies impact as the weakest pillar', () => {
    expect(weakestPillar(s).key).toBe('impact');
  });
});

describe('EDPI — limits and data rules (Table 6)', () => {
  const base = { spent: 10000, peopleHelped: 400, hoursEach: Array(40).fill(4), impactDone: 1000 };

  it('a drive that does exactly what it planned scores 100 (+partner bonus)', () => {
    const s = computeEdpi({ ...plan, hasPartner: 0, budget: 10000 }, base).score!;
    expect(round2(s.edpi)).toBe(100);
    const withPartner = computeEdpi({ ...plan, budget: 10000 }, base).score!;
    expect(round2(withPartner.edpi)).toBe(110);
  });

  it('caps the maximum at 115', () => {
    const s = computeEdpi(plan, { spent: 0, peopleHelped: 10, hoursEach: Array(1000).fill(1), impactDone: 5000 }).score!;
    expect(s.turnoutScore).toBe(150);
    expect(round2(s.volunteerScore)).toBe(120);
    expect(round2(s.edpi)).toBe(115);
  });

  it('PeopleHelped = 0 gives CostScore 0 and a flag', () => {
    const out = computeEdpi(plan, { ...base, peopleHelped: 0 });
    expect(out.score!.costScore).toBe(0);
    expect(out.score!.moneyScore).toBe(0);
    expect(out.flags.join(' ')).toMatch(/People helped is 0/);
  });

  it('Spent = 0 with people helped gives CostScore 100', () => {
    expect(computeEdpi(plan, { ...base, spent: 0 }).score!.costScore).toBe(100);
  });

  it('Volunteers = 0 zeroes turnout, time and volunteer scores', () => {
    const s = computeEdpi(plan, { ...base, hoursEach: [] }).score!;
    expect([s.turnoutScore, s.timeScore, s.volunteerScore]).toEqual([0, 0, 0]);
  });

  it('rejects when hours entries do not match Volunteers', () => {
    const out = computeEdpi(plan, { ...base, volunteers: 39 });
    expect(out.score).toBeNull();
    expect(out.rejections[0]).toMatch(/not equal to Volunteers/);
  });

  it('flags hours outside 0.5–24', () => {
    const out = computeEdpi(plan, { ...base, hoursEach: [...Array(39).fill(4), 90] });
    expect(out.flags.join(' ')).toMatch(/outside 0.5–24/);
  });

  it('budget score falls 2 points per extra 1% and hits 0 at 150%; flags above 1.5×', () => {
    expect(computeEdpi(plan, { ...base, spent: 66000 }).score!.budgetScore).toBeCloseTo(80);
    const over = computeEdpi(plan, { ...base, spent: 95000 });
    expect(over.score!.budgetScore).toBe(0);
    expect(over.flags.join(' ')).toMatch(/1.5× the budget/);
  });

  it('rejects an invalid plan', () => {
    const out = computeEdpi({ ...plan, budget: 0 }, base);
    expect(out.score).toBeNull();
    expect(out.rejections.join(' ')).toMatch(/Budget must be more than 0/);
  });
});
