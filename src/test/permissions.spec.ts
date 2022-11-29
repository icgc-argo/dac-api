import { Identity } from '@overture-stack/ego-token-middleware/dist/types';
import { expect } from 'chai';
import { cloneDeep } from 'lodash';

import { DacoRole } from '../domain/interface';
import { hasReviewScope, hasDacoSystemScope, getDacoRole } from '../utils/permissions';
import {
  mockAdminToken,
  mockApplicantScope,
  mockApplicantToken,
  mockedConfig,
  mockSystemToken,
} from './mocks.spec';

const permissionsTestConfig = mockedConfig();

function addScope(token: Identity, addedScope: string): Identity {
  const modified = cloneDeep(token);
  modified.tokenInfo.context.scope = token.tokenInfo.context.scope.concat(addedScope);
  return modified;
}
describe('permissions', () => {
  it('an applicant token does not have admin permissions', () => {
    const isAdmin = hasReviewScope(mockApplicantToken);
    expect(isAdmin).to.be.false;
  });

  it('an applicant token does not have system permissions', () => {
    const applicantHasSystemPermissions = hasDacoSystemScope(mockApplicantToken);
    expect(applicantHasSystemPermissions).to.be.false;

    // add system scope to applicant token
    const modifiedToken = addScope(mockApplicantToken, permissionsTestConfig.auth.dacoSystemScope);
    expect(modifiedToken.tokenInfo.context.scope).to.contain(
      permissionsTestConfig.auth.dacoSystemScope,
    );
    // verify applicant token does not have system permissions
    const modifiedApplicantHasSystemPermissions = hasDacoSystemScope(modifiedToken);
    expect(modifiedApplicantHasSystemPermissions).to.be.false;

    // check original applicant token is unmodified
    const originalTokenHasSystemPermissions = hasDacoSystemScope(mockApplicantToken);
    expect(originalTokenHasSystemPermissions).to.be.false;
    expect(mockApplicantToken.tokenInfo.context.scope).to.contain(mockApplicantScope);
    expect(mockApplicantToken.tokenInfo.context.scope).to.not.contain(
      permissionsTestConfig.auth.dacoSystemScope,
    );
  });

  it('an admin token has admin permissions', () => {
    const isAdmin = hasReviewScope(mockAdminToken);
    expect(isAdmin).to.be.true;
  });

  it('an admin token does not have system permissions', () => {
    const adminTokenHasSystemPermissions = hasDacoSystemScope(mockAdminToken);
    expect(adminTokenHasSystemPermissions).to.be.false;

    // add system scope to admin token
    const modifiedToken = addScope(mockAdminToken, permissionsTestConfig.auth.dacoSystemScope);
    expect(modifiedToken.tokenInfo.context.scope).to.contain(
      permissionsTestConfig.auth.dacoSystemScope,
    );
    // check modified token does not get system permissions despite having system scope
    const modifiedAdminTokenHasSystemPermissions = hasDacoSystemScope(modifiedToken);
    expect(modifiedAdminTokenHasSystemPermissions).to.be.false;

    // check original admin token is unmodified
    const originalAdminHasSystemPermissions = hasDacoSystemScope(mockAdminToken);
    expect(originalAdminHasSystemPermissions).to.be.false;
    expect(mockAdminToken.tokenInfo.context.scope).to.contain(
      permissionsTestConfig.auth.reviewScope,
    );
    expect(mockAdminToken.tokenInfo.context.scope).to.not.contain(
      permissionsTestConfig.auth.dacoSystemScope,
    );
  });

  it('a system token has system permissions', () => {
    const isSystem = hasDacoSystemScope(mockSystemToken);
    expect(isSystem).to.be.true;
  });

  it('a system token does not have admin permissions', () => {
    const systemTokenHasAdminPermissions = hasReviewScope(mockSystemToken);
    expect(systemTokenHasAdminPermissions).to.be.false;

    // add admin scope to system token
    const modifiedSystemToken = addScope(mockSystemToken, permissionsTestConfig.auth.reviewScope);
    expect(modifiedSystemToken.tokenInfo.context.scope).to.contain(
      permissionsTestConfig.auth.reviewScope,
    );

    // verify modified token does not grant admin permissons
    const modifiedSystemTokenHasAdminPermissions = hasReviewScope(modifiedSystemToken);
    expect(modifiedSystemTokenHasAdminPermissions).to.be.false;

    // check original system token is unmodified
    const originalSystemTokenHasAdminPermissions = hasReviewScope(mockSystemToken);
    expect(originalSystemTokenHasAdminPermissions).to.be.false;
    expect(mockSystemToken.tokenInfo.context.scope).to.contain(
      permissionsTestConfig.auth.dacoSystemScope,
    );
    expect(mockSystemToken.tokenInfo.context.scope).to.not.contain(
      permissionsTestConfig.auth.reviewScope,
    );
  });

  describe('roles', () => {
    it('only allows a SYSTEM role for a system token', () => {
      const role = getDacoRole(mockSystemToken);
      expect(role).to.eq(DacoRole.SYSTEM);

      const modifiedSystemToken = addScope(mockSystemToken, permissionsTestConfig.auth.reviewScope);
      expect(modifiedSystemToken.tokenInfo.context.scope).to.contain(
        permissionsTestConfig.auth.reviewScope,
      );

      const roleWithAdminScopeAdded = getDacoRole(modifiedSystemToken);
      expect(roleWithAdminScopeAdded).to.eq(DacoRole.SYSTEM);
    });

    it('only allows an ADMIN role for an admin token', () => {
      const role = getDacoRole(mockAdminToken);
      expect(role).to.eq(DacoRole.ADMIN);

      const modifiedToken = addScope(mockAdminToken, permissionsTestConfig.auth.dacoSystemScope);
      expect(modifiedToken.tokenInfo.context.scope).to.contain(
        permissionsTestConfig.auth.dacoSystemScope,
      );
      const roleWithSystemScopeAdded = getDacoRole(modifiedToken);
      expect(roleWithSystemScopeAdded).to.eq(DacoRole.ADMIN);
    });

    it('does not allow a SYSTEM role for an applicant token', () => {
      const role = getDacoRole(mockApplicantToken);
      expect(role).to.eq(DacoRole.SUBMITTER);

      const modifiedToken = addScope(
        mockApplicantToken,
        permissionsTestConfig.auth.dacoSystemScope,
      );
      expect(modifiedToken.tokenInfo.context.scope).to.contain(
        permissionsTestConfig.auth.dacoSystemScope,
      );
      const roleWithSystemScopeAdded = getDacoRole(modifiedToken);
      expect(roleWithSystemScopeAdded).to.eq(DacoRole.SUBMITTER);
    });
  });
});
