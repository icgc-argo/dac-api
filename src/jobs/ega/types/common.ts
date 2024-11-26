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

import { z } from 'zod';

/* ******************* *
   Dates 
 * ******************* */

// For ISO8601 Datetime strings (i.e. '2021-01-01T00:00:00.000Z')
// Note: for safeParse to allow the +00:00, as in '2024-01-31T16:25:13.725724+00:00', would need .datetime({ offset: true })
export const DateTime = z.string().datetime({ offset: true });
export type DateTime = z.infer<typeof DateTime>;

/* ******************* *
   Enums & Literals 
 * ******************* */

const DAC_STATUS_ENUM = ['accepted', 'pending', 'declined'] as const;
export const DacStatus = z.enum(DAC_STATUS_ENUM);
export type DacStatus = z.infer<typeof DacStatus>;

export const IdpTokenType = z.literal('Bearer');
export type IdpTokenType = z.infer<typeof IdpTokenType>;

/* ******************* *
      Regexes 
 * ******************* */

const DAC_ACCESSION_ID_REGEX = new RegExp(`^EGAC\\d{11}$`);
export const DacAccessionId = z.string().regex(DAC_ACCESSION_ID_REGEX);
export type DacAccessionId = z.infer<typeof DacAccessionId>;

const DATASET_ACCESSION_ID_REGEX = new RegExp(`^EGAD\\d{11}$`);
export const DatasetAccessionId = z.string().regex(DATASET_ACCESSION_ID_REGEX);
export type DatasetAccessionId = z.infer<typeof DatasetAccessionId>;

const USER_ACCESSION_ID_REGEX = new RegExp(`^EGAW\\d{11}$`);
export const UserAccessionId = z.string().regex(USER_ACCESSION_ID_REGEX);
export type UserAccessionId = z.infer<typeof UserAccessionId>;

export const EgaUserId = z.number();
export type EgaUserId = z.infer<typeof EgaUserId>;
