/*
 * Copyright (c) 2022 The Ontario Institute for Cancer Research. All rights reserved
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

import { Identity, UserIdentity, ApplicationIdentity } from '@overture-stack/ego-token-middleware';
import { get } from 'lodash';

import { DacoRole, SubmitterInfo, UpdateAuthor } from '../domain/interface';
import { getAppConfig } from '../config';
import { Forbidden } from './errors';

export const isUserJwt = (identity: Identity): identity is UserIdentity =>
  identity.tokenInfo.context.hasOwnProperty('user');
export const isApplicationJwt = (identity: Identity): identity is ApplicationIdentity =>
  identity.tokenInfo.context.hasOwnProperty('application');

export function hasReviewScope(identity: Identity) {
  // only user JWTs are allowed as Admins
  if (isApplicationJwt(identity)) {
    return false;
  }
  const REVIEW_SCOPE = getAppConfig().auth.reviewScope;
  const scopes = identity.tokenInfo.context.scope;
  return scopes.some((v) => v == REVIEW_SCOPE);
}

export function hasDacoSystemScope(identity: Identity) {
  // only application JWTs are allowed as System actors
  if (isUserJwt(identity)) {
    return false;
  }

  const DACO_SYSTEM_SCOPE = getAppConfig().auth.dacoSystemScope;
  const scopes = identity.tokenInfo.context.scope;
  return scopes.some((scope) => scope === DACO_SYSTEM_SCOPE);
}

export const getUpdateAuthor = (identity: Identity): UpdateAuthor => ({
  id: identity.userId,
  role: getDacoRole(identity),
});

// A user can have only one role.
// admin and system scope checks verify a jwt type (user or application) matches the provided scopes
// a regular user has neither system nor admin scope
export const getDacoRole: (identity: Identity) => DacoRole = (identity) => {
  const isSystem = hasDacoSystemScope(identity);
  const isAdmin = hasReviewScope(identity);
  return isSystem ? DacoRole.SYSTEM : isAdmin ? DacoRole.ADMIN : DacoRole.SUBMITTER;
};

export const getSubmitterInfo = (identity: UserIdentity): SubmitterInfo => {
  const email = get(identity, 'tokenInfo.context.user.email');
  if (email && typeof email === 'string') {
    const info: SubmitterInfo = { userId: identity.userId, email };
    return info;
  } else {
    throw new Forbidden('A submitter email is required to create a new application.');
  }
};
