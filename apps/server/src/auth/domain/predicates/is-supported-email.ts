const emailPattern =
  /^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export const isSupportedEmail = (email: string): boolean => {
  const normalized = normalizeEmail(email);
  const isAscii = Array.from(normalized).every(
    (character) => character.codePointAt(0)! <= 127,
  );
  return isAscii && normalized.length <= 254 && emailPattern.test(normalized);
};
