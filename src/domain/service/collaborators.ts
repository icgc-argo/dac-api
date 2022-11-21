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
import nodemail from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import { ApplicationStateManager } from '../state';
import { Application, Collaborator } from '../interface';
import logger from '../../logger';
import { getAppConfig } from '../../config';
import { ApplicationModel } from '../model';
import { hasReviewScope, getUpdateAuthor } from '../../utils/permissions';
import { findApplication } from './applications/search';
import { throwApplicationClosedError } from '../../utils/errors';
import {
  sendCollaboratorAddedEmail,
  sendCollaboratorApprovedEmail,
  sendCollaboratorRemovedEmail,
} from './emails';

export async function createCollaborator(
  appId: string,
  collaborator: Collaborator,
  identity: Identity,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const config = getAppConfig();
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.addCollaborator(collaborator, identity);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  if (result.state == 'APPROVED') {
    sendCollaboratorAddedEmail(result, config, emailClient);
    // send notification email to new collaborator if application already approved
    sendCollaboratorApprovedEmail(result, collaborator, config, emailClient);
  }
  return result.sections.collaborators.list[result.sections.collaborators.list.length - 1];
}

export async function updateCollaborator(
  appId: string,
  collaborator: Collaborator,
  identity: Identity,
) {
  const isAdminOrReviewerResult = hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.updateCollaborator(collaborator, getUpdateAuthor(identity));
  await ApplicationModel.updateOne({ appId: result.appId }, result);
}

export async function deleteCollaborator(
  appId: string,
  collaboratorId: string,
  identity: Identity,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const config = getAppConfig();
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.deleteCollaborator(collaboratorId, identity);
  await ApplicationModel.updateOne({ appId: result.appId }, result);

  if (result.state === 'APPROVED') {
    const collaborator = appDoc.sections.collaborators.list.find(
      (collab) => collab.id === collaboratorId,
    );

    if (collaborator) {
      logger.info('Collaborator was found, sending notification of access removal.');
      sendCollaboratorRemovedEmail(result, collaborator, config, emailClient);
    }
  }
}
