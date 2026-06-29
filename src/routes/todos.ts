import { sValidator } from '@hono/standard-validator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as v from 'valibot';
import { tags, todoTags, todos } from '../db/schema';

const idParamSchema = v.object({
  id: v.pipe(
    v.string(),
    v.regex(/^\d+$/, 'id は正の整数で指定してください'),
    v.transform(Number),
  ),
});

const titleSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const tagIdsSchema = v.array(v.pipe(v.number(), v.integer(), v.minValue(1)));

const createTodoSchema = v.object({
  title: titleSchema,
  tagIds: v.optional(tagIdsSchema),
});

const updateTodoSchema = v.pipe(
  v.object({
    version: v.pipe(v.number(), v.integer(), v.minValue(1)),
    title: v.optional(titleSchema),
    completed: v.optional(v.boolean()),
    tagIds: v.optional(tagIdsSchema),
  }),
  v.check(
    (input) =>
      input.title !== undefined ||
      input.completed !== undefined ||
      input.tagIds !== undefined,
    'title / completed / tagIds のいずれかを指定してください',
  ),
);

const listQuerySchema = v.object({
  limit: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d+$/, 'limit は整数で指定してください'),
      v.transform(Number),
      v.minValue(1),
      v.maxValue(100),
    ),
    '20',
  ),
  offset: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d+$/, 'offset は 0 以上の整数で指定してください'),
      v.transform(Number),
      v.minValue(0),
    ),
    '0',
  ),
});

type DB = DrizzleD1Database<Record<string, never>>;

// 指定 Todo の id 群に紐づくタグを取得し、todoId ごとにまとめる
const loadTagsByTodoId = async (db: DB, todoIds: readonly number[]) => {
  const result = new Map<number, { id: number; name: string }[]>();
  if (todoIds.length === 0) {
    return result;
  }
  const rows = await db
    .select({
      todoId: todoTags.todoId,
      id: tags.id,
      name: tags.name,
    })
    .from(todoTags)
    .innerJoin(tags, eq(todoTags.tagId, tags.id))
    .where(inArray(todoTags.todoId, [...todoIds]))
    .all();
  for (const row of rows) {
    const list = result.get(row.todoId) ?? [];
    list.push({ id: row.id, name: row.name });
    result.set(row.todoId, list);
  }
  return result;
};

// 指定された tagIds が全て存在するか検証 (存在しない id があれば返す)
const findMissingTagIds = async (db: DB, tagIds: readonly number[]) => {
  if (tagIds.length === 0) {
    return [];
  }
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.id, [...tagIds]))
    .all();
  const existingSet = new Set(existing.map((r) => r.id));
  return tagIds.filter((id) => !existingSet.has(id));
};

// todo に紐づくタグを差し替え
const replaceTodoTags = async (
  db: DB,
  todoId: number,
  tagIds: readonly number[],
) => {
  await db.delete(todoTags).where(eq(todoTags.todoId, todoId)).run();
  if (tagIds.length > 0) {
    await db
      .insert(todoTags)
      .values(tagIds.map((tagId) => ({ todoId, tagId })))
      .run();
  }
};

export const todosRoute = new Hono<{ Bindings: CloudflareBindings }>()
  .get('/', sValidator('query', listQuerySchema), async (c) => {
    const { limit, offset } = c.req.valid('query');
    const db = drizzle(c.env.hono_to_go_lesson);
    const items = await db
      .select()
      .from(todos)
      .orderBy(todos.id)
      .limit(limit)
      .offset(offset)
      .all();
    const totalRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(todos)
      .get();
    const tagsByTodo = await loadTagsByTodoId(
      db,
      items.map((t) => t.id),
    );
    return c.json({
      items: items.map((t) => ({ ...t, tags: tagsByTodo.get(t.id) ?? [] })),
      total: totalRow?.count ?? 0,
      limit,
      offset,
    });
  })
  .post('/', sValidator('json', createTodoSchema), async (c) => {
    const { title, tagIds = [] } = c.req.valid('json');
    const db = drizzle(c.env.hono_to_go_lesson);
    const missing = await findMissingTagIds(db, tagIds);
    if (missing.length > 0) {
      return c.json(
        { message: '存在しないタグ id が含まれています', missing },
        400,
      );
    }
    const [created] = await db.insert(todos).values({ title }).returning();
    if (!created) {
      throw new Error('Todo の作成に失敗しました');
    }
    await replaceTodoTags(db, created.id, tagIds);
    const tagsByTodo = await loadTagsByTodoId(db, [created.id]);
    return c.json({ ...created, tags: tagsByTodo.get(created.id) ?? [] }, 201);
  })
  .get('/:id', sValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.hono_to_go_lesson);
    const row = await db.select().from(todos).where(eq(todos.id, id)).get();
    if (!row) {
      return c.json({ message: 'Todo が見つかりません' }, 404);
    }
    const tagsByTodo = await loadTagsByTodoId(db, [id]);
    return c.json({ ...row, tags: tagsByTodo.get(id) ?? [] });
  })
  .put(
    '/:id',
    sValidator('param', idParamSchema),
    sValidator('json', updateTodoSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const { version, title, completed, tagIds } = c.req.valid('json');
      const db = drizzle(c.env.hono_to_go_lesson);

      if (tagIds !== undefined) {
        const missing = await findMissingTagIds(db, tagIds);
        if (missing.length > 0) {
          return c.json(
            { message: '存在しないタグ id が含まれています', missing },
            400,
          );
        }
      }

      // 楽観的ロック: id + version 一致時のみ更新
      const updated = await db
        .update(todos)
        .set({
          ...(title !== undefined && { title }),
          ...(completed !== undefined && { completed }),
          version: sql`${todos.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(todos.id, id), eq(todos.version, version)))
        .returning();

      if (updated.length === 0) {
        const existing = await db
          .select()
          .from(todos)
          .where(eq(todos.id, id))
          .get();
        if (!existing) {
          return c.json({ message: 'Todo が見つかりません' }, 404);
        }
        return c.json(
          {
            message: 'version が一致しません',
            currentVersion: existing.version,
          },
          409,
        );
      }

      if (tagIds !== undefined) {
        await replaceTodoTags(db, id, tagIds);
      }

      const [row] = updated;
      if (!row) {
        throw new Error('更新結果が空でした');
      }
      const tagsByTodo = await loadTagsByTodoId(db, [id]);
      return c.json({ ...row, tags: tagsByTodo.get(id) ?? [] });
    },
  )
  .delete('/:id', sValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.hono_to_go_lesson);
    const deleted = await db.delete(todos).where(eq(todos.id, id)).returning();
    if (deleted.length === 0) {
      return c.json({ message: 'Todo が見つかりません' }, 404);
    }
    return c.body(null, 204);
  });
