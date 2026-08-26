import type { CollectorFinding } from './collectorFindings'

const priority: Record<string, number> = {
  deadline: 0,
  manual_mypage_check_required: 1,
  reservation_required: 2,
  interview: 3,
  test: 4,
  result_notice: 5,
  selection_event: 6,
}

export function urgentPendingCollectorFindings(findings: readonly CollectorFinding[]): CollectorFinding[] {
  return findings
    .filter((finding) => finding.status === 'new' || finding.status === 'needs_review')
    .filter((finding) => priority[finding.findingType] !== undefined)
    .sort((left, right) => {
      const byType = priority[left.findingType] - priority[right.findingType]
      if (byType !== 0) return byType
      return new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime()
    })
}

export function collectorUrgencyLabel(findingType: string): string {
  return ({ deadline: '期限候補', manual_mypage_check_required: 'MyPage要確認', reservation_required: '予約要確認', interview: '面接候補', test: 'テスト候補', result_notice: '結果要確認', selection_event: '選考情報' } as Record<string, string>)[findingType] ?? '要確認'
}
