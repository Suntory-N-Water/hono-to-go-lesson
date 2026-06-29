import { and, eq, inArray, sql } from 'drizzle-orm';
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { tags, todoTags, todos } from '../db/schema';

export type Todo = {
  id: number;
  title: string;
  completed: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TodoUpdatePatch = {
  title?: string;
  completed?: boolean;
};

// Go の interface に相当: D1 実装と mock の差し替えを可能にする
export type TodoRepository = {
  list: (limit: number, offset: number) => Promise<Todo[]>;
  count: () => Promise<number>;
  findById: (id: number) => Promise<Todo | null>;
  create: (title: string) => Promise<Todo>;
  // 楽観的ロック: version 一致時のみ更新し、更新後の行を返す
  updateWithVersion: (
    id: number,
    version: number,
    patch: TodoUpdatePatch,
  ) => Promise<Todo | null>;
  delete: (id: number) => Promise<boolean>;
  replaceTags: (todoId: number, tagIds: readonly number[]) => Promise<void>;
  // todoId ごとの tag 一覧をまとめて取得 (N+1 回避)
  loadTagsByTodoIds: (
    todoIds: readonly number[],
  ) => Promise<Map<number, { id: number; name: string }[]>>;
};

type DB = DrizzleD1Database<Record<string, never>>;

export function createD1TodoRepository(d1: D1Database): TodoRepository {
  const db: DB = drizzle(d1);

  return {
    async list(limit, offset) {
      return db
        .select()
        .from(todos)
        .orderBy(todos.id)
        .limit(limit)
        .offset(offset)
        .all();
    },

    async count() {
      const row = await db
        .select({ count: sql<number>`count(*)` })
        .from(todos)
        .get();
      return row?.count ?? 0;
    },

    async findById(id) {
      const row = await db.select().from(todos).where(eq(todos.id, id)).get();
      return row ?? null;
    },

    async create(title) {
      const [created] = await db.insert(todos).values({ title }).returning();
      if (!created) {
        throw new Error('Todo の作成に失敗しました');
      }
      return created;
    },

    async updateWithVersion(id, version, patch) {
      const [updated] = await db
        .update(todos)
        .set({
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.completed !== undefined && { completed: patch.completed }),
          version: sql`${todos.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(todos.id, id), eq(todos.version, version)))
        .returning();
      return updated ?? null;
    },

    async delete(id) {
      const deleted = await db
        .delete(todos)
        .where(eq(todos.id, id))
        .returning();
      return deleted.length > 0;
    },

    async replaceTags(todoId, tagIds) {
      await db.delete(todoTags).where(eq(todoTags.todoId, todoId)).run();
      if (tagIds.length > 0) {
        await db
          .insert(todoTags)
          .values(tagIds.map((tagId) => ({ todoId, tagId })))
          .run();
      }
    },

    async loadTagsByTodoIds(todoIds) {
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
    },
  };
}
