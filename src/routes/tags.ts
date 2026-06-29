import { sValidator } from '@hono/standard-validator';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as v from 'valibot';
import { tags } from '../db/schema';

const tagNameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(50));

const createTagSchema = v.object({
  name: tagNameSchema,
});

export const tagsRoute = new Hono<{ Bindings: CloudflareBindings }>()
  .get('/', async (c) => {
    const db = drizzle(c.env.hono_to_go_lesson);
    const rows = await db.select().from(tags).orderBy(tags.id).all();
    return c.json(rows);
  })
  .post('/', sValidator('json', createTagSchema), async (c) => {
    const { name } = c.req.valid('json');
    const db = drizzle(c.env.hono_to_go_lesson);
    // 同名タグがあれば既存を返す (upsert 的挙動)
    const [created] = await db
      .insert(tags)
      .values({ name })
      .onConflictDoNothing()
      .returning();
    if (created) {
      return c.json(created, 201);
    }
    const existing = await db
      .select()
      .from(tags)
      .where(eq(tags.name, name))
      .get();
    return c.json(existing, 200);
  });
