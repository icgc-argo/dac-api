import _, { uniqBy } from 'lodash';
import { Request } from 'express';
import { State, PersonalInfo, ApplicationSummary, CSVFileHeader } from '../domain/interface';
import moment from 'moment';
import { search, SearchParams } from '../domain/service';
import { IRequest } from '../routes/applications';
import { createCipheriv, randomBytes } from 'crypto';
import { getAppConfig } from '../config';
import { CHAR_ENCODING, DACO_ENCRYPTION_ALGO, IV_LENGTH } from './constants';

export function c<T>(val: T | undefined | null): T {
  if (val === undefined || val === null) {
    throw new Error('value is not defined');
  }
  return val;
}

export function mergeKnown<T>(a: T, b: any) {
  const t = _.cloneDeep(a);
  _mergeKnown(t, b);
  return t;
}

const _mergeKnown = (a: any, b: any) => {
  // if we are on an object node, traverse it
  Object.keys(a).forEach((k) => {
    if (b[k] === undefined) {
      return;
    }
    // tslint:disable-next-line:no-null-keyword
    if (a[k] == null || typeof a[k] !== 'object') {
      a[k] = b[k];
      return;
    }

    if (_.isArray(a[k])) {
      a[k] = _.cloneDeep(b[k]);
      return;
    }

    // a[k] is an object
    if (typeof a[k] == typeof b[k]) {
      _mergeKnown(a[k], b[k]);
    }
  });
};

export const getSearchParams = (req: Request, defaultSort?: string): SearchParams => {
  const query = (req.query.query as string | undefined) || '';
  const states = req.query.states ? ((req.query.states as string).split(',') as State[]) : [];
  const page = Number(req.query.page) || 0;
  const pageSize = Number(req.query.pageSize) || 25;
  const sort = (req.query.sort as string | undefined) || defaultSort;
  const includeStats = Boolean(req.query.includeStats) || false;
  const sortBy = sort
    ? sort.split(',').map((s) => {
        const sortField = s.trim().split(':');
        return { field: sortField[0].trim(), direction: sortField[1].trim() };
      })
    : [];

  return {
    query,
    states,
    page,
    pageSize,
    sortBy,
    includeStats
  };
};

export const parseApprovedUser = (userInfo: PersonalInfo, lastUpdatedAtUtc: Date) => ({
  userName: userInfo.displayName,
  openId: userInfo.googleEmail,
  email: userInfo.institutionEmail,
  affiliation: userInfo.primaryAffiliation,
  changed: moment(lastUpdatedAtUtc).format('YYYY-MM-DDTHH:mm'), // simple formatting until value of this field is verified
});

const getApprovedUsers = async (req: Request) => {
  const params: SearchParams = {
    ...getSearchParams(req),
    states: ['APPROVED'] as State[],
    includeCollaborators: true,
    cursorSearch: true,
  };
  const results = await search(params, (req as IRequest).identity);
  return results;
};

export const createDacoCSVFile = async (req: Request) => {
  const results = await getApprovedUsers(req);
  // applicant + collaborators get daco access
  const parsedResults = results.items
    .map((appResult: ApplicationSummary) => {
      const applicantInfo = appResult.applicant.info;
      const applicant = parseApprovedUser(applicantInfo, appResult.lastUpdatedAtUtc);
      const collabs = (appResult.collaborators || []).map((collab) =>
        parseApprovedUser(collab, appResult.lastUpdatedAtUtc),
      );
      return [applicant, ...collabs];
    })
    .flat();

  const fileHeaders: CSVFileHeader[] = [
    { accessor: 'userName', name: 'USER NAME' },
    { accessor: 'openId', name: 'OPENID' },
    { accessor: 'email', name: 'EMAIL' },
    { accessor: 'changed', name: 'CHANGED' },
    { accessor: 'affiliation', name: 'AFFILIATION' },
  ];
  const headerRow: string[] = fileHeaders.map((header) => header.name);

  const uniqueApprovedUsers = uniqBy(parsedResults, 'openId').map((row: any) => {
    const dataRow: string[] = fileHeaders.map((header) => {
      // if value is missing, add empty string so the column has content
      return row[header.accessor as string] || '';
    });
    return dataRow.join(',');
  });

  return [headerRow, ...uniqueApprovedUsers].join('\n');
};

export const encrypt: (
  text: string,
  encryptionKey: string,
) => Promise<{ iv: string; content: string } | undefined> = async (text, encryptionKey) => {
  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(DACO_ENCRYPTION_ALGO, encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return {
      iv: iv.toString(CHAR_ENCODING),
      content: encrypted.toString(CHAR_ENCODING),
    };
  } catch (err) {
    console.warn('Encryption failure: ', err);
  }
};
