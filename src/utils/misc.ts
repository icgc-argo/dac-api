import _ from 'lodash';
import { Request } from 'express';
import { State, PersonalInfo } from '../domain/interface';
import moment from 'moment';

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

export const getSearchParams = (req: Request, defaultSort: string) => {
  const query = (req.query.query as string | undefined) || '';
  const states = req.query.states ? ((req.query.states as string).split(',') as State[]) : [];
  const page = Number(req.query.page) || 0;
  const pageSize = Number(req.query.pageSize) || 25;
  const sort = (req.query.sort as string | undefined) || defaultSort;
  const sortBy = sort.split(',').map((s) => {
    const sortField = s.trim().split(':');
    return { field: sortField[0].trim(), direction: sortField[1].trim() };
  });

  return {
    query,
    states,
    page,
    pageSize,
    sortBy,
  };
};

export const parseApprovedUser = (userInfo: PersonalInfo, lastUpdatedAtUtc: Date) => ({
  userName: userInfo.displayName,
  openId: userInfo.googleEmail,
  email: userInfo.institutionEmail,
  affiliation: userInfo.primaryAffiliation,
  changed: moment(lastUpdatedAtUtc).format('YYYY-MM-DDTHH:mm'), // simple formatting until value of this field is verified
});
