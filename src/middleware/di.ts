import { createMiddleware } from 'hono/factory';
import { createD1TagRepository } from '../repositories/tag';
import { createD1TodoRepository } from '../repositories/todo';
import { createTagService, type TagService } from '../services/tag';
import { createTodoService, type TodoService } from '../services/todo';

export type AppVariables = {
  todoService: TodoService;
  tagService: TagService;
};

export type AppEnv = {
  Bindings: CloudflareBindings;
  Variables: AppVariables;
};

// 各リクエストで D1 から repository → service を組み立てて DI
export const diMiddleware = createMiddleware<AppEnv>(
  async function di(c, next) {
    const d1 = c.env.hono_to_go_lesson;
    const todoRepo = createD1TodoRepository(d1);
    const tagRepo = createD1TagRepository(d1);
    c.set('todoService', createTodoService(todoRepo, tagRepo));
    c.set('tagService', createTagService(tagRepo));
    await next();
  },
);
