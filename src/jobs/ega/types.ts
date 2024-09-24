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

// For YYYY-MM-DD Date strings (i.e. '2021-01-01')
export const DateString = z.string().date();
export type DateString = z.infer<typeof DateString>;

// For ISO8601 Datetime strings (i.e. '2021-01-01T00:00:00.000Z')
export const DateTime = z.string().datetime();
export type DateTime = z.infer<typeof DateTime>;

// Enums
const DAC_STATUS_ENUM = ['accepted', 'pending', 'declined'] as const;
export const DacStatus = z.enum(DAC_STATUS_ENUM);
export type DacStatus = z.infer<typeof DacStatus>;

const DAC_ACCESSION_ID_REGEX = new RegExp(`^EGAC\\d{11}$`);
export const DacAccessionId = z.string().regex(DAC_ACCESSION_ID_REGEX);
export type DacAccessionId = z.infer<typeof DacAccessionId>;

const DATASET_ACCESSION_ID_REGEX = new RegExp(`^EGAD\\d{11}$`);
export const DatasetAccessionId = z.string().regex(DATASET_ACCESSION_ID_REGEX);
export type DatasetAccessionId = z.infer<typeof DatasetAccessionId>;

const USER_ACCESSION_ID_REGEX = new RegExp(`^EGAW\\d{11}$`);
export const UserAccessionId = z.string().regex(USER_ACCESSION_ID_REGEX);
export type UserAccessionId = z.infer<typeof UserAccessionId>;

// EGA Response Types
export const Dac = z.object({
  provisional_id: z.number(),
  accession_id: z.string(),
  title: z.string(),
  description: z.string(),
  status: DacStatus,
  declined_reason: z.string().nullable(),
});
export type Dac = z.infer<typeof Dac>;

export const EgaUser = z.object({
  id: z.number(),
  username: z.string(),
  // several Users are coming back with null email values, is this expected? Assuming that if there is a userid, the User is valid
  email: z.string().nullable(),
  accession_id: UserAccessionId,
});
export type EgaUser = z.infer<typeof EgaUser>;

export const EgaPermissionRequest = z.object({
  request_id: z.number(),
  status: z.string(),
  request_data: z.object({
    comment: z.string(),
  }),
  // TODO: api docs state this should be a DateTime string, but receiving 'YYYY-MM-DD` string. May need to change to coerceable date?
  date: DateString,
  username: z.string(),
  full_name: z.string(),
  email: z.string().email(),
  organisation: z.string(),
  dataset_accession_id: DatasetAccessionId,
  dataset_title: z.string().nullable(),
  dac_accession_id: DacAccessionId,
  dac_comment: z.string().nullable(),
  dac_comment_edited_at: DateTime.nullable(), // TODO: api docs state this should be DateTime string, but need to verify
});
export type EgaPermissionRequest = z.infer<typeof EgaPermissionRequest>;

export const EgaPermission = z.object({
  permission_id: z.number(),
  username: z.string(),
  user_accession_id: UserAccessionId,
  dataset_accession_id: DatasetAccessionId,
});
export type EgaPermission = z.infer<typeof EgaPermission>;

// Axios
export type Success<T> = {
  success: true;
  data: T;
};

// Request Data Types
export type PermissionRequest = {
  username: string;
  dataset_accession_id: DatasetAccessionId;
  request_data: {
    comment: string;
  };
};
