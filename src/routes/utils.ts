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

import { BadRequest } from '../utils/errors';

/**
 * Validates an id string is present and matches the expected `DACO-<number>` format.
 * Will throw a BadRequest error if either condition is not met.
 * Intended for validating the :id path param for a Request
 * @param id string
 * @returns id string
 * @example
 * // returns "DACO-20"
 * validateId("DACO-20")
 *
 * @example
 * // throws BadRequest
 * validateId("BAZ-2")
 *
 * @example
 * // throws BadRequest
 * validateId(undefined)
 */
export function validateId(id: string) {
  if (!id) {
    throw new BadRequest('id is required');
  }
  if (!id.startsWith('DACO-')) {
    throw new BadRequest('Invalid id');
  }
  return id;
}

/**
 * Validates a file type request parameter against allowable types, and converts the string to uppercase if validated
 * Will throw a BadRequest error if provided arg does not match any of the allow list.
 * Intended for validating the "type" parameter on a Request
 * @param type string
 * @returns type string
 *
 * @example
 * // returns 'ETHICS'
 * validateType('ethics')
 *
 * @example
 * // returns 'SIGNED_APP'
 * validateType('SIGNED_APP')
 *
 * @example
 * // throws BadRequest
 * validateType('wrong_pdf')
 */
export function validateType(type: string) {
  if (
    !['ETHICS', 'SIGNED_APP', 'APPROVED_PDF', 'ethics', 'signed_app', 'approved_pdf'].includes(type)
  ) {
    throw new BadRequest(
      'unknown document type, should be one of ETHICS, SIGNED_APP or APPROVED_PDF',
    );
  }
  return type.toUpperCase();
}
