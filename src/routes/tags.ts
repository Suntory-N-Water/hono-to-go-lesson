import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import * as v from 'valibot';
import type { AppEnv } from '../middleware/di';

const tagNameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(50));

const createTagSchema = v.object({
  name: tagNameSchema,
});

export const tagsRoute = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await c.get('tagService').list();
    return c.json(rows);
  })
  .post('/', sValidator('json', createTagSchema), async (c) => {
    const { name } = c.req.valid('json');
    const { tag, created } = await c.get('tagService').create(name);
    return c.json(tag, created ? 201 : 200);
  });
