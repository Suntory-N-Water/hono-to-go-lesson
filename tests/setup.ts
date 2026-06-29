import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach } from 'vitest';

// 全テスト前に migrations を適用 (テーブル作成)
beforeAll(async () => {
  await applyD1Migrations(env.hono_to_go_lesson, env.TEST_MIGRATIONS);
});

// 各テスト前に行を全削除し独立性を担保 (テーブル定義は残す)
beforeEach(async () => {
  const db = env.hono_to_go_lesson;
  // 外部キー制約を考慮した順序で削除
  await db.exec('DELETE FROM todo_tags');
  await db.exec('DELETE FROM todos');
  await db.exec('DELETE FROM tags');
});
