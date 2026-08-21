# Google認証・Drive同期設計

更新日: 2026-08-21

## 実装範囲

v2はGoogle Identity Services（GIS）とDrive REST APIの実装を持ちます。実Googleアカウント、Client ID、2FAを使う確認は本人操作が必要なため、開発時はMock/contractテストまで行います。確認していない実接続を「同期確認済み」とは記載しません。

## なぜGIS Token modelか

今回のReact/Viteアプリにはバックエンドがありません。Googleのcode modelはrefresh tokenを安全に交換・保管するバックエンドを必要とするため、SPAからユーザー操作中にDrive REST APIを呼ぶ今回はGIS Token modelを採用します。

- `google.accounts.oauth2.initTokenClient()`を使用
- ユーザーのクリックから`requestAccessToken()`を呼ぶ
- access tokenはReact/providerのメモリだけに保持
- localStorage、sessionStorage、IndexedDB、Gitへtokenを保存しない
- 期限切れ時はユーザー操作で再認可
- logoutでtoken、アカウント表示、Personal stateをclear

公式資料: [GIS Token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)、[認可モデルの選択](https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model)

## Scope allowlist

実装で許可するのは次の4つだけです。

```text
openid
email
profile
https://www.googleapis.com/auth/drive.appdata
```

`drive`、`drive.readonly`、`drive.file`、Gmail scopeは使用しません。認証とAPI認可を分けるのが公式推奨ですが、バックエンドなしv2ではDrive access tokenとUserInfo取得成功をPersonal modeのゲートとして扱います。これはサーバー検証済みセッションではありません。

## Runtime mode

- `demo`: Google不要。架空データのみ。
- `local`: 開発・E2E専用。画面に「ローカル開発モード」を常時表示。
- `google`: Client ID設定後だけ有効。未設定ならPersonalを暗黙にlocalStorageへ切り替えない。
- `disabled`: 本番設定不足時。設定方法を表示し、Personalデータを保存しない。

## StorageRepository

```ts
interface StorageRepository {
  exists(): Promise<boolean>
  load(): Promise<StorageLoadResult>
  save(data: AppDataV2, expectedVersion?: string): Promise<StorageSaveResult>
  exportBackup(data: AppDataV2): string
  importBackup(raw: string): Promise<ImportPreview>
}
```

UIはDrive APIを直接呼びません。初期実装は`LocalDevelopmentStorageRepository`と`GoogleDriveStorageRepository`を持ちます。

## appDataFolder

正本ファイル名は`job-hunt-manager-data-v2.json`です。`appDataFolder`はDrive UIから見えず、作成アプリだけがアクセスできる領域です。

- list: `files.list`に`spaces=appDataFolder`
- create: metadataの`parents`へ`appDataFolder`
- load: `files.get?alt=media`
- update: upload endpointの`files.update`

同名ファイルは一意制約ではないため、複数見つけた場合は自動選択せず`conflict`にします。

公式資料: [appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)、[Drive scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

## 保存単位と再試行

フォーム入力中のキーごとには保存しません。企業・予定・評価・AI承認など、確定操作後のAppData変更を短いdebounceと直列write queueで保存します。

一時的な403理由、429、500、502、503、504だけを、jitter付きtruncated exponential backoffで有限回再試行します。401、権限不足、validation failureは自動再試行しません。

公式資料: [Drive errors](https://developers.google.com/workspace/drive/api/guides/handle-errors)、[limits/backoff](https://developers.google.com/workspace/drive/api/guides/limits)

## 競合

Drive API v3のFile resourceには`version`、`modifiedTime`等がありますが、files.updateの原子的な`If-Match`保証を公式資料で確認できませんでした。このため、次の保守的な方法を採ります。

1. load時のDrive `version`とAppData `revision`を保持。
2. save直前にremote metadataとcontentを再取得。
3. versionまたはrevisionが基準と異なればPATCHを行わない。
4. local案をJSONとして退避できる状態にする。
5. `競合`を表示し、「remote再読込」か「local JSON保存」を利用者に選ばせる。

再取得とPATCHの間には競合窓が残ります。実Google環境で条件付き更新の挙動を確認するまで、原子的競合防止とは説明しません。

## 同期状態

- 未ログイン
- 読み込み中
- 同期済み
- 保存中
- オフライン/失敗
- 競合

状態は利用者へ明示し、失敗中に「保存済み」と表示しません。

## 料金方針

Google公式では標準利用に追加費用なしと説明されていますが、2026年後半のquota超過課金予定も案内されています。Billing accountを接続せず、カード登録、quota引上げ、trialを行いません。設定時には[最新の公式limits/pricing](https://developers.google.com/workspace/drive/api/guides/limits)を本人が再確認します。

