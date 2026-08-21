# 初心者向け用語集

- **Webアプリ**: ブラウザーで操作するソフトウェア。
- **HTML**: 画面の文章や入力欄などの骨組み。
- **CSS**: 色、余白、配置などの見た目。
- **JavaScript**: ブラウザー内で操作に反応するプログラム。
- **TypeScript**: JavaScriptに「この値は文字列」などの型を加えたもの。
- **React**: 画面をコンポーネントという部品に分けて作る仕組み。
- **コンポーネント**: ボタン、企業カード、フォームなど再利用できる画面部品。
- **state（状態）**: 現在の企業一覧、検索語、選択中画面など、操作で変わる値。
- **props**: 親の部品から子の部品へ渡す値。
- **Node.js**: ブラウザー外でJavaScript系の開発道具を動かす環境。
- **パッケージ**: 他の開発者が公開した再利用可能なプログラム。
- **package.json**: 使用パッケージと起動・テスト方法を記す設定ファイル。
- **CRUD**: Create（登録）、Read（表示）、Update（更新）、Delete（削除）。
- **localStorage**: ブラウザーがサイトごとに持つ文字列の保存領域。
- **JSON**: データを文字列で保存・交換する形式。
- **build**: 開発用コードから配布できる完成版ファイルを作る処理。
- **lint**: コードの問題や書き方を自動検査する処理。
- **test**: 期待した結果になるか自動または手動で確認すること。
- **Git**: ファイルの変更履歴を残す仕組み。
- **repository**: Gitが履歴を管理するプロジェクト一式。
- **commit**: ある時点の変更を説明文付きで履歴へ保存すること。
- **diff**: 変更前後の差分。
- **branch**: 履歴を分岐させて作業する線。
- **localhost**: 自分のPC内で起動したWebアプリへアクセスする名前。
- **schemaVersion**: 保存データの設計が何世代目かを表す番号。v2は`2`。
- **migration**: 古い形のデータを、内容を保って新しい形へ変換する処理。
- **runtime validation**: 外から来たJSONを実行時に検査すること。今回はZodを使う。
- **Company Master**: 企業そのものを表す恒久ID付きデータ。
- **User Company**: 自分の応募状況、志望度、選考など、本人と企業の関係。
- **Research Fact**: 調査した値と、出典・確認日・年度・確認状態を一緒にした事実候補。
- **Scoring Profile**: 評価項目、最大点、weight、有効状態、順序のまとまり。
- **weight**: 各項目をどの比率で重視するか。合計100でなくても正規化する。
- **coverage**: 有効weightのうち、実際に評価済みのweight割合。
- **Repository pattern**: UIから保存方法を隠し、同じload/save契約で差し替える設計。
- **OAuth**: passwordをアプリへ渡さず、Google等から限定権限を得る仕組み。
- **scope**: OAuthで許可する機能範囲。Drive権限は`drive.appdata`だけで、本人識別用に`openid`、`email`、`profile`も要求する。
- **access token**: APIを呼べる短命の認可情報。今回はメモリだけに置く。
- **appDataFolder**: Google Driveの、アプリ専用で通常UIに見えない保存領域。
- **conflict**: 読込後に別端末等がremoteを変え、安全に自動上書きできない状態。
- **provider**: AuthやWatchの具体的な提供元を差し替えるための境界。
- **fingerprint**: 同じWatch情報を重複作成しないための識別値。

## Gitの4語を今回に当てはめる

- repository: `job-hunting-app` 全体
- commit: 「要件と設計資料を作成」などの節目
- diff: その節目で追加・変更した行
- branch: 今回の最初の履歴線は `main`

## ブラウザーからDriveまでを自分の言葉で説明する

```text
フォームを送信
→ React stateのAppDataV2を更新
→ StorageRepository.saveへ渡す
→ Zodで検証
→ remote versionとAppData revisionを再確認
→ 競合がなければappDataFolderのJSONを更新
→ 同期状態を画面へ表示
```

UIがDrive APIを直接呼ばないため、テストではMock Driveへ差し替えられます。

## v2の点数計算

ある項目の正規化値は`score / scaleMax`です。評価済み項目だけで100点換算し、未評価は0点として加えません。たとえばweight全体が100、評価済みweightが60ならcoverageは60%で、点数には「暫定」と表示します。

## 安全なJSON取込

```text
parse → validate → migrate/match → preview → 利用者が選択 → commit
```

preview前後で本データが変わらないことをテストしています。deleteは選択だけでなく追加確認も必要です。

## Windowsでよく使うコマンド

```powershell
pnpm install --frozen-lockfile
pnpm run dev
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:e2e
git status
git log --oneline
```

コマンドが失敗したら、同じものを繰り返す前に「エラー文」「実行場所」「Node/pnpmのversion」「lockfile」を確認します。
