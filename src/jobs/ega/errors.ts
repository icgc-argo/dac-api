import { AxiosError } from 'axios';

export class NotFoundError extends AxiosError {
  constructor(message: string) {
    super(message);
    this.name = 'Not Found';
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}
