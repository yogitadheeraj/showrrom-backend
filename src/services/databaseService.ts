import { randomUUID } from 'node:crypto';
import { FilterQuery } from 'mongoose';
import { getCollectionModel } from '../models/collectionModel.js';

type FilterOperator = 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is';

type DbFilter = {
  field: string;
  op: FilterOperator;
  value: unknown;
};

type DbOrder = {
  field: string;
  ascending?: boolean;
};

export type DbAction = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export type DbQueryRequest = {
  table: string;
  action: DbAction;
  select?: string;
  filters?: DbFilter[];
  order?: DbOrder[];
  limit?: number;
  payload?: Record<string, unknown>;
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  options?: {
    count?: 'exact' | null;
    head?: boolean;
    onConflict?: string;
    ignoreDuplicates?: boolean;
  };
};

function toPlain<T extends Record<string, unknown>>(doc: T) {
  const cloned = { ...doc };
  delete (cloned as Record<string, unknown>)._id;
  return cloned;
}

function safeTable(table: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) {
    throw new Error('Invalid table name');
  }

  return table;
}

function buildMongoFilter(filters: DbFilter[] = []): FilterQuery<Record<string, unknown>> {
  const where: Record<string, unknown> = {};

  for (const filter of filters) {
    const { field, op, value } = filter;
    if (!field) continue;

    if (op === 'eq') where[field] = value;
    if (op === 'neq') where[field] = { $ne: value };
    if (op === 'in') where[field] = { $in: Array.isArray(value) ? value : [value] };
    if (op === 'not_in') where[field] = { $nin: Array.isArray(value) ? value : [value] };
    if (op === 'gt') where[field] = { $gt: value };
    if (op === 'gte') where[field] = { $gte: value };
    if (op === 'lt') where[field] = { $lt: value };
    if (op === 'lte') where[field] = { $lte: value };

    if (op === 'is') {
      where[field] = value === null ? null : value;
    }

    if (op === 'like' || op === 'ilike') {
      const text = String(value ?? '').replace(/%/g, '.*');
      where[field] = { $regex: `^${text}$`, $options: op === 'ilike' ? 'i' : '' };
    }
  }

  return where;
}

function parseProjection(select: string | undefined) {
  if (!select || select.trim() === '*' || select.includes('(')) {
    return undefined;
  }

  return select
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .reduce<Record<string, 1>>((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {});
}

function parseSort(order: DbOrder[] = []) {
  return order.reduce<Record<string, 1 | -1>>((acc, item) => {
    acc[item.field] = item.ascending === false ? -1 : 1;
    return acc;
  }, {});
}

function hasFilterOnField(filters: DbFilter[] = [], field: string) {
  return filters.some((filter) => filter.field === field);
}

function withMetadata(input: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    ...input,
    id: typeof input.id === 'string' ? input.id : randomUUID(),
    updated_at: now,
    created_at: typeof input.created_at === 'string' ? input.created_at : now,
  };
}

export async function runDbQuery(request: DbQueryRequest) {
  const table = safeTable(request.table);
  const model = getCollectionModel(table);
  const isLocationSpecialPeriods = table === 'location_special_periods';
  const normalizedFilters = [...(request.filters || [])];

  // Keep soft-deleted rows hidden by default unless caller explicitly asks otherwise.
  if (isLocationSpecialPeriods && request.action === 'select') {
    if (!hasFilterOnField(normalizedFilters, 'is_deleted')) {
      normalizedFilters.push({ field: 'is_deleted', op: 'neq', value: true });
    }
    if (!hasFilterOnField(normalizedFilters, 'is_active')) {
      normalizedFilters.push({ field: 'is_active', op: 'neq', value: false });
    }
  }

  const where = buildMongoFilter(normalizedFilters);
  const projection = parseProjection(request.select);
  const sort = parseSort(request.order || []);

  if (request.action === 'select') {
    const query = model.find(where, projection);

    if (Object.keys(sort).length > 0) {
      query.sort(sort);
    }

    if (request.limit && request.limit > 0) {
      query.limit(request.limit);
    }

    const [rows, count] = await Promise.all([
      query.lean(),
      request.options?.count === 'exact' ? model.countDocuments(where) : Promise.resolve(null),
    ]);

    return {
      data: request.options?.head ? null : rows.map((row) => toPlain(row as Record<string, unknown>)),
      count,
    };
  }

  if (request.action === 'insert') {
    const list = Array.isArray(request.values) ? request.values : [request.values || {}];
    const docs = list.map((item) =>
      withMetadata(
        isLocationSpecialPeriods
          ? { is_active: true, is_deleted: false, ...(item || {}) }
          : item
      )
    );
    const created = await model.insertMany(docs, { ordered: true });
    return { data: created.map((row) => toPlain(row.toObject() as Record<string, unknown>)) };
  }

  if (request.action === 'update') {
    await model.updateMany(where, { $set: { ...(request.payload || {}), updated_at: new Date().toISOString() } });
    const rows = await model.find(where).lean();
    return { data: rows.map((row) => toPlain(row as Record<string, unknown>)) };
  }

  if (request.action === 'delete') {
    if (isLocationSpecialPeriods) {
      const rows = await model.find(where).lean();
      await model.updateMany(where, {
        $set: {
          is_active: false,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      const updatedRows = await model.find(where).lean();

      return {
        data: (updatedRows.length > 0 ? updatedRows : rows).map((row) =>
          toPlain(row as Record<string, unknown>)
        ),
      };
    }

    const rows = await model.find(where).lean();
    await model.deleteMany(where);
    return { data: rows.map((row) => toPlain(row as Record<string, unknown>)) };
  }

  if (request.action === 'upsert') {
    const list = Array.isArray(request.values) ? request.values : [request.values || {}];
    const conflictFields = (request.options?.onConflict || 'id')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const output: Array<Record<string, unknown>> = [];

    for (const item of list) {
      const doc = withMetadata(item);
      const docRecord = doc as Record<string, unknown>;
      const conflictQuery = conflictFields.reduce<Record<string, unknown>>((acc, field) => {
        acc[field] = docRecord[field];
        return acc;
      }, {});

      if (request.options?.ignoreDuplicates) {
        const existing = await model.findOne(conflictQuery).lean();
        if (existing) {
          output.push(toPlain(existing as Record<string, unknown>));
          continue;
        }
      }

      const saved = await model
        .findOneAndUpdate(conflictQuery, { $set: doc }, { new: true, upsert: true })
        .lean();

      if (saved) {
        output.push(toPlain(saved as Record<string, unknown>));
      }
    }

    return { data: output };
  }

  throw new Error(`Unsupported action: ${request.action}`);
}
