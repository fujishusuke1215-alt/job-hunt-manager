# はじめに読む資料

## このアプリは何か

Job Hunt Manager v2は、応募・検討企業を登録した後の「選考、締切、評価、根拠付き採用情報、変化」を1か所で管理するWebアプリです。企業検索サイトではなく、自分が受ける企業を継続管理する道具です。

## 5分で試す

1. [公開デモ](https://fujishusuke1215-alt.github.io/job-hunt-manager/)を開く。またはPowerShellで `pnpm run dev` を実行し、表示URLを開く。
2. 右上が「公開デモ」であることを確認する。
3. 「企業・選考管理」で検索、企業カード、選考予定を試す。
4. 「評価設定」でプロファイルを複製し、評価項目を変更する。
5. 「AI同期」で `docs/09_AI_SYNC_FORMAT.md` の架空JSONをpreviewする。
6. 「Watch」で、承認済みの変化だけが表示されることを確認する。
7. 本人用を押し、「ローカル開発モード」と明示されることを確認する。

## 読む順番

1. [01_REQUIREMENTS.md](01_REQUIREMENTS.md): 何を作ったか
2. [02_ARCHITECTURE.md](02_ARCHITECTURE.md): 画面から保存まで
3. [07_DATA_MODEL_V2.md](07_DATA_MODEL_V2.md): なぜ企業と本人情報を分けたか
4. [08_GOOGLE_DRIVE_SYNC.md](08_GOOGLE_DRIVE_SYNC.md): 同期と競合停止
5. [09_AI_SYNC_FORMAT.md](09_AI_SYNC_FORMAT.md): AI候補の安全な取込
6. [10_WATCH_ARCHITECTURE.md](10_WATCH_ARCHITECTURE.md): 今回と将来のWatch境界
7. [evidence/INDEX.md](evidence/INDEX.md): Phase 0〜17の実際の履歴
8. [portfolio/INTERVIEW_GUIDE.md](portfolio/INTERVIEW_GUIDE.md): 面接練習
9. [evidence/phase-18-public-deployment/README.md](evidence/phase-18-public-deployment/README.md): URL公開と最小payload

## フォルダー案内

| 場所 | 現在の役割 |
|---|---|
| `src/domain/` | schema v2、migration、scoring、matching、AI Sync、Watch |
| `src/repositories/` | Catalogと保存先の境界、Local/Google Drive実装 |
| `src/providers/` | Google認証、Watch providerの境界 |
| `src/components/` | 既存UIトーンを保った各画面 |
| `src/data/` | 完全な架空デモと静的Company Catalog |
| `src/services/storage.ts` | v1初版の互換・歴史的実装。v2の正規境界はrepositories |
| `e2e/` | Edgeでの主要導線とWebアプリだけの撮影 |
| `docs/evidence/` | フェーズ、エラー、復習、30秒説明 |
| `docs/public/` | 将来公開前に本人確認する法的文書draft |

## モードの違い

| モード | データ | 保存 |
|---|---|---|
| 公開デモ | 同梱の架空企業のみ | 外部保存なし。再読込で初期化 |
| ローカル開発 | 本人用の開発確認 | localStorage。画面に明示 |
| Google本人用 | Googleログインした本人 | Drive appDataFolder。設定後のみ |

本番buildで設定がないのに、本人用を黙ってlocalStorageへ落とす設計ではありません。

## 初心者が説明できるべき4点

- Company Masterは企業そのもの、User Companyは自分と企業の関係。
- Scoring Profileのweightは比率で、未評価は0点にせずcoverageへ反映。
- AI Syncは候補をvalidation/previewし、承認後だけ本データを変える。
- StorageRepositoryにより、画面はlocalStorageやDrive APIを直接知らない。

## 安全上の約束

公開デモ、テスト、証跡画像は架空データだけです。password、token、Cookie、API key、実応募情報、担当者連絡先は保存しません。Google実アカウント試験は未実施で、本人認証・2FA・Client ID作成は利用者本人の作業です。
