# 面接でのAI利用説明 v2

## 30秒版

「自分の就活管理課題、必須機能、安全・無課金条件は私が定義し、Codexを設計レビュー、実装、テスト、文書作成に使いました。生成物をそのまま採用せず、要件対応、Zod検証、Git差分、130件のunit/componentと9件のE2Eで確認しました。AI Sync自体も候補を即反映せず、人が差分を承認する設計です。Google実接続など未確認範囲も明記しています。」

## ユーザーが担ったこと

- 実際の約50社管理というproblem definition。
- v1で感じた課題とv2の詳細Acceptance Criteria。
- Company Master、dynamic scoring、Research Fact、AI Watch、Driveという方向。
- 個人情報、Gmail scope、課金の禁止。外部公開は後の明示依頼で架空demo buildだけへ限定。
- 既存UI/Git/evidenceを守り、学習証跡を同じ重さにする判断。

## Codexが担ったこと

- 既存コードとGitの監査、risk整理。
- domain/repository/providerの具体設計。
- code、test、CSS、docsの初稿と修正。
- Google公式資料の確認、command実行、error analysis、再試験。
- 架空データだけのscreenshotとsecurity audit。

## 人が確認できる証拠

- `git log --oneline`: 初版4commitを残した段階的v2履歴。
- `docs/evidence/phase-11-*`以降: 変更前後、error、復習、30秒説明。
- `src/domain/*.test.ts`: 計算、migration、AI/Watchの期待値。
- `src/repositories/*.test.ts`: 実accountなしのLocal/Drive storage contract。
- `src/providers/*.test.ts`: Auth scope、login、logout、account switchのcontract。
- `e2e/core-flow.spec.ts`: user flow。
- `docs/06_AI_USAGE.md`: 実装/確認/未確認の区別。

## 誇張しない

- 言える: 「AIを使って実装し、自分の要件とtestで検証した」。
- 言える: 「Google用code/Mockは完成、実account試験は未実施」。
- 言えない: 「全部一人で手書きした」。
- 言えない: 「Gmailを毎朝自動監視できる」。
- 言えない: 「Drive競合が原子的に完全解決した」。

## 深掘りに備える5問

1. なぜUser CompanyとMasterを分けたか。
2. なぜ未評価を0点にしないか。
3. AI JSONをどうtransaction的に扱うか。
4. Drive conflictをどこまで防ぎ、何が限界か。
5. AIが書いたcodeをどう検証したか。

答えられない詳細は推測せず、test、official docs、source codeで確認し直すと答えます。
