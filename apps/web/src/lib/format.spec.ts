import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('keeps small files in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('switches units and keeps one decimal while it helps', () => {
    expect(formatBytes(1024)).toBe('1.0 kB');
    expect(formatBytes(88 * 1024)).toBe('88 kB');
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1.3 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('stops at gigabytes', () => {
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });
});
