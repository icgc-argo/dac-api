import { findLast, sortBy, cloneDeep, isArray } from 'lodash';

import { Application, UpdateEvent } from '../domain/interface';

export function checkIsDefined<T>(val: T | undefined | null): T {
  // eslint-disable-next-line no-null/no-null
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
    // eslint-disable-next-line no-null/no-null
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

export const getLastPausedAtDate = (app: Application): Date | undefined => {
  // updates should appear in asc order by date but just ensuring it
  // retrieving the most recent PAUSED event; in future applications could be paused several times
  return findLast(
    sortBy(app.updates, (u) => u.date),
    (update) => update.eventType === UpdateEvent.PAUSED,
  )?.date;
};
