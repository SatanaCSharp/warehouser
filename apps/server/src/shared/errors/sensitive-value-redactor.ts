const redacted = '[REDACTED]';
const sensitiveKeyPattern =
  /authorization|cookie|credential|password|secret|token|hash|digest/iu;
const emailPattern =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/giu;
const embeddedSecretPattern =
  /\b(?<label>password(?:Hash)?|sessionDigest|cookie|authorization|token|secret)(?:(?:\s*[:=]\s*)|\s+)(?<value>[^\s,;]+)/giu;

const redactString = (value: string): string =>
  value
    .replace(emailPattern, '[REDACTED_EMAIL]')
    .replace(embeddedSecretPattern, '$<label> [REDACTED]');

export const redactSensitiveValues = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveValues);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      sensitiveKeyPattern.test(key)
        ? redacted
        : redactSensitiveValues(nestedValue),
    ]),
  );
};
