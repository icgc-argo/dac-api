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
import {
  DacAccessionId,
  DacStatus,
  DatasetAccessionId,
  IdpTokenType,
  UserAccessionId,
} from './common';

export const IdpToken = z.object({
  access_token: z.string(),
  scope: z.string(),
  session_state: z.string(),
  token_type: IdpTokenType,
  refresh_token: z.string(),
  refresh_expires_in: z.number(),
  expires_in: z.number(),
  'not-before-policy': z.number(),
});
export type IdpToken = z.infer<typeof IdpToken>;

export const Dac = z.object({
  provisional_id: z.number(),
  accession_id: z.string(),
  title: z.string(),
  description: z.string(),
  status: DacStatus,
  declined_reason: z.string().nullable(),
});
export type Dac = z.infer<typeof Dac>;

export const EgaDataset = z.object({
  accession_id: DatasetAccessionId,
  title: z.string().nullable(), // TODO: verify this is expected
  description: z.string().optional(),
});
export type EgaDataset = z.infer<typeof EgaDataset>;

export const EgaUser = z.object({
  id: z.number(),
  username: z.string(),
  // several Users are coming back with null email values, is this expected? Assuming that if there is a userid, the User is valid
  email: z.string().nullable(),
  accession_id: UserAccessionId,
});
export type EgaUser = z.infer<typeof EgaUser>;

// the full response from EGA has several other fields, but we only parse for the request_id field required for the permission approval step in createRequiredPermissions()
export const EgaPermissionRequest = z.object({
  request_id: z.number(),
});
export type EgaPermissionRequest = z.infer<typeof EgaPermissionRequest>;

export const EgaPermission = z.object({
  permission_id: z.number(),
  username: z.string(),
  user_accession_id: UserAccessionId,
  dataset_accession_id: DatasetAccessionId,
  dac_accession_id: DacAccessionId,
});
export type EgaPermission = z.infer<typeof EgaPermission>;

export const ApprovePermissionResponse = z.object({ num_granted: z.number() });
export type ApprovePermissionResponse = z.infer<typeof ApprovePermissionResponse>;

export const RevokePermissionResponse = z.object({ num_revoked: z.number() });
export type RevokePermissionResponse = z.infer<typeof RevokePermissionResponse>;

export const EgaDacoUser = EgaUser.merge(z.object({ appExpiry: z.date(), appId: z.string() }));
export type EgaDacoUser = z.infer<typeof EgaDacoUser>;

export type EgaDacoUserMap = Record<string, EgaDacoUser>;
