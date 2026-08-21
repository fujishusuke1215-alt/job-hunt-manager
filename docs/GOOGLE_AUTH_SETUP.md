# Google認証・Drive APIセットアップ

更新日: 2026-08-21

この手順はGoogle実接続を本人が確認するときだけ使います。CodexはGoogleパスワード、2FA、Client Secretを入力しません。Billing account、カード、quota引上げ、有料trialを設定しないでください。

## 0. 先に確認

Google Drive APIの公式料金・quota説明は変更され得ます。[公式limits/pricing](https://developers.google.com/workspace/drive/api/guides/limits)を確認し、Billing接続を求められた場合は中止してください。

## 1. Google Cloud Projectを作る

1. [Google Cloud Console](https://console.cloud.google.com/)を開く。
2. 画面上部のProject選択を押す。
3. `NEW PROJECT`を押し、Job Hunt Manager用Projectを作る。
4. Billing accountの接続画面が出たら接続せず中止する。

## 2. Drive APIだけを有効化

1. `APIs & Services > Library`を開く。
2. `Google Drive API`を検索する。
3. Google Drive APIだけを開き、`Enable`を押す。
4. Gmail APIは有効にしない。

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

最初の試験利用は`Audience > External > Testing`にし、利用するGoogleアカウントを`Test users`へ1件ずつ追加します。Testingは最大100 test usersで、`drive.appdata`を含む認可は7日で失効し得るため、再接続が必要になる場合があります。50人規模の試験はこの上限内ですが、実際にProductionへ切り替える前にVerification Centerとポリシーを本人が確認します。

## 4. Web OAuth client

`Google Auth Platform > Clients > Create Client > Web application`を選びます。

Authorized JavaScript originsへ例として次を登録します。

```text
http://localhost:5173
https://fujishusuke1215-alt.github.io
```

公開サイトのoriginは`https://fujishusuke1215-alt.github.io/job-hunt-manager/`ではなく、schemeとhostだけの`https://fujishusuke1215-alt.github.io`です。originにpath、query、fragment、wildcardを含めません。GIS Token modelのpopup方式では今回redirect URIを追加しません。

## 5. ローカル確認用Client ID

`.env.example`を`.env.local`へコピーし、Web Client IDだけを設定します。

```text
VITE_STORAGE_MODE=google
VITE_GOOGLE_CLIENT_ID=ここへWeb Client ID
```

Client SecretはSPAへ置きません。`.env.local`はGit対象外です。

## 6. GitHub PagesへClient IDを渡す

Client IDは公開SPAで使う識別子でありClient Secretではありませんが、ソースへ固定せずRepository Variableとして管理します。

1. GitHubで`fujishusuke1215-alt/job-hunt-manager`を開く。
2. `Settings`を開く。
3. `Secrets and variables > Actions`を開く。
4. `Variables`タブを選ぶ。
5. `New repository variable`を押す。
6. Nameへ`VITE_GOOGLE_CLIENT_ID`、ValueへWeb OAuth Client IDを入力する。
7. `Add variable`を押す。
8. `Actions > Deploy public demo to GitHub Pages`を開く。
9. `Run workflow`を押し、`source` branchを選んで実行する。

workflowは`${{ vars.VITE_GOOGLE_CLIENT_ID }}`をVite buildだけへ渡します。access token、password、2FA、Client SecretをGitHub Variableへ入れてはいけません。

## 7. 確認内容

1. Google認可ボタンを本人が押す。
2. scopeが上記4つだけか確認する。
3. appDataFolderへ新規データを作る。
4. 再読込で同じデータを読む。
5. 別端末で同じGoogleアカウントを使う。
6. 競合表示とJSON退避を確認する。
7. logout後に別Googleアカウントへ接続し、前のアカウントの企業が表示されないことを確認する。

この本人確認が終わるまで、成果物上は「Google実アカウント未確認、Mock/contract確認済み」と表現します。

## 公式資料

- [Drive JavaScript quickstart](https://developers.google.com/workspace/drive/api/quickstart/js)
- [GIS Token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Drive scope一覧](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Auth Platformの開始](https://support.google.com/cloud/answer/15544987)
- [AudienceとTesting](https://support.google.com/cloud/answer/15549945)
- [GitHub Actions variables](https://docs.github.com/en/actions/concepts/workflows-and-actions/variables)
