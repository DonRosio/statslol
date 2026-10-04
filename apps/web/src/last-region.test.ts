import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadLastRegion, saveLastRegion } from './last-region.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('last region', () => {
  it('is unknown before any search', () => {
    expect(loadLastRegion()).toBeUndefined();
  });

  it('remembers the region that was saved', () => {
    saveLastRegion('kr');

    expect(loadLastRegion()).toBe('kr');
  });

  it('ignores a stored value that is not a region', () => {
    localStorage.setItem('statslol.lastRegion', 'atlantis');

    expect(loadLastRegion()).toBeUndefined();
  });

  it('works without storage, as in a window that refuses site data', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() => {
      saveLastRegion('kr');
    }).not.toThrow();
    expect(loadLastRegion()).toBeUndefined();
  });
});
