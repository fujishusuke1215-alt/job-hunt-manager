import { useEffect, useMemo, useState } from 'react'
import { AppShell } from './components/AppShell'
import { CompanyDetail } from './components/CompanyDetail'
import { CompanyForm } from './components/CompanyForm'
import { CompanyList } from './components/CompanyList'
import { Dashboard } from './components/Dashboard'
import { DataTools } from './components/DataTools'
import { createDemoCompanies } from './data/demoData'
import { defaultFilters } from './data/defaults'
import { loadPersonalCompanies, savePersonalCompanies } from './services/storage'
import type { AppMode, Company, CompanyDraft, CompanyFilters, SelectionEvent, ViewName } from './types'
import { filterAndSortCompanies } from './utils/companyFilters'
import { createId } from './utils/id'

type FormState = { kind: 'add' } | { kind: 'edit'; companyId: string } | null

export default function App() {
  const [mode, setMode] = useState<AppMode>('demo')
  const [view, setView] = useState<ViewName>('dashboard')
  const [companies, setCompanies] = useState<Company[]>(createDemoCompanies)
  const [filters, setFilters] = useState<CompanyFilters>(defaultFilters)
  const [formState, setFormState] = useState<FormState>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'personal') savePersonalCompanies(companies)
  }, [companies, mode])

  const filteredCompanies = useMemo(
    () => filterAndSortCompanies(companies, filters),
    [companies, filters],
  )
  const selectedCompany = companies.find((company) => company.id === selectedId)
  const editingCompany = formState?.kind === 'edit'
    ? companies.find((company) => company.id === formState.companyId)
    : undefined

  const changeMode = (nextMode: AppMode) => {
    if (nextMode === mode) return
    setSelectedId(null)
    setFormState(null)
    setFilters(defaultFilters)
    setMode(nextMode)
    setCompanies(nextMode === 'demo' ? createDemoCompanies() : loadPersonalCompanies())
  }

  const openCompany = (id: string) => {
    setSelectedId(id)
    setView('companies')
  }

  const saveCompany = (draft: CompanyDraft) => {
    const now = new Date().toISOString()
    if (formState?.kind === 'edit') {
      setCompanies((current) => current.map((company) => (
        company.id === formState.companyId
          ? { ...company, ...draft, updatedAt: now }
          : company
      )))
    } else {
      setCompanies((current) => [
        ...current,
        {
          ...draft,
          id: createId('company'),
          events: [],
          createdAt: now,
          updatedAt: now,
        },
      ])
    }
    setFormState(null)
    setView('companies')
  }

  const deleteCompany = (id: string) => {
    const company = companies.find((item) => item.id === id)
    if (company && window.confirm(`「${company.name}」と紐づく選考予定を削除しますか？`)) {
      setCompanies((current) => current.filter((item) => item.id !== id))
      if (selectedId === id) setSelectedId(null)
    }
  }

  const updateEvents = (events: SelectionEvent[]) => {
    if (!selectedId) return
    setCompanies((current) => current.map((company) => (
      company.id === selectedId
        ? { ...company, events, updatedAt: new Date().toISOString() }
        : company
    )))
  }

  return (
    <AppShell mode={mode} view={view} onModeChange={changeMode} onViewChange={setView}>
      {mode === 'demo' && (
        <div className="demo-ribbon" role="note">
          <strong>公開デモ</strong>
          <span>表示中の企業・選考情報はすべて架空です。実在企業の情報ではありません。</span>
        </div>
      )}

      {view === 'dashboard' && (
        <Dashboard
          companies={companies}
          onOpenCompany={openCompany}
          onAddCompany={() => setFormState({ kind: 'add' })}
        />
      )}
      {view === 'companies' && (
        <CompanyList
          companies={filteredCompanies}
          totalCount={companies.length}
          filters={filters}
          onFiltersChange={setFilters}
          onOpen={openCompany}
          onEdit={(companyId) => setFormState({ kind: 'edit', companyId })}
          onDelete={deleteCompany}
          onAdd={() => setFormState({ kind: 'add' })}
        />
      )}
      {view === 'data' && (
        <DataTools
          mode={mode}
          companies={companies}
          onImport={setCompanies}
          onClear={() => setCompanies([])}
          onResetDemo={() => setCompanies(createDemoCompanies())}
        />
      )}

      {selectedCompany && (
        <CompanyDetail
          company={selectedCompany}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setFormState({ kind: 'edit', companyId: selectedCompany.id })
            setSelectedId(null)
          }}
          onUpdateEvents={updateEvents}
        />
      )}
      {formState && (
        <CompanyForm company={editingCompany} onSubmit={saveCompany} onCancel={() => setFormState(null)} />
      )}
    </AppShell>
  )
}
