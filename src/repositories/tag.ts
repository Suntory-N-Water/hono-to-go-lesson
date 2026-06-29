import { eq, inArray } from 'drizzle-orm';
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { tags } from '../db/schema';

export type Tag = {
  id: number;
  name: string;
};

export type TagRepository = {
  list: () => Promise<Tag[]>;
  // 指定 id 群のうち存在しないものを返す (Todo 側のタグ検証用)
  findMissingIds: (tagIds: readonly number[]) => Promise<number[]>;
  findByName: (name: string) => Promise<Tag | null>;
  // 同名タグがあれば既存を返し、無ければ作成して返す
  createIfNotExists: (name: string) => Promise<{ tag: Tag; created: boolean }>;
};

type DB = DrizzleD1Database<Record<string, never>>;

export function createD1TagRepository(d1: D1Database): TagRepository {
  const db: DB = drizzle(d1);

  return {
    async list() {
      return db.select().from(tags).orderBy(tags.id).all();
    },

    async findMissingIds(tagIds) {
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
    },

    async findByName(name) {
      const row = await db.select().from(tags).where(eq(tags.name, name)).get();
      return row ?? null;
    },

    async createIfNotExists(name) {
      const [created] = await db
        .insert(tags)
        .values({ name })
        .onConflictDoNothing()
        .returning();
      if (created) {
        return { tag: created, created: true };
      }
      const existing = await db
        .select()
        .from(tags)
        .where(eq(tags.name, name))
        .get();
      if (!existing) {
        throw new Error('タグの取得に失敗しました');
      }
      return { tag: existing, created: false };
    },
  };
}
