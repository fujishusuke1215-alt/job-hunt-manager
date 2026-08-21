# Googleデータ利用方針（ドラフト）

最終更新日: 2026-08-21

> **公開前ドラフト**
> Google OAuth同意画面、本人用公開サイト、プライバシーポリシーへ掲載する説明の基礎資料です。架空データdemoではGoogle機能を無効化しています。実Googleアカウントでの試験、運営者情報の記入、Google API Services User Data Policyと法令の本人確認・必要な法的レビューが終わるまで完成版として公開しません。

運営者: `[公開前に氏名または事業者名を記入]`

連絡先: `[公開前に問い合わせ用メールアドレスまたはフォームURLを記入]`

## 1. Googleデータを使う目的

Job Hunt Managerは、利用者本人を識別してPersonal modeを開き、本人の就活管理データを本人自身のGoogle Drive appDataFolderから読み書きするためだけにGoogleユーザーデータを使用します。

個人データを広告、信用評価、採用企業への提供、データ販売、一般企業検索の公開ページ作成には使用しません。

## 2. 要求するscope

| scope | 使用目的 |
| --- | --- |
| `openid` | Googleアカウントの安定した識別子`sub`を取得する |
| `email` | ログイン中のメールアドレスを本人へ表示する |
| `profile` | UserInfoの表示名とプロフィール画像URLをアカウント状態へ取得する（現在のUIでは未表示） |
| `https://www.googleapis.com/auth/drive.appdata` | アプリ専用の非表示領域にv2 JSONを読み書きする |

`drive`、`drive.readonly`、`drive.file`などの広いDrive scopeは要求しません。Gmail scope（`gmail.readonly`、`gmail.metadata`、`gmail.modify`、`mail.google.com`等）は要求しません。

## 3. 取得するGoogleデータ

- UserInfoの`sub`、メールアドレス、表示名、プロフィール画像URL（現在のUIに表示するのはメールアドレスだけ）
- appDataFolder内の`job-hunt-manager-data-v2.json`
- 同期判定に必要なDrive file ID、`version`、`modifiedTime`

通常のMy Driveファイル、共有ファイル、Spreadsheet、Gmail本文・件名・メタデータは取得しません。

## 4. 保存内容

appDataFolderのv2 JSONには、利用者が入力または承認した企業、選考、締切、評価、Research Fact、Watch Finding、設定、migration/import履歴等が含まれます。OAuth access token、Googleパスワード、2FA情報、Cookie、Client Secretは含めません。

`appDataFolder`は通常のGoogle Drive UIから見えず、作成したアプリだけがアクセスできる領域です。Personal dataを運営者の中央DBやSpreadsheetへ複製しません。

## 5. access tokenの扱い

Google Identity ServicesのToken modelを使用します。access tokenは実行中のAuth Providerのメモリだけに保持し、localStorage、sessionStorage、IndexedDB、JSON、Gitへ永続化しません。期限切れ時は利用者操作で再認可します。

logout時はメモリ上のtoken、アカウント表示、Personal stateをclearし、Googleのrevoke処理を呼びます。logoutだけではDrive上のappDataや端末へ書き出したJSONは削除されません。

## 6. データの利用・共有制限

Googleから受け取るデータは、本サービスの利用者向け機能を提供・改善するための必要範囲に限定します。

- Googleユーザーデータを販売しません。
- 広告配信やリターゲティングに使用しません。
- 第三者のAI APIへ自動送信しません。
- 人による閲覧を前提とする中央管理画面へ送信しません。
- GmailやWebを自動監視するために使用しません。

利用者が自分でJSONを書き出し、ChatGPT等へ共有した場合は利用者の明示操作であり、共有先の規約が適用されます。AI分析用JSONは既定で企業メモ、イベントメモ、選考場所を除外し、明示checkbox時だけまとめて含めます。

## 7. 保存、export、削除

- 利用者はv2 JSONを端末へexportできます。
- 利用者は企業・選考を個別削除できます。
- 「本人用データをすべて削除」はAppDataを空のv2状態へ置き換えます。空の技術的ファイルがappDataFolderに残る場合があります。
- v1移行時はデータ消失防止のため、元のlocalStorage v1とlegacy backupを即時削除しません。
- logoutまたはOAuthアクセス取消しで、既存のDriveデータや書き出し済みJSONが自動削除されるとは限りません。

一般公開前に、利用者がGoogle側のappDataを含む全データ削除を希望する場合の案内と問い合わせ手順を実アカウントで確認します。

## 8. セキュリティと同期制約

- JSONをZodでruntime validationし、不正データはcommitしません。
- Drive `version`とAppData `revision`を保存前に再確認し、差があれば自動上書きを停止します。
- 一時的なAPIエラーだけを有限回再試行し、権限不足等はpermanent failureとして表示します。
- 競合時はローカル案をJSON退避できる情報を返します。

remote確認とPATCHの間にはrace windowがあるため、原子的な競合防止や安全な自動mergeを保証しません。

## 9. 現在の検証状況

Mock transport/Authを使ったStorage/Auth担当の28テストで、empty/existing remote、save/load、retry、permanent failure、conflict、v1原文退避、未ログイン、ログイン成功・失敗、logout、account switchを確認しました。

本人のGoogle Client ID、OAuth同意画面、2FA、別端末を使う実Googleアカウント試験は未実施です。完了するまで「Google Drive実同期確認済み」とは表示しません。

## 10. 料金と構成

Google APIの標準利用は現時点で追加費用なしと案内されていますが、quotaと将来の超過課金方針は変更される可能性があります。本プロジェクトはBilling account、クレジットカード、quota引上げ、有料trialを設定しません。Google Cloud設定中にBilling接続を求められた場合は停止し、運営者本人が最新の公式情報を確認します。

## 11. 未実装機能

- Gmail API連携とメール監視
- 採用Webページの自動巡回
- バックエンドまたはschedulerによる定期処理
- 有料AI API呼出し
- 広告とPersonal dataを使う広告最適化

これらを将来追加する場合は、実装、scope、保存先、同意画面、公開文書を事前に見直します。

## 12. お問い合わせ

`[公開前にGoogleユーザーデータの照会・削除・苦情窓口を記入]`

## 公式資料と公開前確認

- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [GIS Token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Drive API scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Drive limits](https://developers.google.com/workspace/drive/api/guides/limits)

- [ ] 実Google OAuth同意画面のscopeと本文が一致している
- [ ] appDataFolderの作成、再読込、削除、別端末、競合を本人が確認した
- [ ] 運営者・問い合わせ先を記入した
- [ ] Googleの最新ポリシーと適用法令を本人または専門家が確認した
