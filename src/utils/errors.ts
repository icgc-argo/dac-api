export class BadRequest extends Error {
  constructor(public readonly info: any) {
    super(JSON.stringify(info));
  }
}

export class NotFound extends Error {}

export class ConflictError extends Error {
  constructor(public readonly code: 'COLLABORATOR_EXISTS' | 'COLLABORATOR_SAME_AS_APPLICANT',
              message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}