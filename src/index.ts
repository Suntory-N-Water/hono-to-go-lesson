import { Hono } from 'hono';
import { tagsRoute } from './routes/tags';
import { todosRoute } from './routes/todos';

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.onError((err, c) => {
  console.error('予期しないエラーが発生しました', err);
  return c.json({ message: 'Internal Server Error' }, 500);
});

const routes = app
  .route('/api/todos', todosRoute)
  .route('/api/tags', tagsRoute);

export default app;
export type AppType = typeof routes;
