import type { AppDataV2, UserCompany } from '../domain/types'
import { createId } from '../utils/id'
import { syncMonitoringTargetsFromCandidates, type MonitoringTarget, type WorkHistoryEligibility } from './monitoringOnboarding'

const headers = ['company_name','aliases','candidate_status','current_rank','official_recruit_url','recruit_entry_url','mypage_url','monitor_web','sender_domains','gmail_history_found','mypage_found','login_id_found','source_checked_at','notes','work_history_eligibility','eligibility_checked_at'] as const
export interface CsvPreview { rows: number; warnings: string[]; candidates: UserCompany[]; targets: MonitoringTarget[] }
function records(csv: string): string[][] {
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
export function previewMonitoringTargetsCsv(csv: string, data: AppDataV2): CsvPreview {
  const [keys = [], ...lines] = records(csv.replace(/^\uFEFF/, ''))
  const unknown=keys.filter(k=>!headers.includes(k as typeof headers[number])); if(unknown.some(k=>/login|password|private/i.test(k))) throw new Error('private ID/password列を含むCSVは取り込めません。')
  if(!keys.includes('company_name')) throw new Error('company_name列が必要です。')
  const warnings:string[]=[]; const existing=new Map(data.userCompanies.map(c=>[c.userEnteredName.normalize('NFKC').toLowerCase(),c])); const candidates=[...data.userCompanies]
  const csvTargetOverrides = new Map<string, Partial<MonitoringTarget>>()
  for(const values of lines){ if(values.length>keys.length) { warnings.push('列数が多い行を除外しました。'); continue }
    const row=Object.fromEntries(keys.map((key,i)=>[key,values[i]?.trim()??''])); const name=String(row.company_name); if(!name){warnings.push('company_nameが空の行を除外しました。');continue}
    const rawEligibility=String(row.work_history_eligibility||'needs_review'); const validEligibility=['confirmed','eligible_no_exclusion_found','needs_review','ineligible'].includes(rawEligibility)
    const eligibility=(validEligibility?rawEligibility:'needs_review') as WorkHistoryEligibility; if(!validEligibility) warnings.push(`${name}: eligibilityをneeds_reviewとして扱います。`)
    const key=name.normalize('NFKC').toLowerCase(); let candidate=existing.get(key)
    if(!candidate){ const now=new Date().toISOString(); candidate={id:createId('user-company'),masterCompanyId:null,userEnteredName:name,role:'',applicationCategory:'',manualPriority:'C',interest:0,applicationStatus:'検討中',myPageStatus:row.mypage_url?'開設済み':'未開設',applicationUrl:String(row.official_recruit_url||row.recruit_entry_url||''),selectionPhase:'considering',selectionState:'active',closeReason:null,offerDecision:null,selectionStageUpdatedAt:now,lastCompanyInteractionAt:null,memo:String(row.notes||''),watchEnabled:String(row.monitor_web).toLowerCase()==='true',events:[],createdAt:now,updatedAt:now}; candidates.push(candidate); existing.set(key,candidate) }
    const aliases=String(row.aliases||'').split(/[;|]/).map(x=>x.trim()).filter(Boolean)
    csvTargetOverrides.set(candidate.id,{aliases:[candidate.userEnteredName,...aliases],officialUrl:String(row.official_recruit_url||row.recruit_entry_url||candidate.applicationUrl||'')||null,mypageUrl:String(row.mypage_url||'')||null,senderDomains:String(row.sender_domains||'').split(/[;|,]/).map(x=>x.trim()).filter(Boolean),workHistoryEligibility:eligibility,status:eligibility==='ineligible'?'excluded':eligibility==='needs_review'?'watch':'active',enabled:String(row.monitor_web).toLowerCase()==='true' && eligibility!=='ineligible'})
  }
  const targets=syncMonitoringTargetsFromCandidates(candidates,[]).targets.map(target=>({...target,...csvTargetOverrides.get(target.candidateCompanyId), aliases:[...new Set((csvTargetOverrides.get(target.candidateCompanyId)?.aliases??target.aliases))]}))
  return {rows: lines.length, warnings, candidates, targets}
}
