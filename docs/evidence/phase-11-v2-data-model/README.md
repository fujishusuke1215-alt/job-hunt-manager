# Phase 11: v2データモデルと安全なv1移行

## 1. このフェーズで何をしたか

1人用の`Company[]`を、`schemaVersion: 2`の`AppDataV2`へ発展させました。企業そのもの、本人の応募情報、根拠付き調査情報、評価設定、Watch結果を別の型として定義し、Zodによる実行時検証とv1移行を実装しました。

## 2. なぜこの作業が必要なのか

v1の`Company`には、共通の企業情報と本人だけの選考・評価・メモが混在していました。そのままGoogle Drive同期や企業マスタを足すと、データの所有者が分からなくなり、形式変更時の消失リスクも高くなるためです。

## 3. 変更前

- 保存形式は`schemaVersion: 1`の`Company[]`でした。
- 企業名、応募状況、採用情報、固定評価点、選考予定が1つの型に入っていました。
- 外部JSONはTypeScript型だけでは実行時に安全性を確認できませんでした。
- v1から大きく構造を変える移行経路はありませんでした。

## 4. 変更内容

- `AppDataV2`へ`revision`、`userCompanies`、`researchFacts`、`scoringProfiles`、`evaluations`、`watchRuns`、`watchFindings`、設定、移行履歴を分離しました。
- Catalogは個人データとは別の`CatalogData`としました。
- Zodでv1・v2・Research Fact等を実行時検証するschemaを作りました。
- v1移行前に元のJSON文字列を日時付きlegacy backup keyへそのまま退避し、元のv1キーも削除しない実装にしました。
- v1の企業ID、選考予定、メモ、作成・更新日時を可能な限り保持しました。
- 出典のなかった応募資格やテスト情報は、`source: legacy`、`verificationLevel: unverified`、`checkedAt: null`のResearch Factへ移しました。
- 旧ランキングを再現する`Legacy v1`プロファイルを移行直後のactive profileにしました。
- 不正な入力はparse・validate段階で止め、現在データへcommitしない境界を作りました。

## 5. 変更後

保存形式の責務が分かれ、v2の機能を追加しても既存の応募状況やメモを失いにくくなりました。v1原文、旧キー、v2移行履歴が残るため、移行結果に問題があっても元データを追跡できます。v2全体ではunit/component test 119件が成功しています。

## 6. スクリーンショット

このフェーズは画面ではなくデータ境界を作るdomain phaseのため、専用スクリーンショットはありません。コード、runtime schema、移行テストを証跡とします。

## 7. スクリーンショットの見方

画像の代わりに、`migration.test.ts`で移行前後の企業数、ID、events、memo、旧点数、legacy Factを比較します。`localDevelopmentStorage.test.ts`では、v1原文がlegacy backupへ同一文字列のまま残ることを確認します。

## 8. 主なファイル

- `src/domain/types.ts`: v2の型と各概念の境界
- `src/domain/schemas.ts`: Zodによるruntime validation
- `src/domain/v1.ts`: 旧形式を読むための厳密なschema
- `src/domain/migration.ts`: v1からv2への純粋な変換
- `src/domain/migration.test.ts`: ID、予定、メモ、旧点数、legacy Factの検証
- `src/repositories/localDevelopmentStorage.ts`: v1原文退避、検証、v2保存の順序
- `src/repositories/types.ts`: parse → validate → migrate → preview → commitの保存境界

## 9. 主なコマンド

- `pnpm install --frozen-lockfile`: lockfileを正本として依存関係を再構築。
- `pnpm run test`: unit/component test 119件を実行。
- `pnpm run build`: TypeScript型検査とVite完成版生成を確認。
- `git diff --check`: 証跡を含む差分の空白エラーを確認。

## 10. 発生したエラー

ZIPに含まれていた`node_modules`はpnpmのリンク構造が保たれておらず、そのままでは依存パッケージを安定して解決できませんでした。

## 11. 原因

pnpmの`node_modules`は実体へのリンクを使います。ZIP作成・展開をまたぐと、そのリンク関係が壊れることがあるためです。ソースやGit履歴の問題ではありませんでした。

## 12. 修正

先に`package.json`と`pnpm-lock.yaml`を確認し、生成物である`node_modules`だけをlockfileから再構築しました。ソース、docs、既存Git履歴、v1データは削除していません。

## 13. 覚える言葉

- **schemaVersion**: 保存形式の世代を見分ける番号。
- **migration**: 古いデータを意味を保ったまま新形式へ変換する処理。
- **runtime validation**: 実行時に外部データの形と値を確認すること。
- **repository**: UIから保存方法を切り離す境界。
- **transactional import**: 検証が全部成功するまで本データを変更しない取込方法。

## 14. 面接30秒説明

「初版では企業情報と個人の選考情報が1つのCompany型に混在していました。v2ではUser Company、Research Fact、評価、Watch、Catalogを分け、Zodで外部JSONを検証しています。v1移行では原文を先に退避し、ID・予定・メモを保持し、出典不明情報は未確認Factへ移すことでデータ消失を防ぎました。」

## 15. 理解度チェック

1. なぜ企業名を個人データ全体の主キーにしないのですか。
2. TypeScript型があってもZodが必要なのはなぜですか。
3. v1の出典不明情報を`official_confirmed`にしない理由は何ですか。
4. 移行前にv1原文を残す目的は何ですか。

## 16. 答え

1. 名称変更や表記揺れがあり、恒久的な識別子にならないためです。
2. JSON、localStorage、Drive等から来る値は実行時には型を保証されないためです。
3. 根拠が保存されておらず、公式情報だと証明できないためです。
4. 変換結果に問題があった場合の確認・復旧材料を残すためです。

## 17. 5分復習

- 1分: `AppDataV2`の主要配列を声に出して説明する。
- 2分: v1原文退避からv2保存までの順番を書く。
- 1分: `legacy / unverified / checkedAt: null`の意味を説明する。
- 1分: 面接30秒説明を資料を見ずに話す。
