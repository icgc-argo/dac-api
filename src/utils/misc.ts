import _ from 'lodash';

export function c<T>(val: T | undefined): T {
  if (val === undefined || val === null) {
    throw new Error('value is not defined');
  }
  return val;
}

export const mergeKnown = (a: any, b: any) => {
  const t = _.cloneDeep(a);
  _mergeKnown(t, b);
  return t;
};

const _mergeKnown = (a: any, b: any) => {
  // if we are on an object node, traverse it
  Object.keys(a).forEach(k => {
    console.log('merging ' + k);
    if (b[k] === undefined) {
        console.log('not overriden');
        return;
    }
    console.log('override [' + k + '] is found ');
    console.log(`type a[k] (${a[k]}) = `, typeof a[k]);
    // tslint:disable-next-line:no-null-keyword
    if (a[k] == null || typeof a[k] !== 'object') {
      console.log(' value for [' + k + '] is premitive ');
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
    } else {
      console.warn('type doesn\'t match');
    }
  });
};



