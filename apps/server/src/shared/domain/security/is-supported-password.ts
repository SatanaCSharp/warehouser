export const isSupportedPassword = (password: string): boolean => {
  const length = Array.from(password).length;
  return length >= 8 && length <= 128;
};
