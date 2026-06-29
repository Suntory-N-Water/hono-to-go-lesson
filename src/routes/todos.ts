import { sValidator } from '@hono/standard-validator';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as v from 'valibot';
import { todos } from '../db/schema';

const idParamSchema = v.object({
  id: v.pipe(
    v.string(),
    v.regex(/^\d+$/, 'id は正の整数で指定してください'),
    v.transform(Number),
  ),
});

const titleSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200));

const createTodoSchema = v.object({
  title: titleSchema,
});

const updateTodoSchema = v.pipe(
  v.object({
    title: v.optional(titleSchema),
    completed: v.optional(v.boolean()),
  }),
  v.check(
    (input) => input.title !== undefined || input.completed !== undefined,
    'title または completed のいずれかを指定してください',
  ),
);

export const todosRoute = new Hono<{ Bindings: CloudflareBindings }>()
  .get('/', async (c) => {
    const db = drizzle(c.env.hono_to_go_lesson);
    const rows = await db.select().from(todos).all();
    return c.json(rows);
  })
  .post('/', sValidator('json', createTodoSchema), async (c) => {
    const { title } = c.req.valid('json');
    const db = drizzle(c.env.hono_to_go_lesson);
    const [row] = await db.insert(todos).values({ title }).returning();
    return c.json(row, 201);
  })
  .get('/:id', sValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = drizzle(c.env.hono_to_go_lesson);
    const row = await db.select().from(todos).where(eq(todos.id, id)).get();
    if (!row) {
      return c.json({ message: 'Todo が見つかりません' }, 404);
    }
    return c.json(row);
  })
  .put(
    '/:id',
    sValidator('param', idParamSchema),
    sValidator('json', updateTodoSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const db = drizzle(c.env.hono_to_go_lesson);
      const [row] = await db
        .update(todos)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(todos.id, id))
        .returning();
      if (!row) {
        return c.json({ message: 'Todo が見つかりません' }, 404);
      }
      return c.json(row);
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
