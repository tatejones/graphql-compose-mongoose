import type { Resolver, ObjectTypeComposer } from 'graphql-compose';
import type { Model, Document } from 'mongoose';
import {
  projectionHelper,
  prepareAliases,
  prepareAliasesReverse,
  replaceAliases,
  ArgsMap,
} from './helpers';
import type { ExtendedResolveParams } from './index';
import { beforeQueryHelperLean } from './helpers/beforeQueryHelper';
import { getDataLoader } from './helpers/dataLoaderHelper';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DataLoaderManyLeanResolverOpts {}

export function dataLoaderManyLean<TSource = any, TContext = any, TDoc extends Document = any>(
  model: Model<TDoc>,
  tc: ObjectTypeComposer<TDoc, TContext>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts?: DataLoaderManyLeanResolverOpts
): Resolver<TSource, TContext, ArgsMap, TDoc> {
  if (!model || !model.modelName || !model.schema) {
    throw new Error(
      'First arg for Resolver dataLoaderMany() should be instance of Mongoose Model.'
    );
  }

  if (!tc || tc.constructor.name !== 'ObjectTypeComposer') {
    throw new Error(
      'Second arg for Resolver dataLoaderMany() should be instance of ObjectTypeComposer.'
    );
  }

  const aliases = prepareAliases(model);
  const aliasesReverse = prepareAliasesReverse(model);

  return tc.schemaComposer.createResolver({
    type: tc.NonNull.List.NonNull,
    name: 'dataLoaderManyLean',
    kind: 'query',
    args: {
      _ids: '[MongoID]!',
    },
    resolve: ((resolveParams: ExtendedResolveParams<TDoc>) => {
      const args = resolveParams.args || {};

      if (!Array.isArray(args._ids) || args._ids.length === 0) {
        return Promise.resolve([]);
      }

      if (!resolveParams.info) {
        throw new Error(
          `Cannot use ${tc.getTypeName()}.dataLoaderManyLean resolver without 'info: GraphQLResolveInfo'`
        );
      }

      const dl = getDataLoader(resolveParams.context, resolveParams.info, async (ids) => {
        resolveParams.query = model.find({
          _id: { $in: ids },
        } as any);
        resolveParams.model = model;
        projectionHelper(resolveParams, aliases);
        const result = (await beforeQueryHelperLean(resolveParams)) || [];
        return Array.isArray(result) && aliasesReverse
          ? result.map((r) => replaceAliases(r, aliasesReverse))
          : result;
      });

      return dl.loadMany(args._ids);
    }) as any,
  }) as any;
}
