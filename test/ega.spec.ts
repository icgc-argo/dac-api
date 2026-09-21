import { expect } from 'chai';

import { EgaPermission, EgaUser } from '../src/jobs/ega/types/responses';

describe('EgaUser schema', () => {
  it('accepts a user record that carries no accession_id', () => {
    const response = {
      id: 123,
      username: 'boysue@example.com',
      email: 'boysue@example.com',
    };

    const result = EgaUser.safeParse(response);

    expect(result.success).to.be.true;
  });

  it('accepts a user record that still carries accession_id, and ignores it', () => {
    const response = {
      id: 123,
      username: 'boysue@example.com',
      email: 'boysue@example.com',
      accession_id: 'EGAW00000009999',
    };

    const result = EgaUser.safeParse(response);

    expect(result.success).to.be.true;
    expect(result.success && result.data).to.deep.equal({
      id: 123,
      username: 'boysue@example.com',
      email: 'boysue@example.com',
    });
  });

  it('accepts a user record carrying fields this job does not read', () => {
    const response = {
      id: 123,
      username: 'boysue@example.com',
      email: 'boysue@example.com',
      full_name: 'Boy Sue',
      organisation: 'Research Center',
    };

    const result = EgaUser.safeParse(response);

    expect(result.success).to.be.true;
  });

  it('accepts a user record with a null email, which EGA is documented to return', () => {
    const response = {
      id: 123,
      username: 'boysue@example.com',
      email: null,
    };

    const result = EgaUser.safeParse(response);

    expect(result.success).to.be.true;
  });

  it('rejects a user record with no username, which permissions are keyed by', () => {
    const response = {
      id: 123,
      email: 'boysue@example.com',
    };

    const result = EgaUser.safeParse(response);

    expect(result.success).to.be.false;
  });

  it('rejects a user record with no id, which permission lookups are keyed by', () => {
    const response = {
      username: 'boysue@example.com',
      email: 'boysue@example.com',
    };

    const result = EgaUser.safeParse(response);

    expect(result.success).to.be.false;
  });
});

describe('EgaPermission schema', () => {
  it('accepts a permission that carries no user_accession_id', () => {
    const response = {
      permission_id: 1,
      username: 'boysue@example.com',
      dataset_accession_id: 'EGAD00000000001',
      dac_accession_id: 'EGAC00000000001',
    };

    const result = EgaPermission.safeParse(response);

    expect(result.success).to.be.true;
  });

  it('accepts a permission that still carries user_accession_id, and ignores it', () => {
    const response = {
      permission_id: 1,
      username: 'boysue@example.com',
      user_accession_id: 'EGAW00000009999',
      dataset_accession_id: 'EGAD00000000001',
      dac_accession_id: 'EGAC00000000001',
    };

    const result = EgaPermission.safeParse(response);

    expect(result.success).to.be.true;
    expect(result.success && result.data).to.deep.equal({
      permission_id: 1,
      username: 'boysue@example.com',
      dataset_accession_id: 'EGAD00000000001',
      dac_accession_id: 'EGAC00000000001',
    });
  });

  it('rejects a permission with no permission_id, which revocation requests are built from', () => {
    const response = {
      username: 'boysue@example.com',
      dataset_accession_id: 'EGAD00000000001',
      dac_accession_id: 'EGAC00000000001',
    };

    const result = EgaPermission.safeParse(response);

    expect(result.success).to.be.false;
  });

  it('rejects a permission with no username, which approval is checked against', () => {
    const response = {
      permission_id: 1,
      dataset_accession_id: 'EGAD00000000001',
      dac_accession_id: 'EGAC00000000001',
    };

    const result = EgaPermission.safeParse(response);

    expect(result.success).to.be.false;
  });

  it('rejects a permission whose dataset_accession_id is not an EGAD accession', () => {
    const response = {
      permission_id: 1,
      username: 'boysue@example.com',
      dataset_accession_id: 'EGAW00000009999',
      dac_accession_id: 'EGAC00000000001',
    };

    const result = EgaPermission.safeParse(response);

    expect(result.success).to.be.false;
  });
});
