# 初心者向けv2構成説明

## 一番大きな変更

初版のCompanyは「企業そのもの」と「自分の応募」を1つに入れていました。v2は分けます。

```text
Company Master（企業そのもの・恒久ID）
        ↑ 任意にlink
User Company（応募職種、状態、志望度、メモ、選考）
        ├─ Selection Event
        ├─ Company Evaluation
        ├─ Research Fact + Source
        └─ Watch Finding
```

名前が変わってもMaster IDは変わりません。候補が曖昧なら自動で結びません。Masterがなくても独自企業として使えます。

## 登録から保存

```text
CompanyFormをsubmit
→ AppがUser CompanyとEvaluationを更新
→ revisionを増やす
→ StorageRepository.save
→ LocalまたはDrive実装がZodで検証
→ 競合確認
→ JSON保存
→ sync status表示
```

formへ文字を1文字入力するたびにDriveへ送るのではなく、登録ボタン等の明示操作だけで保存します。

## 評価計算

Criterionごとに`score / scaleMax`で0〜1へ揃え、weightを掛けます。未評価は0点ではなく計算対象外です。全weightのうち評価済みweightが何%かをcoverageとして表示します。

```text
score 4 / max 5、weight 20 → 0.8 × 20
```

評価済みweightだけで暫定100点換算し、coverageが100%未満なら「暫定」と表示します。

## AI Sync

```text
JSONを貼る
→ Zod validation
→ Master/User Company候補照合
→ before / afterを表示
→ 利用者が項目を選ぶ
→ deleteは追加確認
→ revisionが変わっていない時だけcommit
```

AIの答えを一次情報にはしません。公式ページをAIが整理した場合、sourceは`official_web`、`processedByAi=true`と別々に保存します。

## 保存先を分ける理由

UIは`StorageRepository`の`load/save`だけを知ります。localStorageとDriveの違いはrepository内部へ閉じ込めるため、Mockへ差し替えてGoogle accountなしでもtestできます。

## 主なファイル

| ファイル | 役割 |
|---|---|
| `src/domain/types.ts` | AppDataV2の設計図 |
| `src/domain/migration.ts` | v1を失わずv2へ変換 |
| `src/domain/scoring.ts` | score/coverage |
| `src/domain/companyMatching.ts` | Master候補、canonical解決 |
| `src/domain/aiSync.ts` | validation、preview、commit |
| `src/domain/watch.ts` | dedupと今日対応rule |
| `src/repositories/types.ts` | 保存先の共通契約 |
| `src/repositories/googleDriveStorage.ts` | appDataFolderと競合停止 |
| `src/providers/googleAuth.ts` | GIS tokenとaccount表示 |
| `src/App.tsx` | 画面、mode、save queueの接続 |

## まず説明できればよい7点

1. MasterとUser Companyは何が違うか。
2. 未評価を0点にしない理由。
3. Source metadataが必要な理由。
4. AI Syncが即時反映しない理由。
5. Watch Findingをfingerprintで重複防止する理由。
6. UIから保存先を分ける理由。
7. Google実試験とMock試験を区別する理由。
