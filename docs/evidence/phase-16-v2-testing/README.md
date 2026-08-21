# Phase 16: v2テスト・回帰確認

## 1. このフェーズで何をしたか

v2のデータ移行、動的評価、Company Master、Research Fact、AI Sync、Watch、保存Repository、Google Auth境界と、既存の企業・選考管理を自動テストしました。unit/component testは119件、Playwrightは機能E2E 6件と証跡撮影2件の計8件が成功し、lint、TypeScript検査、buildも成功しました。

## 2. なぜこの作業が必要なのか

今回の変更はデータ保存形式と主要画面の両方へ影響します。新機能が表示できるだけでなく、v1データが消えないこと、AI候補が承認前に反映されないこと、同期競合で黙って上書きしないこと、既存CRUDが壊れていないことを再現可能な方法で確認する必要がありました。

## 3. 変更前

v1には企業CRUD、選考予定、localStorage、JSON backup等のテストがありましたが、schema v2 migration、任意scale/weight、曖昧な企業照合、AI差分承認、Watch重複排除、Drive retry/conflict、Auth状態等のテストはありませんでした。

## 4. 変更内容

- v1企業数、ID、events、memo、旧評価点、legacy Research Fact、invalid v1時の非破壊性を確認しました。
- AppDataとCatalogのID重複、孤児参照、評価範囲、active profile、merge循環等をruntime validationで拒否することを確認しました。
- 任意scaleMax・weight、coverage、未評価null、disabled項目、名称・weight・scale変更を確認しました。
- Master ID、alias、正規化名、公式domain、複数候補停止、独自企業、後からのlinkを確認しました。
- Source、checkedAt、recruitingCycle、verification level、AI処理表示を確認しました。
- AI Syncのvalid/invalid、preview中のstate不変、部分選択、曖昧照合停止、operationId重複、delete追加確認、同一Envelope内の企業作成後の関連Fact/Event/Finding、commit後の再検証を確認しました。
- Watch Findingの取込、Watch Run記録、fingerprint重複排除、completed保持、status変更、watch無効企業の除外、今日の要対応順を確認しました。
- Mock Google Driveでempty remote、existing remote、save/load、403/429 retry、恒久失敗、競合停止を確認しました。
- Mock Authで未ログイン、成功、失敗、logout、account switchを確認しました。
- backup importがRepositoryのpreview/commitを通り、保存失敗・競合時に現在画面を置き換えないことと、同期競合中は本人用編集を停止してlocal案を退避することを確認しました。
- Local Development Modeの実ブラウザーでデモ、本人用企業CRUD、評価設定、AI Sync、Watch、v1 migration、v2 backupを確認しました。

## 5. 変更後

unit/component test 119件、機能E2E 6件、証跡撮影2件、lint、TypeScript検査、buildがすべて成功しました。Google API部分は実アカウントをCIや自動テストへ要求せず、Mockとcontractで分岐・retry・conflictを確認できる状態です。ただしGoogle本人ログインと実Drive `appDataFolder`への保存は未試験です。

## 6. スクリーンショット

このPhaseではテスト結果をコマンドの成功ログとして確認し、新しい画面スクリーンショットは追加していません。Google実アカウント画面、OAuth token、個人データを証跡画像へ残していません。画面の確認資料はPhase 14の完全な架空データ画像を参照します。

## 7. スクリーンショットの見方

Phase 14の画像を見る場合は、AI Syncで承認前と承認後が分かれている点と、Watch Centerに手動取込だけである旨が表示される点を確認します。Phase 16の合否は画像ではなく、同じコマンドを再実行できる自動テスト件数と終了コードを証跡にしています。

## 8. 主なファイル

- `src/domain/migration.test.ts`: v1保持とschema v2 migration。
- `src/domain/schemas.test.ts`: ID・参照・評価範囲・Catalog mergeの整合性。
- `src/domain/scoring.test.ts`、`src/domain/profileManagement.test.ts`: 動的評価と設定変更。
- `src/domain/companyMatching.test.ts`: Master候補照合と曖昧一致停止。
- `src/domain/aiSync.test.ts`、`src/components/AiSync.test.tsx`: AI Syncのvalidation、preview、選択commit。
- `src/domain/watch.test.ts`、`src/components/WatchCenter.test.tsx`: Watch重複排除、並び順、表示と操作。
- `src/repositories/googleDriveStorage.test.ts`: retry、恒久失敗、競合。
- `src/providers/auth.test.ts`、`src/providers/googleAuth.test.ts`: Auth contractとGoogle実装境界。
- `src/services/storage.test.ts`、`src/domain/backup.test.ts`: local migrationとv1/v2 backup。
- `src/App.test.tsx`、`src/App.google.test.tsx`、`src/components/DataTools.test.tsx`: 競合ロック、logout即時clear、transactional import。
- `e2e/core-flow.spec.ts`: Local Development Modeでの6つの主要フロー。

## 9. 主なコマンド

- `pnpm run lint`: ESLintによる静的検査。成功。
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: TypeScript型検査。成功。
- `pnpm run test`: unit/component test 119件。成功。
- `pnpm run test:e2e`: Playwright機能E2E 6件＋証跡撮影2件、計8件。修正後に成功。
- `pnpm run build`: 型検査とVite本番build。成功。

## 10. エラー

最初のE2E実行では、AI Syncの差分確認で`getByText`を使った箇所が、同じ文字列を含むJSON入力用`textarea`と差分カードの`heading`の2候補に一致し、Playwright strict mode違反で失敗しました。

## 11. 原因

`getByText`は役割を限定せず文字列から要素を探します。貼り付けたJSONにも候補タイトルが含まれていたため、利用者が見ている差分カード見出しだけを一意に指定できていませんでした。アプリの反映処理やAI Sync validationの失敗ではなく、E2E locatorの曖昧さが原因でした。

## 12. 修正

locatorを`getByRole('heading', { name: ... })`へ変更し、「見出し」という意味と名称の両方で差分カードを特定しました。その後、機能E2E 6件と証跡撮影2件を再実行してすべて成功し、unit/component 119件、lint、TypeScript、buildも再確認しました。

## 13. 覚える言葉

- regression test: 以前動いていた機能が変更後も壊れていないか確かめるテスト。
- unit test: 小さな関数や規則を分離して確認するテスト。
- component test: React画面を利用者操作に近い形で確認するテスト。
- E2E: ブラウザーで複数画面と保存を通した一連の流れを確認するテスト。
- strict mode: locatorが複数要素へ一致した場合、曖昧な操作を止めるPlaywrightの安全機能。
- mock: 実Googleアカウント等を使わず、外部サービスの応答を再現するテスト用実装。

## 14. 面接30秒説明

「v2では移行、動的評価、企業照合、AI差分承認、Watch、Drive競合、Authをunit/component 119件と機能E2E 6件で確認し、証跡撮影2件、lint・型検査・buildも成功しています。最初のE2Eでは文字列locatorがtextareaと見出しの両方へ一致したため、role headingで意味を限定して修正しました。Google DriveはMockまでで、実アカウント試験は未実施と明記しています。」

## 15. 理解度チェック

1. unit/component testとE2Eの両方を実行する理由は何ですか。
2. Playwright strict modeが失敗したのはアプリ機能の不具合ですか。
3. `getByRole('heading')`が`getByText`より今回適切だった理由は何ですか。
4. Google Driveについて何が確認済みで、何が未確認ですか。

## 16. 答え

1. 小さな規則の原因特定しやすさと、ブラウザー全体を通した利用者フローの確かさを両立するためです。
2. 今回は違います。同じ文字列を持つ2要素へlocatorが一致した、テスト指定の曖昧さでした。
3. 差分カードのタイトルという役割まで限定でき、JSON文字列を含むtextareaを候補から除外できるためです。
4. Mockでload/save、403/429 retry、恒久失敗、競合停止を確認済みです。本人のGoogleログイン、OAuth同意、実Drive `appDataFolder`での端末間同期は未実施です。

## 17. 5分復習

- 1分: 119件のunit/component、6件の機能E2E、2件の撮影テストがそれぞれ守る範囲を説明する。
- 1分: migrationで絶対に失ってはいけないv1データを挙げる。
- 1分: strict modeエラーの原因とrole locatorによる修正を説明する。
- 1分: Mock Driveで確認したretry・failure・conflictを説明する。
- 1分: 「Google実アカウント試験は未実施」と、実施済み範囲を誇張せず説明する。
