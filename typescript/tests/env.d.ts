// テスト環境専用のバインディング型を Cloudflare.Env に追加する
// (worker-configuration.d.ts が同 namespace を宣言しているのを augmentation)
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    // biome-ignore lint/style/useConsistentTypeDefinitions: declaration merging のため interface が必須
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
