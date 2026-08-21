# Google認証・Drive APIセットアップ

更新日: 2026-08-21

この手順はGoogle実接続を本人が確認するときだけ使います。CodexはGoogleパスワード、2FA、Client Secretを入力しません。Billing account、カード、quota引上げ、有料trialを設定しないでください。

## 0. 先に確認

Google Drive APIの公式料金・quota説明は変更され得ます。[公式limits/pricing](https://developers.google.com/workspace/drive/api/guides/limits)を確認し、Billing接続を求められた場合は中止してください。

## 1. Project

Google Cloud Consoleで専用Projectを作成します。Billingは接続しません。

## 2. Drive APIだけを有効化

`APIs & Services > Library`から`Google Drive API`だけを有効にします。Gmail APIは有効にしません。

## 3. Google Auth Platform

2026年時点の画面では次を設定します。

- `Branding`: App name、User support email、Developer contact
- `Audience`: 個人GoogleアカウントならExternal。開発中はTestingとTest users
- `Data Access`: 次の4 scopeだけ

```text
openid
email
profile
https://www.googleapis.com/auth/drive.appdata
```

Testingの認可は条件により7日で失効する可能性があります。

## 4. Web OAuth client

`Google Auth Platform > Clients > Create Client > Web application`を選びます。

Authorized JavaScript originsへ例として次を登録します。

```text
http://localhost:5173
```

originにpath、query、fragment、wildcardを含めません。本番はHTTPSと所有ドメインが必要です。

## 5. Client ID

`.env.example`を`.env.local`へコピーし、Web Client IDだけを設定します。

```text
VITE_STORAGE_MODE=google
VITE_GOOGLE_CLIENT_ID=ここへWeb Client ID
```

Client SecretはSPAへ置きません。`.env.local`はGit対象外です。

## 6. 確認内容

1. Google認可ボタンを本人が押す。
2. scopeが上記4つだけか確認する。
3. appDataFolderへ新規データを作る。
4. 再読込で同じデータを読む。
5. 別端末で同じGoogleアカウントを使う。
6. 競合表示とJSON退避を確認する。

この本人確認が終わるまで、成果物上は「Google実アカウント未確認、Mock/contract確認済み」と表現します。

## 公式資料

- [Drive JavaScript quickstart](https://developers.google.com/workspace/drive/api/quickstart/js)
- [GIS Token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Drive scope一覧](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

