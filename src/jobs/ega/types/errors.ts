/*
 * Copyright (c) 2024 The Ontario Institute for Cancer Research. All rights reserved
 *
 * This program and the accompanying materials are made available under the terms of
 * the GNU Affero General Public License v3.0. You should have received a copy of the
 * GNU Affero General Public License along with this program.
 *  If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { AxiosError } from 'axios';

/**
 * Custom errors for Axios responses.
 * Defines expected status and code values for error handling.
 */

export class NotFoundError extends AxiosError {
  constructor(message: string) {
    super(message);
    this.name = 'Not Found';
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

export class TooManyRequestsError extends AxiosError {
  constructor(message: string) {
    super(message);
    this.name = 'Too Many Requests';
    this.status = 429;
    this.code = 'TOO_MANY_REQUESTS';
  }
}

export class BadRequestError extends AxiosError {
  constructor(message: string) {
    super(message);
    this.name = 'Bad Request';
    this.status = 400;
    this.code = 'BAD_REQUEST';
  }
}

export class ServerError extends AxiosError {
  constructor(message: string) {
    super(message);
    this.name = 'Server Error';
    this.status = 500;
    this.code = 'SERVER_ERROR';
  }
}
