# はじめに読む資料

## このアプリは何か

Job Hunt Manager は、複数企業の応募条件、評価、選考予定、締切、面接メモを1か所で管理する、個人用の就活管理Webアプリです。締切の見落としと、情報が複数のメモに散らばる問題を減らします。

このプロジェクトには、アプリだけでなく「何を、なぜ、どう作ったか」を後から学び直せる資料も含めます。実用品・就活ポートフォリオ・初心者の学習証跡を同じ重さで扱います。

## 使う技術

- React: 画面を小さな部品に分けて組み立てる仕組み
- TypeScript: データの形を明示できるJavaScript
- Vite: 開発中の起動と完成版の作成を行う道具
- localStorage: このブラウザー内だけにデータを保存する仕組み
- Vitest / Testing Library: 処理と画面を自動確認する道具

初版は外部API、外部データベース、Docker、クラウドを使いません。追加料金、秘密情報の流出、初心者が学ぶ範囲の肥大化を避けるためです。

## 読む順番

1. [01_REQUIREMENTS.md](01_REQUIREMENTS.md) で「何を作るか」を確認する
2. [02_ARCHITECTURE.md](02_ARCHITECTURE.md) でデータの流れを確認する
3. [03_TECH_STACK.md](03_TECH_STACK.md) で技術を選んだ理由を確認する
4. [05_BEGINNER_GUIDE.md](05_BEGINNER_GUIDE.md) で用語を確認する
5. [evidence/INDEX.md](evidence/INDEX.md) で開発順に証跡を見る
6. 実装後はルートの `README.md` と `docs/portfolio/` を読む

## どのファイルが何を表すか

| 場所 | 役割 |
|---|---|
| `src/types.ts` | 企業や選考イベントのデータの形 |
| `src/data/demoData.ts` | 公開デモ専用の完全な架空データ |
| `src/services/storage.ts` | ブラウザー保存とデモ分離 |
| `src/utils/` | 点数、締切、検索などの計算 |
| `src/components/` | 画面を構成する部品 |
| `src/App.tsx` | 画面と操作をつなぐ中心 |
| `src/*.test.ts(x)` | 自動テスト |
| `docs/evidence/` | フェーズごとの変更、復習、エラー、画像 |

## 安全上の約束

リポジトリにはダミーデータだけを入れます。本人用データはブラウザーのlocalStorageに保存され、Gitには入りません。ただし共有PCでは使わず、バックアップ時は内容を自分で確認してください。

