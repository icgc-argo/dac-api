export class BadRequest extends Error {
  constructor(public readonly info: any) {
    super(JSON.stringify(info));
  }
}

export class NotFound extends Error {}

export class ConflictError extends Error {
  constructor(
    public readonly code: 'COLLABORATOR_EXISTS' | 'COLLABORATOR_SAME_AS_APPLICANT',
    message: string,
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class Forbidden extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Forbidden';
  }
}

export function throwApplicationClosedError(): () => void {
  throw new Error('Cannot modify an application in CLOSED state.');
}
