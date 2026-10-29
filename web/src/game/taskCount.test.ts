import { describe, expect, it } from 'vitest';
import { shownTaskCount, TASK_COUNT, taskCountOptions } from './taskCount';

describe('task count', () => {
  it('offers 4 to 8 with 6 by default', () => {
    expect(taskCountOptions()).toEqual([4, 5, 6, 7, 8]);
    expect(TASK_COUNT.DEFAULT).toBe(6);
    expect(taskCountOptions()).toContain(TASK_COUNT.DEFAULT);
  });

  it('shows the snapshot value, or the default without one', () => {
    expect(shownTaskCount(4)).toBe(4);
    expect(shownTaskCount(8)).toBe(8);
    expect(shownTaskCount(0)).toBe(6);
    expect(shownTaskCount(undefined)).toBe(6);
  });
});
