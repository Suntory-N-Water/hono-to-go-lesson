import { Hono } from 'hono';
import { todosRoute } from './routes/todos';

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.onError((err, c) => {
  console.error('予期しないエラーが発生しました', err);
  return c.json({ message: 'Internal Server Error' }, 500);
});

const routes = app.route('/api/todos', todosRoute);

export default app;
export type AppType = typeof routes;
