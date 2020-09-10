import type { ObjectTypeComposer, SchemaComposer, Resolver } from 'graphql-compose';
import { schemaComposer as globalSchemaComposer } from 'graphql-compose';
import type { Model, Document } from 'mongoose';
import { convertModelToGraphQL } from './fieldsConverter';
import { allResolvers } from './resolvers';
import MongoID from './types/MongoID';
import { ArgsMap } from './resolvers/helpers';
import {
  prepareFields,
  createInputType,
  TransformRecordIdFn,
  TypeConverterInputTypeOpts,
} from './composeWithMongoose';

export type ComposeMongooseOpts<TContext> = {
  schemaComposer?: SchemaComposer<TContext>;
  name?: string;
  description?: string;
  fields?: {
    only?: string[];
    // rename?: { [oldName: string]: string },
    remove?: string[];
  };
  inputType?: TypeConverterInputTypeOpts;
  /** You may customize `recordId` field in mutation payloads */
  transformRecordId?: TransformRecordIdFn<TContext>;
};

export type GenerateResolverType<TDoc extends Document, TContext = any> = {
  // get all available resolver generators, then leave only 3rd arg – opts
  // because first two args will be attached via bind() method at runtime:
  //   count = count.bind(undefined, model, tc);
  [resolver in keyof typeof allResolvers]: <TSource = any>(
    opts?: Parameters<typeof allResolvers[resolver]>[2]
  ) => Resolver<TSource, TContext, ArgsMap, TDoc>;
};

export function composeMongoose<TDoc extends Document, TContext = any>(
  model: Model<TDoc>,
  opts: ComposeMongooseOpts<TContext> = {}
): ObjectTypeComposer<TDoc, TContext> & {
  generateResolver: GenerateResolverType<TDoc, TContext>;
} {
  const m: Model<any> = model;
  const name: string = (opts && opts.name) || m.modelName;

  const sc = opts.schemaComposer || globalSchemaComposer;
  sc.add(MongoID);

  if (sc.has(name)) {
    throw new Error(
      `You try to generate GraphQL Type with name ${name} from mongoose model but this type already exists in SchemaComposer. Please choose another type name "composeWithMongoose(model, { name: 'NewTypeName' })", or reuse existed type "schemaComposer.getOTC('TypeName')", or remove type from SchemaComposer before calling composeWithMongoose method "schemaComposer.delete('TypeName')".`
    );
  }
  if (sc.has(m.schema)) {
    // looks like you want to generate new TypeComposer from model
    // so remove cached model (which is used for cross-reference types)
    sc.delete(m.schema);
  }

  const tc = convertModelToGraphQL(m, name, sc);

  if (opts.description) {
    tc.setDescription(opts.description);
  }

  if (opts.fields) {
    prepareFields(tc, opts.fields);
  }

  if (opts.inputType) {
    // generate input type only it was customized
    createInputType(tc, opts.inputType);
  }

  tc.makeFieldNonNull('_id');

  const generateResolver = {} as any;
  Object.keys(allResolvers).forEach((name) => {
    generateResolver[name] = (allResolvers as any)[name].bind(undefined, model, tc);
  });
  (tc as any).generateResolver = generateResolver;

  return tc as any;
}
