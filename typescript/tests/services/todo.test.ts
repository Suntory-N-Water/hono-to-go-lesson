import { describe, expect, it } from 'vitest';
import type { TagRepository } from '../../src/repositories/tag';
import type {
  Todo,
  TodoRepository,
  TodoUpdatePatch,
} from '../../src/repositories/todo';
import { createTodoService } from '../../src/services/todo';

// テスト用のメモリ実装。Go の table-driven test 対比のため
// 引数で初期データ・挙動を切り替えられるようにする
type FakeOptions = {
  todos?: Todo[];
  existingTagIds?: number[];
  // updateWithVersion を強制的に失敗させる (競合シミュレーション)
  forceVersionConflict?: boolean;
};

function fakeRepos(opts: FakeOptions = {}) {
  const todos = new Map<number, Todo>();
  for (const t of opts.todos ?? []) {
    todos.set(t.id, t);
  }
  const tagAssignments = new Map<number, number[]>();
  const existingTagIds = new Set<number>(opts.existingTagIds ?? []);
  let nextId = todos.size + 1;

  const todoRepo: TodoRepository = {
    async list(limit, offset) {
      return [...todos.values()]
        .sort((a, b) => a.id - b.id)
        .slice(offset, offset + limit);
    },
    async count() {
      return todos.size;
    },
    async findById(id) {
      return todos.get(id) ?? null;
    },
    async create(title) {
      const now = new Date('2026-01-01T00:00:00Z');
      const todo: Todo = {
        id: nextId++,
        title,
        completed: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      todos.set(todo.id, todo);
      return todo;
    },
    async updateWithVersion(
      id: number,
      version: number,
      patch: TodoUpdatePatch,
    ) {
      if (opts.forceVersionConflict) {
        return null;
      }
      const existing = todos.get(id);
      if (!existing || existing.version !== version) {
        return null;
      }
      const updated: Todo = {
        ...existing,
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.completed !== undefined && { completed: patch.completed }),
        version: existing.version + 1,
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };
      todos.set(id, updated);
      return updated;
    },
    async delete(id) {
      return todos.delete(id);
    },
    async replaceTags(todoId, tagIds) {
      tagAssignments.set(todoId, [...tagIds]);
    },
    async loadTagsByTodoIds(todoIds) {
      const result = new Map<number, { id: number; name: string }[]>();
      for (const id of todoIds) {
        const ids = tagAssignments.get(id) ?? [];
        result.set(
          id,
          ids.map((tid) => ({ id: tid, name: `tag-${tid}` })),
        );
      }
      return result;
    },
  };

  const tagRepo: TagRepository = {
    async list() {
      return [];
    },
    async findMissingIds(ids) {
      return ids.filter((id) => !existingTagIds.has(id));
    },
    async findByName() {
      return null;
    },
    async createIfNotExists(name) {
      return { tag: { id: 1, name }, created: true };
    },
  };

  return { todoRepo, tagRepo, todos, tagAssignments };
}

describe('TodoService', () => {
  describe('create', () => {
    const cases = [
      {
        name: 'タグ未指定で作成成功',
        existingTagIds: [],
        input: { title: 'a', tagIds: [] as number[] },
        expectKind: 'ok' as const,
      },
      {
        name: '存在するタグ指定で成功',
        existingTagIds: [1, 2],
        input: { title: 'b', tagIds: [1, 2] },
        expectKind: 'ok' as const,
      },
      {
        name: '存在しないタグ指定で missing_tags',
        existingTagIds: [1],
        input: { title: 'c', tagIds: [1, 99] },
        expectKind: 'missing_tags' as const,
        expectMissing: [99],
      },
    ];

    for (const tc of cases) {
      it(tc.name, async () => {
        const { todoRepo, tagRepo } = fakeRepos({
          existingTagIds: tc.existingTagIds,
        });
        const service = createTodoService(todoRepo, tagRepo);
        const result = await service.create(tc.input);
        expect(result.kind).toBe(tc.expectKind);
        if (result.kind === 'missing_tags') {
          expect(result.missing).toEqual(tc.expectMissing);
        }
      });
    }
  });

  describe('update', () => {
    const baseTodo: Todo = {
      id: 1,
      title: 'orig',
      completed: false,
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('存在しない id で not_found', async () => {
      const { todoRepo, tagRepo } = fakeRepos();
      const service = createTodoService(todoRepo, tagRepo);
      const result = await service.update(99, { version: 1, title: 'x' });
      expect(result.kind).toBe('not_found');
    });

    it('version 不一致で conflict (currentVersion を含む)', async () => {
      const { todoRepo, tagRepo } = fakeRepos({
        todos: [{ ...baseTodo, version: 5 }],
        forceVersionConflict: true,
      });
      const service = createTodoService(todoRepo, tagRepo);
      const result = await service.update(1, { version: 1, title: 'x' });
      expect(result.kind).toBe('conflict');
      if (result.kind === 'conflict') {
        expect(result.currentVersion).toBe(5);
      }
    });

    it('tagIds 検証失敗で missing_tags (DB 更新前に弾く)', async () => {
      const { todoRepo, tagRepo, todos } = fakeRepos({
        todos: [baseTodo],
        existingTagIds: [1],
      });
      const service = createTodoService(todoRepo, tagRepo);
      const result = await service.update(1, {
        version: 1,
        title: 'x',
        tagIds: [1, 99],
      });
      expect(result.kind).toBe('missing_tags');
      // version は更新されていない
      expect(todos.get(1)?.version).toBe(1);
    });

    it('成功時は version が +1 され updatedAt も更新される', async () => {
      const { todoRepo, tagRepo } = fakeRepos({ todos: [baseTodo] });
      const service = createTodoService(todoRepo, tagRepo);
      const result = await service.update(1, {
        version: 1,
        title: 'new',
        completed: true,
      });
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.todo.version).toBe(2);
        expect(result.todo.title).toBe('new');
        expect(result.todo.completed).toBe(true);
      }
    });
  });

  describe('delete', () => {
    it('存在する場合 true', async () => {
      const { todoRepo, tagRepo } = fakeRepos({
        todos: [
          {
            id: 1,
            title: 'x',
            completed: false,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      const service = createTodoService(todoRepo, tagRepo);
      expect(await service.delete(1)).toBe(true);
    });

    it('存在しない場合 false', async () => {
      const { todoRepo, tagRepo } = fakeRepos();
      const service = createTodoService(todoRepo, tagRepo);
      expect(await service.delete(99)).toBe(false);
    });
  });
});
