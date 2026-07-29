export type AuthOperation =
  'session_restore' | 'sign_in' | 'sign_out' | 'sign_up';

export type AuthOutcome =
  | 'anonymous'
  | 'email_already_registered'
  | 'invalid_credentials'
  | 'invalid_input'
  | 'restored'
  | 'session_unavailable'
  | 'signed_in'
  | 'signed_out'
  | 'signed_up'
  | 'unavailable';

export interface AuthTelemetrySink {
  recordOutcome(labels: {
    readonly operation: AuthOperation;
    readonly outcome: AuthOutcome;
    readonly availability: 'available' | 'unavailable';
  }): void;
  recordLatency(observation: {
    readonly operation: AuthOperation;
    readonly outcome: AuthOutcome;
    readonly durationMs: number;
  }): void;
}

export interface AuthOutcomeObservation {
  readonly operation: AuthOperation;
  readonly outcome: AuthOutcome;
  readonly durationMs: number;
}

const unavailableOutcomes = new Set<AuthOutcome>([
  'session_unavailable',
  'unavailable',
]);

export class AuthOutcomeTelemetry {
  constructor(private readonly sink: AuthTelemetrySink) {}

  record(observation: AuthOutcomeObservation): void {
    const { durationMs, operation, outcome } = observation;

    this.sink.recordOutcome({
      operation,
      outcome,
      availability: unavailableOutcomes.has(outcome)
        ? 'unavailable'
        : 'available',
    });
    this.sink.recordLatency({ operation, outcome, durationMs });
  }
}
