import { Hono } from 'hono';
import { type AppEnv, diMiddleware } from './middleware/di';
import { tagsRoute } from './routes/tags';
import { todosRoute } from './routes/todos';

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error('予期しないエラーが発生しました', err);
  return c.json({ message: 'Internal Server Error' }, 500);
});

app.use('*', diMiddleware);

const routes = app
  .route('/api/todos', todosRoute)
  .route('/api/tags', tagsRoute);

export default app;
export type AppType = typeof routes;
