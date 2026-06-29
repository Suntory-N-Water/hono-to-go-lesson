import type { Tag, TagRepository } from '../repositories/tag';
import type { Todo, TodoRepository } from '../repositories/todo';

export type TodoWithTags = Todo & { tags: Tag[] };

export type ListResult = {
  items: TodoWithTags[];
  total: number;
  limit: number;
  offset: number;
};

export type CreateInput = {
  title: string;
  tagIds: readonly number[];
};

export type UpdateInput = {
  version: number;
  title?: string | undefined;
  completed?: boolean | undefined;
  tagIds?: readonly number[] | undefined;
};

// Go の (value, error) パターンに近い形で結果を表現
// Phase 3 でカスタムエラー throw に置き換える予定
export type UpdateResult =
  | { kind: 'ok'; todo: TodoWithTags }
  | { kind: 'not_found' }
  | { kind: 'conflict'; currentVersion: number }
  | { kind: 'missing_tags'; missing: number[] };

export type CreateResult =
  | { kind: 'ok'; todo: TodoWithTags }
  | { kind: 'missing_tags'; missing: number[] };

export type TodoService = {
  list: (limit: number, offset: number) => Promise<ListResult>;
  get: (id: number) => Promise<TodoWithTags | null>;
  create: (input: CreateInput) => Promise<CreateResult>;
  update: (id: number, input: UpdateInput) => Promise<UpdateResult>;
  delete: (id: number) => Promise<boolean>;
};

export function createTodoService(
  todoRepo: TodoRepository,
  tagRepo: TagRepository,
): TodoService {
  // 指定 todo に紐づくタグを取得して付与
  async function attachTags(todo: Todo): Promise<TodoWithTags> {
    const tagsByTodo = await todoRepo.loadTagsByTodoIds([todo.id]);
    return { ...todo, tags: tagsByTodo.get(todo.id) ?? [] };
  }

  return {
    async list(limit, offset) {
      const items = await todoRepo.list(limit, offset);
      const total = await todoRepo.count();
      const tagsByTodo = await todoRepo.loadTagsByTodoIds(
        items.map((t) => t.id),
      );
      return {
        items: items.map((t) => ({ ...t, tags: tagsByTodo.get(t.id) ?? [] })),
        total,
        limit,
        offset,
      };
    },

    async get(id) {
      const todo = await todoRepo.findById(id);
      if (!todo) {
        return null;
      }
      return attachTags(todo);
    },

    async create({ title, tagIds }) {
      const missing = await tagRepo.findMissingIds(tagIds);
      if (missing.length > 0) {
        return { kind: 'missing_tags', missing };
      }
      const created = await todoRepo.create(title);
      await todoRepo.replaceTags(created.id, tagIds);
      return { kind: 'ok', todo: await attachTags(created) };
    },

    async update(id, { version, title, completed, tagIds }) {
      if (tagIds !== undefined) {
        const missing = await tagRepo.findMissingIds(tagIds);
        if (missing.length > 0) {
          return { kind: 'missing_tags', missing };
        }
      }

      const updated = await todoRepo.updateWithVersion(id, version, {
        ...(title !== undefined && { title }),
        ...(completed !== undefined && { completed }),
      });

      if (!updated) {
        const existing = await todoRepo.findById(id);
        if (!existing) {
          return { kind: 'not_found' };
        }
        return { kind: 'conflict', currentVersion: existing.version };
      }

      if (tagIds !== undefined) {
        await todoRepo.replaceTags(id, tagIds);
      }
      return { kind: 'ok', todo: await attachTags(updated) };
    },

    async delete(id) {
      return todoRepo.delete(id);
    },
  };
}
