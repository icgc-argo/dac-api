import { expect } from 'chai';

import { EgaUser } from '../src/jobs/ega/types/responses';

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
