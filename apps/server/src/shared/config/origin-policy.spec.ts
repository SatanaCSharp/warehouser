import { ForbiddenException } from '@nestjs/common';
import { OriginPolicy } from 'shared/config/origin-policy';
import { describe, expect, it, vi } from 'vitest';

describe('OriginPolicy', () => {
  const policy = new OriginPolicy(['https://app.example.test']);

  it('allows credentialed CORS only for a configured application origin', () => {
    const callback = vi.fn();

    policy.verifyCorsOrigin('https://app.example.test', callback);
    policy.verifyCorsOrigin('https://attacker.example.test', callback);

    expect(callback).toHaveBeenNthCalledWith(1, null, true);
    expect(callback.mock.calls[1]?.[0]).toBeInstanceOf(Error);
  });

  it('rejects an unconfigured origin for a state-changing request', () => {
    expect(() =>
      policy.assertStateChangingOrigin('POST', 'https://attacker.example.test'),
    ).toThrow(ForbiddenException);
    expect(() => policy.assertStateChangingOrigin('DELETE', undefined)).toThrow(
      ForbiddenException,
    );
  });

  it('does not require an Origin header for safe requests', () => {
    expect(() =>
      policy.assertStateChangingOrigin('GET', undefined),
    ).not.toThrow();
  });
});
