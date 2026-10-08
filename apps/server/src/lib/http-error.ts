/** An error that is sent to the client as { error: { code, message } } with this status. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const unauthorized = () =>
  new HttpError(401, 'unauthorized', 'Sign in again: the token is missing or not valid.');
