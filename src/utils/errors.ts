export class BadRequest extends Error {
  constructor(public readonly info: any) {
    super(JSON.stringify(info));
  }
}

export class NotFound extends Error {}