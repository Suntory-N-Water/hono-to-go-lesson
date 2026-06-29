import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import * as v from 'valibot';
import type { AppEnv } from '../middleware/di';

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

export const todosRoute = new Hono<AppEnv>()
  .get('/', sValidator('query', listQuerySchema), async (c) => {
    const { limit, offset } = c.req.valid('query');
    const result = await c.get('todoService').list(limit, offset);
    return c.json(result);
  })
  .post('/', sValidator('json', createTodoSchema), async (c) => {
    const { title, tagIds = [] } = c.req.valid('json');
    const result = await c.get('todoService').create({ title, tagIds });
    if (result.kind === 'missing_tags') {
      return c.json(
        {
          message: '存在しないタグ id が含まれています',
          missing: result.missing,
        },
        400,
      );
    }
    return c.json(result.todo, 201);
  })
  .get('/:id', sValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const todo = await c.get('todoService').get(id);
    if (!todo) {
      return c.json({ message: 'Todo が見つかりません' }, 404);
    }
    return c.json(todo);
  })
  .put(
    '/:id',
    sValidator('param', idParamSchema),
    sValidator('json', updateTodoSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const result = await c.get('todoService').update(id, input);
      switch (result.kind) {
        case 'missing_tags':
          return c.json(
            {
              message: '存在しないタグ id が含まれています',
              missing: result.missing,
            },
            400,
          );
        case 'not_found':
          return c.json({ message: 'Todo が見つかりません' }, 404);
        case 'conflict':
          return c.json(
            {
              message: 'version が一致しません',
              currentVersion: result.currentVersion,
            },
            409,
          );
        case 'ok':
          return c.json(result.todo);
      }
    },
  )
  .delete('/:id', sValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const deleted = await c.get('todoService').delete(id);
    if (!deleted) {
      return c.json({ message: 'Todo が見つかりません' }, 404);
    }
    return c.body(null, 204);
  });
