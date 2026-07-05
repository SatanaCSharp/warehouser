const defaultMessage = 'The functionality has not been implemented.';

const buildErrorMessage = (message: string, args?: unknown): string => {
  if (!args) {
    return message;
  }

  if (typeof args !== 'object') {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return `${message} args: ${String(args)} `;
  }

  if (typeof args === 'object') {
    return `${message} args: ${JSON.stringify(args)} `;
  }

  throw new Error('Should never reach here');
};

export class NotImplementedError<TArgs> extends Error {
  constructor(message: string = defaultMessage, args?: TArgs) {
    super(buildErrorMessage(message, args));
  }
}
