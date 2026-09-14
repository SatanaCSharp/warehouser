const defaultMessage = 'The functionality has not been implemented.';

const buildErrorMessage = (message: string, args?: unknown): string => {
  if (!args) {
    return message;
  }

  if (typeof args !== 'object') {
    // oxlint-disable-next-line typescript/no-base-to-string
    return `${message} args: ${String(args)} `;
  }

  return `${message} args: ${JSON.stringify(args)} `;
};

export class NotImplementedError<TArgs> extends Error {
  constructor(message: string = defaultMessage, args?: TArgs) {
    super(buildErrorMessage(message, args));
  }
}
