# Job Hunt Manager v2 ポートフォリオ要約

公開デモ: <https://fujishusuke1215-alt.github.io/job-hunt-manager/>

## 何を作ったか

応募・検討企業を登録した後、選考、締切、自分の評価、根拠付き採用情報、ChatGPT調査から得た変化を一元管理するReact/TypeScriptアプリです。企業検索ではなく「登録後の継続管理」を中心にしています。

## 実際の課題

約50社規模になると、企業情報、応募資格、テスト、面接、締切、優先度が複数のページ・メール・会話へ分散します。初版を使う中で、1つのCompanyへ企業情報と本人情報が混在し、固定weight、1ブラウザー保存、出典なし情報、AI結果の手作業反映が次の課題になりました。

## v1からv2への改善

| v1 | v2 |
|---|---|
| Company文字列中心 | Company Master恒久ID + User Company |
| 固定8項目weight | 編集可能なScoring Profile/Criteria |
| 未評価の意味が曖昧 | 暫定score + coverage |
| 値だけの採用情報 | Research Fact + Source + 確認状態 |
| AI結果を手作業転記 | Zod検証 + diff preview + 個別承認 |
| Watch構造なし | Finding/Run、fingerprint dedup、Center |
| localStorage v1 | StorageRepository、v2、Drive境界 |

## 主な技術判断

既存UIとGit履歴を守り、React/Viteを維持しました。今回の手動同期はSPAで成立するため、FastAPI、PostgreSQL、Docker、Next.js、有料APIを追加していません。一方、将来backendを加えられるようAuth/Storage/Catalog/Watchをinterfaceで分離し、AIは`analyze`/`normalize`を持つ将来用contractだけを定義しました。外部AI実装やAPI呼出しはありません。

## 安全性

- v1原文をvalidation前に退避し、旧keyを即削除しない。
- 外部JSONをZodで検証し、preview前はstate不変。
- 曖昧な企業照合とAI deleteを自動実行しない。
- Drive scopeは`drive.appdata`だけ。Gmail scopeなし。
- tokenはメモリだけ、URLはhttp/httpsだけ。
- demo/test/screenshotは完全な架空企業だけ。

## 品質

- TypeScript / ESLint / production build: 成功
- unit/component: 119件成功（24ファイル）
- Microsoft Edge E2E: 機能フロー6件＋証跡撮影2件、計8件成功
- Google Auth/Drive Mock/contract: 28件成功
- 実Googleアカウント接続: 未実施（確認済みと誇張しない）

## 説明できる強み

完成画面だけでなく、非破壊migration、domain分離、動的計算、transaction的AI import、同期競合停止、Mockによる外部API検証、Gitの段階的改善を説明できます。また、AI協働範囲と未確認範囲を明示しています。

## 現在の限界

Gmail自動監視、採用Web定期巡回、browserを閉じた後のscheduler、一般企業検索、広告は未実装です。Google実接続と複数端末実機試験も本人操作後の確認項目です。

公開URLは架空デモ専用で、本人用保存は無効です。GitHub Pagesへ送ったのはproduction build 4ファイルだけで、ソース・Git履歴・学習資料は非公開です。
