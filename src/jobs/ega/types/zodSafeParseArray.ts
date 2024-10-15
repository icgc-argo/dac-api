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
