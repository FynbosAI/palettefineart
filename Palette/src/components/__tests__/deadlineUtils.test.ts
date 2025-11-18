import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let addBusinessDays: (start: Date, businessDays: number) => Date;
let computeDefaultDeadline: (base?: Date) => Date;
let DEFAULT_DEADLINE_HOUR: number;
let formatDeadlineLabel: (deadline?: string | null, autoClose?: boolean) => string;
let isDeadlinePast: (deadline: string | null, autoClose: boolean) => boolean;

before(async () => {
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
  process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
  process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3000';
  const originModule = await import('../OriginDestination');
  const logisticsModule = await import('../pages/LogisticsPage');
  addBusinessDays = originModule.addBusinessDays;
  computeDefaultDeadline = originModule.computeDefaultDeadline;
  DEFAULT_DEADLINE_HOUR = originModule.DEFAULT_DEADLINE_HOUR;
  formatDeadlineLabel = logisticsModule.formatDeadlineLabel;
  isDeadlinePast = logisticsModule.isDeadlinePast;
});

describe('deadline helpers', () => {
  it('adds business days while skipping weekends', () => {
    const fridayNoonUtc = new Date('2025-09-26T12:00:00Z');
    const result = addBusinessDays(fridayNoonUtc, 1);
    assert.equal(result.toISOString().slice(0, 10), '2025-09-29');
  });

  it('computes default deadline three business days ahead at configured hour', () => {
    const base = new Date('2025-09-24T08:30:00Z');
    const deadline = computeDefaultDeadline(base);

    assert.equal(deadline.getHours(), DEFAULT_DEADLINE_HOUR);
    assert.equal(deadline.getDay(), 1); // Monday
  });

  it('formats deadlines with fallback messaging', () => {
    assert.equal(formatDeadlineLabel(null, true), 'Deadline not set');
    assert.equal(formatDeadlineLabel('invalid-date', true), 'Invalid date');
    assert.equal(formatDeadlineLabel(null, false), 'Manual close');

    const sampleDeadline = '2025-09-30T17:00:00Z';
    const formatted = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(sampleDeadline));
    assert.equal(formatDeadlineLabel(sampleDeadline, true), formatted);
  });

  it('detects when deadlines have already passed', () => {
    assert.equal(isDeadlinePast('2000-01-01T00:00:00Z', true), true);
    assert.equal(isDeadlinePast('2999-01-01T00:00:00Z', true), false);
    assert.equal(isDeadlinePast(null, true), false);
    assert.equal(isDeadlinePast('2000-01-01T00:00:00Z', false), false);
  });
});
