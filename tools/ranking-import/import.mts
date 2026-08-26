import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseAppDataV2 } from '../../src/domain/schemas'
import { serializeAppDataV2 } from '../../src/repositories/types'
import {
  addRankingOnlyCompanies,
  applyPersonalRankingImport,
  reconcilePersonalRankingRows,
  verifyPersonalRanking,
  type PersonalRankingRow,
} from '../../src/services/personalRankingImport'

type Arguments = { input: string; backup: string; monitoring: string; output: string; report: string }

function argument(name: keyof Arguments): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : null
  if (!value || value.startsWith('--')) throw new Error(`--${name} が必要です。`)
  return resolve(value)
}

function args(): Arguments {
  return { input: argument('input'), backup: argument('backup'), monitoring: argument('monitoring'), output: argument('output'), report: argument('report') }
}

function cleanHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').replace(/\//g, '').trim()
}

function getCell(row: Record<string, unknown>, label: string): unknown {
  const wanted = cleanHeader(label)
  const key = Object.keys(row).find((candidate) => cleanHeader(candidate) === wanted)
  return key ? row[key] : undefined
}

function numberCell(row: Record<string, unknown>, label: string): number {
  const value = Number(getCell(row, label))
  if (!Number.isFinite(value)) throw new Error(`${label} が数値ではありません。`)
  return value
}

function textCell(row: Record<string, unknown>, label: string): string {
  const value = String(getCell(row, label) ?? '').trim()
  if (!value) throw new Error(`${label} が空です。`)
  return value
}

function optionalNumberCell(row: Record<string, unknown>, label: string): number | null {
  const value = getCell(row, label)
  if (value === null || value === undefined || String(value).trim() === '') return null
  return numberCell(row, label)
}

function csvRecords(csv: string): string[][] {
  const result: string[][] = []; let row: string[] = []; let value = ''; let quote = false
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    if (char === '"') { if (quote && csv[index + 1] === '"') { value += '"'; index += 1 } else quote = !quote; continue }
    if (char === ',' && !quote) { row.push(value); value = ''; continue }
    if ((char === '\n' || char === '\r') && !quote) {
      if (char === '\r' && csv[index + 1] === '\n') index += 1
      row.push(value); if (row.some((cell) => cell.trim())) result.push(row); row = []; value = ''; continue
    }
    value += char
  }
  row.push(value); if (row.some((cell) => cell.trim())) result.push(row)
  return result
}

function readRows(path: string): PersonalRankingRow[] {
  const python = process.env.RANKING_IMPORT_PYTHON ?? 'python'
  const raw = execFileSync(python, [resolve('tools/ranking-import/extract_xlsx.py'), path], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
  const records = JSON.parse(raw) as Record<string, unknown>[]
  const rows = records.map((row) => ({
    rank: numberCell(row, '順位'),
    companyName: textCell(row, '企業'),
    salaryGrowth: numberCell(row, '給与・伸び /20'),
    wlb: numberCell(row, 'WLB /25'),
    remoteFlex: numberCell(row, 'リモート・フレックス /15'),
    itDxFit: numberCell(row, 'IT/DX一致 /10'),
    overseasSea: numberCell(row, '海外・東南アジア /7'),
    offerRealism: numberCell(row, '内定現実性 /8'),
    stabilityLocation: numberCell(row, '安定性・勤務地 /10'),
    rawScore: numberCell(row, '素点 /95'),
    totalScore: numberCell(row, '総合点 /100'),
    confidence: textCell(row, '確度'),
    previousRank: optionalNumberCell(row, '前回順位'),
    previousTotalScore: optionalNumberCell(row, '前回総合点'),
    populationStatus: textCell(row, '母集団状態'),
    researchComment: String(getCell(row, '再調査コメント') ?? '').trim(),
    sourceUrl: String(getCell(row, '主要根拠URL') ?? '').trim() || null,
  }))
  if (rows.length !== 91) throw new Error(`総合ランキングは91行である必要があります（実際: ${rows.length}）。`)
  const ranks = new Set(rows.map((row) => row.rank))
  if (ranks.size !== 91 || Math.min(...ranks) !== 1 || Math.max(...ranks) !== 91) throw new Error('順位は1から91まで一意である必要があります。')
  rows.forEach((row) => {
    const raw = row.salaryGrowth + row.wlb + row.remoteFlex + row.itDxFit + row.overseasSea + row.offerRealism + row.stabilityLocation
    if (Math.abs(raw - row.rawScore) > 0.01) throw new Error(`${row.companyName}: 素点が評価軸の合計と一致しません。`)
    if (Math.abs(raw / 95 * 100 - row.totalScore) > 0.11) throw new Error(`${row.companyName}: 総合点が素点/95×100と一致しません。`)
  })
  return rows
}

async function readCurrentAppData(path: string) {
  const text = await readFile(path, 'utf8')
  const [headers, ...lines] = csvRecords(text.replace(/^\uFEFF/, ''))
  const appDataIndex = headers.indexOf('app_data')
  if (lines.length !== 1 || appDataIndex < 0 || !lines[0][appDataIndex]) throw new Error('backupはuser_app_dataを1行だけ含むCSVである必要があります。')
  return parseAppDataV2(JSON.parse(lines[0][appDataIndex]))
}

async function aliasesByUserCompanyId(csvPath: string, companies: Awaited<ReturnType<typeof readCurrentAppData>>['userCompanies']) {
  const [headers, ...lines] = csvRecords((await readFile(csvPath, 'utf8')).replace(/^\uFEFF/, ''))
  const records = lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, line[index] ?? ''])))
  const byName = new Map(companies.map((company) => [company.userEnteredName.normalize('NFKC').toLocaleLowerCase('ja'), company.id]))
  const aliases = new Map<string, string[]>()
  records.forEach((record) => {
    const companyName = String(record.company_name ?? '').normalize('NFKC').toLocaleLowerCase('ja')
    const id = byName.get(companyName)
    if (!id) return
    aliases.set(id, String(record.aliases ?? '').split(/[;|]/).map((value) => value.trim()).filter(Boolean))
  })
  return aliases
}

async function main() {
  const options = args()
  const rows = readRows(options.input)
  const current = await readCurrentAppData(options.backup)
  const aliases = await aliasesByUserCompanyId(options.monitoring, current.userCompanies)
  const initialMatches = reconcilePersonalRankingRows(rows, current.userCompanies, aliases)
  const preview = {
    sourceRows: rows.length,
    exactMapped: initialMatches.filter((match) => match.status === 'exact').length,
    aliasMapped: initialMatches.filter((match) => match.status === 'alias').length,
    rankingOnlyCompanies: initialMatches.filter((match) => match.status === 'unresolved').map((match) => match.row.companyName),
    ambiguous: initialMatches.filter((match) => match.status === 'ambiguous').map((match) => ({ company: match.row.companyName, candidates: match.candidates.map((candidate) => candidate.userEnteredName) })),
  }
  await mkdir(dirname(options.report), { recursive: true })
  if (preview.ambiguous.length) {
    await writeFile(options.report, JSON.stringify(preview, null, 2), 'utf8')
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`)
    throw new Error('曖昧な企業があるため、評価は反映しません。')
  }
  const now = new Date().toISOString()
  const withRankingOnly = addRankingOnlyCompanies(current, initialMatches, now)
  const matches = reconcilePersonalRankingRows(rows, withRankingOnly.userCompanies, aliases)
  const next = parseAppDataV2(applyPersonalRankingImport(withRankingOnly, matches, now))
  const verification = verifyPersonalRanking(matches, next)
  const report = {
    sourceRows: rows.length,
    exactMapped: preview.exactMapped,
    aliasMapped: preview.aliasMapped,
    rankingOnlyCompanies: preview.rankingOnlyCompanies,
    unresolved: matches.filter((match) => match.status === 'unresolved').map((match) => match.row.companyName),
    ambiguous: matches.filter((match) => match.status === 'ambiguous').map((match) => match.row.companyName),
    evaluationsCreated: next.evaluations.filter((item) => item.scoringProfileId === next.activeScoringProfileId).length,
    scoreMatches: verification.filter((item) => item.scoreDifference <= 0.1).length,
    maxScoreDifference: Math.max(...verification.map((item) => item.scoreDifference)),
    rankMatches: verification.filter((item) => item.appRank === item.excelRank).length,
    verification,
    preserved: {
      companies: current.userCompanies.length === next.userCompanies.length,
      selectionEvents: current.userCompanies.flatMap((company) => company.events).length === next.userCompanies.flatMap((company) => company.events).length,
      findings: current.watchFindings.length === next.watchFindings.length,
      researchFacts: current.researchFacts.length === next.researchFacts.length,
    },
  }
  await mkdir(dirname(options.output), { recursive: true })
  await writeFile(options.output, serializeAppDataV2(next), 'utf8')
  await writeFile(options.report, JSON.stringify(report, null, 2), 'utf8')
  process.stdout.write(`${JSON.stringify({ ...report, verification: undefined }, null, 2)}\n`)
}

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
