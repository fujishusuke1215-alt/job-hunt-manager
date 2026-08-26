import { describe, expect, it } from 'vitest'
import { createEmptyAppData } from '../domain/migration'
import { previewMonitoringTargetsCsv } from './monitoringCsv'

const head='company_name,aliases,candidate_status,current_rank,official_recruit_url,recruit_entry_url,mypage_url,monitor_web,sender_domains,gmail_history_found,mypage_found,login_id_found,source_checked_at,notes,work_history_eligibility,eligibility_checked_at'
describe('monitoring CSV import preview',()=>{
  it('is idempotent, supports aliases/blanks and rejects private columns',()=>{
    const csv=head+'\nExample,"Ex;Example Inc",active,1,https://example.test,,,true,example.test,,,,,,confirmed,'
    const data=createEmptyAppData(); const one=previewMonitoringTargetsCsv(csv,data); const two=previewMonitoringTargetsCsv(csv,{...data,userCompanies:one.candidates})
    expect(one.candidates).toHaveLength(1); expect(two.candidates).toHaveLength(1); expect(one.targets[0].aliases).toContain('Ex'); expect(one.targets[0].senderDomains).toEqual(['example.test'])
    expect(()=>previewMonitoringTargetsCsv('company_name,login_id\nX,secret',data)).toThrow('private')
  })
  it('reports malformed rows and invalid eligibility without overwriting ranking or selection',()=>{
    const data=createEmptyAppData(); const malformed=Array.from({length:17},(_,i)=>i===0?'Too':'x').join(','); const p=previewMonitoringTargetsCsv(head+'\nX,,,,,,,,,,,,,,bad\n'+malformed,data)
    expect(p.targets[0].status).toBe('watch'); expect(p.warnings.some(w=>w.includes('eligibility'))).toBe(true); expect(p.warnings.some(w=>w.includes('列数'))).toBe(true)
    const existing={...p.candidates[0],manualPriority:'A' as const,selectionState:'closed' as const}; const merged=previewMonitoringTargetsCsv(head+'\nX,,,,,,,,,,,,,,,confirmed,',{...data,userCompanies:[existing]})
    expect(merged.candidates[0].manualPriority).toBe('A'); expect(merged.candidates[0].selectionState).toBe('closed')
  })
  it('keeps a quoted newline inside one Phase 0.6 CSV record',()=>{
    const csv = `${head}\nExample,,active,1,https://example.test,,,true,example.test,,,,,,confirmed,\nExample Two,,watch,2,https://example-two.test,,,false,,,,,,"line one\nline two",needs_review,`
    const preview = previewMonitoringTargetsCsv(csv, createEmptyAppData())
    expect(preview.rows).toBe(2); expect(preview.candidates).toHaveLength(2); expect(preview.candidates[1].memo).toContain('line two')
  })
})
