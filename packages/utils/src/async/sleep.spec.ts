import { sleep } from 'async';

describe('sleep', () => {
  it('resolves after approximately specified milliseconds', async () => {
    const start = Date.now();

    await sleep(50);

    const elapsed = Date.now() - start;

    // Allow some tolerance for timer scheduling
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
