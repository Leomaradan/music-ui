import { formatCount, formatDuration, formatRelativeTime, formatTotalDuration } from './format';

it('formats durations', () => {
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(187.4)).toBe('3:07');
  expect(formatDuration(3723)).toBe('1:02:03');
  expect(formatTotalDuration(42)).toBe('42 s');
  expect(formatTotalDuration(45 * 60)).toBe('45 min');
  expect(formatTotalDuration(3 * 3600 + 12 * 60)).toBe('3 h 12 min');
  expect(formatTotalDuration(52 * 3600)).toBe('2 days 4 h');
  expect(formatCount(50000)).toBe('50,000');
});

it('formats relative times', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const ago = (seconds: number) =>
    formatRelativeTime(new Date(now.getTime() - seconds * 1000), now);
  expect(ago(10)).toBe('just now');
  expect(ago(5 * 60)).toBe('5 minutes ago');
  expect(ago(3 * 3600)).toBe('3 hours ago');
  expect(ago(86_400)).toBe('yesterday');
  expect(ago(3 * 86_400)).toBe('3 days ago');
});
