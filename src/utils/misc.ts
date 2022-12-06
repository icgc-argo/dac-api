import { findLast, sortBy, cloneDeep, isArray } from 'lodash';
import { Identity } from '@overture-stack/ego-token-middleware';

import { DacoRole, UpdateAuthor, Application, UpdateEvent } from '../domain/interface';
import { hasDacoSystemScope, hasReviewScope } from '../utils/permissions';

export function c<T>(val: T | undefined | null): T {
  if (val === undefined || val === null) {
    throw new Error('value is not defined');
  }
  return val;
}

export function mergeKnown<T>(a: T, b: any) {
  const t = cloneDeep(a);
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

    if (isArray(a[k])) {
      a[k] = cloneDeep(b[k]);
      return;
    }

    // a[k] is an object
    if (typeof a[k] == typeof b[k]) {
      _mergeKnown(a[k], b[k]);
    }
  });
};

// TODO: update to handle SYSTEM role
export const getUpdateAuthor: (id: string, isReviewer: boolean) => UpdateAuthor = (
  id,
  isReviewer,
) => ({
  id,
  role: isReviewer ? DacoRole.ADMIN : DacoRole.SUBMITTER,
});

export const getDacoRole: (identity: Identity) => Promise<DacoRole> = async (identity) => {
  const isSystem = await hasDacoSystemScope(identity);
  const isAdmin = await hasReviewScope(identity);
  return isSystem ? DacoRole.SYSTEM : isAdmin ? DacoRole.ADMIN : DacoRole.SUBMITTER;
};

export const getLastPausedAtDate = (app: Application): Date | undefined => {
  // updates should appear in asc order by date but just ensuring it
  // retrieving the most recent PAUSED event; in future applications could be paused several times
  return findLast(
    sortBy(app.updates, (u) => u.date),
    (update) => update.eventType === UpdateEvent.PAUSED,
  )?.date;
};
