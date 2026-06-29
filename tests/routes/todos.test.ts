import { exports as workerExports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

function fetchApp(input: string, init?: RequestInit) {
  return workerExports.default.fetch(`http://localhost${input}`, init);
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function putJson(body: unknown): RequestInit {
  return {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function createTag(name: string) {
  const res = await fetchApp('/api/tags', postJson({ name }));
  return (await res.json()) as { id: number; name: string };
}

async function createTodo(body: { title: string; tagIds?: number[] }) {
  const res = await fetchApp('/api/todos', postJson(body));
  return {
    status: res.status,
    body: (await res.json()) as {
      id: number;
      title: string;
      version: number;
      tags: { id: number; name: string }[];
    },
  };
}

describe('todos handler 統合テスト', () => {
  it('CRUD 一通りが成功する', async () => {
    const tag = await createTag('work');
    const { status, body: created } = await createTodo({
      title: 'first',
      tagIds: [tag.id],
    });
    expect(status).toBe(201);
    expect(created.title).toBe('first');
    expect(created.version).toBe(1);
    expect(created.tags).toEqual([{ id: tag.id, name: 'work' }]);

    const getRes = await fetchApp(`/api/todos/${created.id}`);
    expect(getRes.status).toBe(200);

    const newTag = await createTag('private');
    const putRes = await fetchApp(
      `/api/todos/${created.id}`,
      putJson({
        version: 1,
        title: 'updated',
        completed: true,
        tagIds: [newTag.id],
      }),
    );
    expect(putRes.status).toBe(200);
    const updated = (await putRes.json()) as {
      version: number;
      title: string;
      completed: boolean;
      tags: { name: string }[];
    };
    expect(updated.version).toBe(2);
    expect(updated.title).toBe('updated');
    expect(updated.completed).toBe(true);
    expect(updated.tags.map((t) => t.name)).toEqual(['private']);

    const delRes = await fetchApp(`/api/todos/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(204);

    const getAfter = await fetchApp(`/api/todos/${created.id}`);
    expect(getAfter.status).toBe(404);
  });

  it('楽観的ロック: 古い version での更新は 409 を返す', async () => {
    const { body: created } = await createTodo({ title: 'lock' });
    const first = await fetchApp(
      `/api/todos/${created.id}`,
      putJson({ version: 1, title: 'v2' }),
    );
    expect(first.status).toBe(200);

    const conflict = await fetchApp(
      `/api/todos/${created.id}`,
      putJson({ version: 1, title: 'v3' }),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      message: 'version が一致しません',
      currentVersion: 2,
    });
  });

  it('ページネーション境界: limit/offset と total が一致する', async () => {
    for (let i = 0; i < 3; i++) {
      await createTodo({ title: `t${i}` });
    }
    const res = await fetchApp('/api/todos?limit=2&offset=1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { title: string }[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.total).toBe(3);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(1);
    expect(body.items.map((t) => t.title)).toEqual(['t1', 't2']);
  });

  it('存在しない tagIds 指定時は 400 を返す', async () => {
    const res = await fetchApp(
      '/api/todos',
      postJson({ title: 'x', tagIds: [9999] }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      message: '存在しないタグ id が含まれています',
      missing: [9999],
    });
  });

  it('todo 削除時に todo_tags が CASCADE 削除される', async () => {
    const tag = await createTag('cascade');
    const { body: created } = await createTodo({
      title: 'cascade-target',
      tagIds: [tag.id],
    });

    const delRes = await fetchApp(`/api/todos/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(204);

    // 同名タグを参照する todo を再作成 → tags が空であることで CASCADE 確認
    const { body: second } = await createTodo({ title: 'second' });
    expect(second.tags).toEqual([]);

    // tag テーブル自体は残っているので参照可能
    const tagsList = await fetchApp('/api/tags');
    const tags = (await tagsList.json()) as { name: string }[];
    expect(tags.some((t) => t.name === 'cascade')).toBe(true);
  });
});
