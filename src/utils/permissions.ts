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

import { Identity } from '@overture-stack/ego-token-middleware';

import { DacoRole, UpdateAuthor } from '../domain/interface';
import { getAppConfig } from '../config';

export function hasReviewScope(identity: Identity) {
  const REVIEW_SCOPE = getAppConfig().auth.reviewScope;
  const scopes = identity.tokenInfo.context.scope;
  return scopes.some((v) => v == REVIEW_SCOPE);
}

export function hasDacoSystemScope(identity: Identity) {
  const DACO_SYSTEM_SCOPE = getAppConfig().auth.dacoSystemScope;
  const scopes = identity.tokenInfo.context.scope;
  return scopes.some((scope) => scope === DACO_SYSTEM_SCOPE);
}

export const getUpdateAuthor = (identity: Identity): UpdateAuthor => ({
  id: identity.userId,
  role: getDacoRole(identity),
});

// it is assumed a user can have only one role. If system scope is present in the jwt, it will take precedent over the admin scope
// a regular user has neither system nor admin scope
export const getDacoRole: (identity: Identity) => DacoRole = (identity) => {
  const isSystem = hasDacoSystemScope(identity);
  const isAdmin = hasReviewScope(identity);
  return isSystem ? DacoRole.SYSTEM : isAdmin ? DacoRole.ADMIN : DacoRole.SUBMITTER;
};
