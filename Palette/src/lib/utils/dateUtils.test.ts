import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatTargetDateRange,
  getPrimaryTargetDate,
  isSingleDayRange,
  getDateRangeDuration,
  safeDateFormat,
  safeDateForInput,
} from './dateUtils';

test('isSingleDayRange: detects same-day and incomplete ranges', () => {
  assert.equal(isSingleDayRange('2024-09-01', '2024-09-01'), true);
  assert.equal(isSingleDayRange('2024-09-01', null), true);
  assert.equal(isSingleDayRange('2024-09-01', '2024-09-02'), false);
  // DD/MM/YYYY equivalents should be considered the same day
  assert.equal(isSingleDayRange('1/2/2024', '01/02/2024'), true);
});

test('getDateRangeDuration: counts inclusive days and handles invalid', () => {
  assert.equal(getDateRangeDuration('2024-09-01', '2024-09-01'), 1);
  assert.equal(getDateRangeDuration('2024-09-01', '2024-09-03'), 3);
  // invalid dates fall back to 1
  assert.equal(getDateRangeDuration('invalid', '2024-09-03'), 1);
  assert.equal(getDateRangeDuration(null, null), 1);
});

test('safeDateForInput: supports DD/MM/YYYY parsing', () => {
  // 1/2/2024 (DD/MM/YYYY) -> 2024-02-01
  assert.equal(safeDateForInput('1/2/2024'), '2024-02-01');
});

test('safeDateFormat: returns localized string for valid dates', () => {
  const expected = new Date('2024-12-31').toLocaleDateString();
  assert.equal(safeDateFormat('31/12/2024'), expected);
});

test('formatTargetDateRange: single-day collapses to single date', () => {
  const single = safeDateFormat('31/12/2024');
  assert.equal(formatTargetDateRange('31/12/2024', '31/12/2024'), single);
});

test('formatTargetDateRange: equivalent DD/MM/YYYY strings collapse to single date', () => {
  // 1/2/2024 and 01/02/2024 represent the same date
  const single = safeDateFormat('01/02/2024');
  assert.equal(formatTargetDateRange('1/2/2024', '01/02/2024'), single);
});

test('getPrimaryTargetDate: prefers start date when valid', () => {
  const iso = getPrimaryTargetDate('31/12/2024', null).toISOString().split('T')[0];
  assert.equal(iso, '2024-12-31');
});
