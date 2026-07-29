import {
  AuthOutcomeTelemetry,
  type AuthTelemetrySink,
} from 'shared/observability/auth-outcome.telemetry';

describe('AuthOutcomeTelemetry', () => {
  it('records stable terminal outcome and latency labels without personal data', () => {
    const sink: jest.Mocked<AuthTelemetrySink> = {
      recordOutcome: jest.fn(),
      recordLatency: jest.fn(),
    };
    const telemetry = new AuthOutcomeTelemetry(sink);

    telemetry.record({
      operation: 'sign_in',
      outcome: 'invalid_credentials',
      durationMs: 42,
    });

    expect(sink.recordOutcome).toHaveBeenCalledWith({
      operation: 'sign_in',
      outcome: 'invalid_credentials',
      availability: 'available',
    });
    expect(sink.recordLatency).toHaveBeenCalledWith({
      operation: 'sign_in',
      outcome: 'invalid_credentials',
      durationMs: 42,
    });
    expect(JSON.stringify(sink.recordOutcome.mock.calls)).not.toMatch(
      /email|userId|session|password|cookie|hash|digest/u,
    );
  });
});
