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

import { z, ZodError, ZodTypeAny } from 'zod';

/* ******************* *
   Success and Failure types
 * ******************* */

export type Success<T> = { status: 'SUCCESS'; data: T };
export type Failure<FailureStatus extends string, T = void> = {
  status: FailureStatus;
  message: string;
  data: T;
};

/**
 * Represents a response that on success will include data of type T,
 * otherwise a message will be returned in place of the data explaining the failure with optional fallback data.
 * The failure object has data type of void by default.
 */
export type Result<T, FailureStatus extends string, FailureData = void> =
  | Success<T>
  | Failure<FailureStatus, FailureData>;
/**
 * Determines if the Result is a Success type by its status
 * and returns the type predicate so TS can infer the Result as a Success
 * @param result
 * @returns {boolean} Whether the Result was a Success or not
 */

/* ******************* *
   Convenience methods
 * ******************* */

export function isSuccess<T, FailureStatus extends string, FailureData>(
  result: Result<T, FailureStatus, FailureData>,
): result is Success<T> {
  return result.status === 'SUCCESS';
}

/**
 * Create a successful response for a Result or Either type, with data of the success type
 * @param {T} data
 * @returns {Success<T>} `{status: 'SUCCESS', data}`
 */
export const success = <T>(data: T): Success<T> => ({ status: 'SUCCESS', data });

/**
 * Create a response indicating a failure with a status naming the reason and message describing the failure.
 * @param {string} message
 * @returns {Failure} `{status: string, message: string, data: undefined}`
 */
export const failure = <FailureStatus extends string>(
  status: FailureStatus,
  message: string,
): Failure<FailureStatus, void> => ({
  status,
  message,
  data: undefined,
});

export type ZodResultAccumulator<T> = { success: T[]; failure: ZodError[] };
/**
 * Parses an array of Zod SafeParseReturnType results into success (successful parse) and failure (parsing error)
 * @param acc ZodResultAccumulator<T>
 * @param item z.SafeParseReturnType<T, T>
 * @returns ZodResultAccumulator<T>
 */
const resultReducer = <T>(acc: ZodResultAccumulator<T>, item: z.SafeParseReturnType<T, T>) => {
  if (item.success) {
    acc.success.push(item.data);
  } else {
    acc.failure.push(item.error);
  }
  return acc;
};

/**
 * Run Zod safeParse for Schema T on an array of items, and split results by SafeParseReturnType 'success' or 'error'.
 * @params schema<T>
 * @params data unknown[]
 * @returns { success: [], failure: [] }
 */
export const safeParseArray = <T extends ZodTypeAny>(
  schema: T,
  data: Array<unknown>,
): ZodResultAccumulator<z.infer<T>> =>
  data
    .map((i) => schema.safeParse(i))
    .reduce<ZodResultAccumulator<z.infer<T>>>((acc, item) => resultReducer(acc, item), {
      success: [],
      failure: [],
    });

/* ******************* *
   Failure types
 * ******************* */

export type ServerError = 'SERVER_ERROR';
export type GetDatasetsForDacFailure = ServerError;
export type GetPermissionsForDatasetFailure = ServerError;
export type GetPermissionsByDatasetAndUserIdFailure = ServerError;
export type CreatePermissionRequestsFailure = ServerError;
export type ApprovedPermissionRequestsFailure =
  | ServerError
  | 'INVALID_APPROVE_PERMISSION_REQUESTS_RESPONSE';
export type RevokePermissionsFailure = ServerError | 'INVALID_REVOKE_PERMISSIONS_RESPONSE';
export type GetUserFailure = ServerError | 'NOT_FOUND' | 'INVALID_USER';
