import type { Document, Model } from 'mongoose';
import type { ConnectionSortMapOpts as _ConnectionSortMapOpts } from 'graphql-compose-connection';
import type {
  Resolver,
  ObjectTypeComposer,
  ObjectTypeComposerFieldConfigMap,
} from 'graphql-compose';
import { getUniqueIndexes, extendByReversedIndexes, IndexT } from '../utils/getIndexesFromModel';
import { ArgsMap } from './helpers';

export type ConnectionResolverOpts<TContext = any> = _ConnectionSortMapOpts & {
  edgeFields?: ObjectTypeComposerFieldConfigMap<any, TContext>;
  connectionResolverName?: string;
  findResolverName?: string;
  countResolverName?: string;
  edgeTypeName?: string;
};

export function connection<TSource = any, TContext = any, TDoc extends Document = any>(
  model: Model<TDoc>,
  tc: ObjectTypeComposer<TDoc, TContext>,
  opts?: ConnectionResolverOpts<TContext>
): Resolver<TSource, TContext, ArgsMap, TDoc> | undefined {
  try {
    require.resolve('graphql-compose-connection');
  } catch (e) {
    return undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prepareConnectionResolver = require('graphql-compose-connection').prepareConnectionResolver;

  if (!prepareConnectionResolver) {
    throw new Error(
      'You should update `graphql-compose-connection` package till 3.2.0 version or above'
    );
  }

  const uniqueIndexes = extendByReversedIndexes(getUniqueIndexes(model), {
    reversedFirst: true,
  });
  const sortConfigs = {} as Record<string, any>;
  uniqueIndexes.forEach((indexData) => {
    const keys = Object.keys(indexData);
    let name = keys
      .join('__')
      .toUpperCase()
      .replace(/[^_a-zA-Z0-9]/i, '__');
    if (indexData[keys[0]] === 1) {
      name = `${name}_ASC`;
    } else if (indexData[keys[0]] === -1) {
      name = `${name}_DESC`;
    }
    sortConfigs[name] = {
      value: indexData,
      cursorFields: keys,
      beforeCursorQuery: (rawQuery: any, cursorData: any) => {
        prepareCursorQuery(rawQuery, cursorData, keys, indexData, '$lt', '$gt');
      },
      afterCursorQuery: (rawQuery: any, cursorData: any) => {
        prepareCursorQuery(rawQuery, cursorData, keys, indexData, '$gt', '$lt');
      },
    };
  });
  const {
    connectionResolverName = 'connection',
    findResolverName = 'findMany',
    countResolverName = 'count',
    edgeFields,
    edgeTypeName,
    ...sortOptions
  } = opts || {};
  return prepareConnectionResolver(tc, {
    connectionResolverName,
    findResolverName,
    countResolverName,
    sort: {
      ...sortConfigs,
      ...sortOptions,
    },
    edgeFields,
    edgeTypeName,
  });
}

export function prepareCursorQuery(
  rawQuery: Record<string, any>,
  cursorData: Record<string, any>,
  indexKeys: Array<string>,
  indexData: IndexT,
  nextOper: '$gt' | '$lt',
  prevOper: '$lt' | '$gt'
): void {
  if (indexKeys.length === 1) {
    // When single index { a: 1 }, then just add to one criteria to the query:
    // rawQuery.a = { $gt|$lt: cursorValue } - for next|prev record
    const k = indexKeys[0];
    if (!rawQuery[k]) rawQuery[k] = {};
    if (indexData[k] === 1) {
      rawQuery[k][nextOper] = cursorData[k];
    } else {
      rawQuery[k][prevOper] = cursorData[k];
    }
  } else {
    // When compound index {a: 1, b: -1, c: 1 } then we should add OR criteries to the query:
    // rawQuery.$or = [
    //   { a: cursorValueA, b: cursorValueB, c: { $gt|$lt: cursorValueC } },
    //   { a: cursorValueA, b: { $gt|$lt: cursorValueB } },
    //   { a: { $gt|$lt: cursorValueA } },
    // ]
    const orCriteries = [];
    for (let i = indexKeys.length - 1; i >= 0; i--) {
      const criteria = {} as Record<string, any>;
      indexKeys.forEach((k, ii) => {
        if (ii < i) {
          criteria[k] = cursorData[k];
        } else if (ii === i) {
          if (indexData[k] === 1) {
            criteria[k] = { [nextOper]: cursorData[k] };
          } else {
            criteria[k] = { [prevOper]: cursorData[k] };
          }
        }
      });
      orCriteries.push(criteria);
    }
    rawQuery.$or = orCriteries;
  }
}
