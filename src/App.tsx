import { useEffect, useMemo, useRef, useState } from 'react'
import { AiSync } from './components/AiSync'
import { AppShell } from './components/AppShell'
import { CompanyDetail } from './components/CompanyDetail'
import { CompanyForm } from './components/CompanyForm'
import { CompanyList } from './components/CompanyList'
import { Dashboard } from './components/Dashboard'
import { DataTools } from './components/DataTools'
import { ScoringSettings } from './components/ScoringSettings'
import { WatchCenter } from './components/WatchCenter'
import { getRuntimeConfig } from './config/runtime'
import { demoCatalog } from './data/catalogData'
import { createDemoAppData } from './data/demoDataV2'
import { createEmptyAppData, migrateV1Companies, parseLegacyV1, V1_STORAGE_KEY } from './domain/migration'
import { getActiveScoringProfile, getCompanyViews, getEvaluation } from './domain/selectors'
import type {
  AppDataV2,
  AppMode,
  CompanyFilters,
  ResearchFact,
  SelectionEvent,
  SyncStatus,
  UserCompanyDraft,
  ViewName,
  WatchFindingStatus,
} from './domain/types'
import { updateWatchFindingStatus } from './domain/watch'
import type { AuthAccount, AuthProvider } from './providers/auth'
import { GoogleAuthProvider, loadGoogleIdentityServices } from './providers/googleAuth'
import { GoogleDriveRestTransport, GoogleDriveStorageRepository } from './repositories/googleDriveStorage'
import { LocalDevelopmentStorageRepository } from './repositories/localDevelopmentStorage'
import type { StorageConflict, StorageRepository } from './repositories/types'
import { makeLegacyBackupKey } from './repositories/types'
import { createId } from './utils/id'

type FormState = { kind: 'add' } | { kind: 'edit'; companyId: string } | null
interface LegacyDriveCandidate { raw: string; data: AppDataV2; backupKey: string }

const defaultFilters: CompanyFilters = {
  query: '',
  status: 'すべて',
  priority: 'すべて',
  eligibility: 'すべて',
  deadline: 'すべて',
  sort: '締切が近い順',
}

function touch(data: AppDataV2, patch: Partial<AppDataV2>, now = new Date().toISOString()): AppDataV2 {
  return { ...data, ...patch, revision: data.revision + 1, updatedAt: now }
}

function downloadConflict(conflict: StorageConflict) {
  if (!conflict.localBackup) return
  const blob = new Blob([conflict.localBackup.json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = conflict.localBackup.fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const runtime = useMemo(getRuntimeConfig, [])
  const [mode, setMode] = useState<AppMode>('demo')
  const [view, setView] = useState<ViewName>('dashboard')
  const [demoData, setDemoData] = useState<AppDataV2>(createDemoAppData)
  const [personalData, setPersonalData] = useState<AppDataV2>(() => createEmptyAppData())
  const [filters, setFilters] = useState<CompanyFilters>(defaultFilters)
  const [formState, setFormState] = useState<FormState>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('signed-out')
  const [syncMessage, setSyncMessage] = useState('')
  const [conflict, setConflict] = useState<StorageConflict | null>(null)
  const [account, setAccount] = useState<AuthAccount | null>(null)
  const [legacyCandidate, setLegacyCandidate] = useState<LegacyDriveCandidate | null>(null)

  const repositoryRef = useRef<StorageRepository | null>(null)
  const authRef = useRef<AuthProvider | null>(null)
  const expectedVersionRef = useRef<string | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const personalLoadedRef = useRef(false)
  const storageGenerationRef = useRef(0)
  const conflictRef = useRef<StorageConflict | null>(null)

  const data = mode === 'demo' ? demoData : personalData
  const profile = getActiveScoringProfile(data)
  const companyViews = useMemo(() => getCompanyViews(data, demoCatalog), [data])
  const selectedView = companyViews.find((item) => item.company.id === selectedId)
  const editingView = formState?.kind === 'edit' ? companyViews.find((item) => item.company.id === formState.companyId) : undefined

  const storageLabel = mode === 'demo'
    ? '架空データ（外部保存なし）'
    : runtime.storageMode === 'local'
      ? 'ローカル開発モード'
      : runtime.storageMode === 'google'
        ? 'Google Drive appDataFolder'
        : 'Google設定なし（本人用停止）'

  useEffect(() => {
    if (runtime.storageMode !== 'google' || !runtime.googleClientId) return
    void loadGoogleIdentityServices().catch(() => {
      // ログイン操作時に具体的なエラーを表示する。読込失敗だけではデータを変更しない。
    })
  }, [runtime.googleClientId, runtime.storageMode])

  const rememberConflict = (next: StorageConflict | null) => {
    conflictRef.current = next
    setConflict(next)
  }

  const loadRepository = async (repository: StorageRepository) => {
    const generation = ++storageGenerationRef.current
    setSyncStatus('loading')
    setSyncMessage('保存先からデータを読み込んでいます。')
    rememberConflict(null)
    try {
      const result = await repository.load()
      if (generation !== storageGenerationRef.current) return
      if (result.status === 'conflict') {
        expectedVersionRef.current = null
        rememberConflict(result.conflict)
        setSyncStatus('conflict')
        setSyncMessage(result.conflict.message)
        return
      }
      const loaded = result.status === 'loaded' ? result.data : createEmptyAppData()
      expectedVersionRef.current = result.version
      setPersonalData(loaded)
      personalLoadedRef.current = true
      setSyncStatus('synced')
      setSyncMessage(result.status === 'loaded'
        ? `${loaded.userCompanies.length}社を読み込みました。${result.migratedFromV1 ? ' v1原文は退避し、旧キーも保持しています。' : ''}`
        : '保存先は空です。最初の保存で新規作成します。')

      if (runtime.storageMode === 'google' && result.status === 'empty') {
        const raw = localStorage.getItem(V1_STORAGE_KEY)
        if (raw) {
          try {
            const now = new Date().toISOString()
            const backupKey = makeLegacyBackupKey(now)
            const migrated = migrateV1Companies(parseLegacyV1(raw), { now, sourceKey: V1_STORAGE_KEY, backupKey })
            setLegacyCandidate({ raw, data: migrated, backupKey })
          } catch {
            setSyncMessage('Driveは空です。ローカルv1候補は検証に失敗したため、自動上書きしていません。')
          }
        }
      }
    } catch (error) {
      if (generation !== storageGenerationRef.current) return
      setSyncStatus('offline')
      setSyncMessage(error instanceof Error ? error.message : '保存先を読み込めませんでした。')
    }
  }

  const ensureLocalRepository = () => {
    if (!(repositoryRef.current instanceof LocalDevelopmentStorageRepository)) {
      repositoryRef.current = new LocalDevelopmentStorageRepository()
      expectedVersionRef.current = null
    }
    return repositoryRef.current
  }

  const persistPersonal = (next: AppDataV2) => {
    const repository = repositoryRef.current
    if (!repository || conflictRef.current) return
    const generation = storageGenerationRef.current
    setSyncStatus('saving')
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (generation !== storageGenerationRef.current || conflictRef.current) return
      try {
        const result = await repository.save(next, expectedVersionRef.current ?? undefined)
        if (generation !== storageGenerationRef.current) return
        if (result.status === 'conflict') {
          rememberConflict(result.conflict)
          setSyncStatus('conflict')
          setSyncMessage(result.conflict.message)
          return
        }
        expectedVersionRef.current = result.version
        setSyncStatus('synced')
        setSyncMessage('明示的な変更単位で保存しました。')
      } catch (error) {
        if (generation !== storageGenerationRef.current) return
        setSyncStatus('offline')
        setSyncMessage(error instanceof Error ? error.message : '保存に失敗しました。JSONバックアップを利用してください。')
      }
    })
  }

  const commitData = (next: AppDataV2) => {
    if (mode === 'demo') setDemoData(next)
    else {
      setPersonalData(next)
      persistPersonal(next)
    }
  }

  const changeMode = (nextMode: AppMode) => {
    if (nextMode === mode) return
    setSelectedId(null)
    setFormState(null)
    setFilters(defaultFilters)
    setView('dashboard')
    setMode(nextMode)
    if (nextMode === 'demo') {
      setSyncStatus('synced')
      setSyncMessage('公開デモは架空データだけを表示します。')
      return
    }
    if (runtime.storageMode === 'local' && !personalLoadedRef.current) void loadRepository(ensureLocalRepository())
    else if (runtime.storageMode === 'local') setSyncStatus(conflictRef.current ? 'conflict' : 'synced')
    else if (runtime.storageMode === 'google') setSyncStatus(account ? syncStatus : 'signed-out')
    else setSyncStatus('signed-out')
  }

  const login = async () => {
    if (runtime.storageMode !== 'google' || !runtime.googleClientId) {
      setSyncStatus('offline')
      setSyncMessage('Google Client IDがありません。GOOGLE_AUTH_SETUP.mdを確認してください。')
      return
    }
    setSyncStatus('loading')
    setSyncMessage('Googleログインを開始します。')
    try {
      const oauth2 = await loadGoogleIdentityServices()
      const provider = new GoogleAuthProvider({ clientId: runtime.googleClientId, oauth2 })
      authRef.current = provider
      const signedIn = await provider.signIn()
      setAccount(signedIn)
      const repository = new GoogleDriveStorageRepository({
        transport: new GoogleDriveRestTransport({ getAccessToken: () => provider.getAccessToken() }),
      })
      repositoryRef.current = repository
      expectedVersionRef.current = null
      await loadRepository(repository)
    } catch (error) {
      setAccount(null)
      setSyncStatus('offline')
      setSyncMessage(error instanceof Error ? error.message : 'Googleログインに失敗しました。')
    }
  }

  const logout = async () => {
    ++storageGenerationRef.current
    await authRef.current?.logout()
    authRef.current = null
    repositoryRef.current = null
    expectedVersionRef.current = null
    personalLoadedRef.current = false
    setAccount(null)
    setPersonalData(createEmptyAppData())
    setLegacyCandidate(null)
    rememberConflict(null)
    setSyncStatus('signed-out')
    setSyncMessage('ログアウトし、トークン・アカウント表示・個人データをメモリから消去しました。')
  }

  const migrateLegacyToDrive = async () => {
    if (!legacyCandidate || !repositoryRef.current) return
    localStorage.setItem(legacyCandidate.backupKey, legacyCandidate.raw)
    const result = await repositoryRef.current.save(legacyCandidate.data, expectedVersionRef.current ?? undefined)
    if (result.status === 'conflict') {
      rememberConflict(result.conflict)
      setSyncStatus('conflict')
      setSyncMessage(result.conflict.message)
      return
    }
    expectedVersionRef.current = result.version
    setPersonalData(legacyCandidate.data)
    setLegacyCandidate(null)
    setSyncStatus('synced')
    setSyncMessage('v1をDriveへ移行しました。元のv1キーと退避コピーは削除していません。')
  }

  const reloadRemote = async () => {
    if (!repositoryRef.current) return
    rememberConflict(null)
    await loadRepository(repositoryRef.current)
  }

  const openCompany = (id: string) => {
    setSelectedId(id)
    setView('companies')
  }

  const saveCompany = (draft: UserCompanyDraft, values: Record<string, number | null>) => {
    const now = new Date().toISOString()
    const companyId = formState?.kind === 'edit' ? formState.companyId : createId('user-company')
    const currentCompany = data.userCompanies.find((item) => item.id === companyId)
    const company = {
      ...draft,
      id: companyId,
      events: currentCompany?.events ?? [],
      createdAt: currentCompany?.createdAt ?? now,
      updatedAt: now,
    }
    const existingEvaluation = getEvaluation(data, companyId, profile.id)
    const evaluation = {
      id: existingEvaluation?.id ?? createId('evaluation'),
      userCompanyId: companyId,
      scoringProfileId: profile.id,
      values,
      createdAt: existingEvaluation?.createdAt ?? now,
      updatedAt: now,
    }
    commitData(touch(data, {
      userCompanies: currentCompany ? data.userCompanies.map((item) => item.id === companyId ? company : item) : [...data.userCompanies, company],
      evaluations: existingEvaluation ? data.evaluations.map((item) => item.id === existingEvaluation.id ? evaluation : item) : [...data.evaluations, evaluation],
    }, now))
    setFormState(null)
    setView('companies')
  }

  const deleteCompany = (id: string) => {
    const company = data.userCompanies.find((item) => item.id === id)
    if (!company || !window.confirm(`「${company.userEnteredName}」と紐づく選考・評価・個人Fact・Watchを削除しますか？`)) return
    commitData(touch(data, {
      userCompanies: data.userCompanies.filter((item) => item.id !== id),
      evaluations: data.evaluations.filter((item) => item.userCompanyId !== id),
      researchFacts: data.researchFacts.filter((item) => item.userCompanyId !== id),
      watchFindings: data.watchFindings.filter((item) => item.userCompanyId !== id),
    }))
    if (selectedId === id) setSelectedId(null)
  }

  const updateEvents = (events: SelectionEvent[]) => {
    if (!selectedId) return
    const now = new Date().toISOString()
    commitData(touch(data, { userCompanies: data.userCompanies.map((company) => company.id === selectedId ? { ...company, events, updatedAt: now } : company) }, now))
  }

  const saveFact = (fact: ResearchFact) => {
    const exists = data.researchFacts.some((item) => item.id === fact.id)
    commitData(touch(data, { researchFacts: exists ? data.researchFacts.map((item) => item.id === fact.id ? fact : item) : [...data.researchFacts, fact] }))
  }

  const changeWatchStatus = (id: string, status: WatchFindingStatus) => {
    commitData(touch(data, { watchFindings: updateWatchFindingStatus(data.watchFindings, id, status) }))
  }

  const personalGate = mode === 'personal' && (
    runtime.storageMode === 'disabled' || (runtime.storageMode === 'google' && !account)
  )

  return (
    <AppShell
      mode={mode}
      view={view}
      syncStatus={mode === 'demo' ? 'synced' : syncStatus}
      storageLabel={storageLabel}
      accountEmail={account?.email}
      authAvailable={runtime.storageMode === 'google'}
      onModeChange={changeMode}
      onViewChange={setView}
      onLogin={() => void login()}
      onLogout={() => void logout()}
    >
      {mode === 'demo' && <div className="demo-ribbon" role="note"><strong>公開デモ</strong><span>企業・選考・Watchはすべて架空です。実在企業の情報ではありません。</span></div>}
      {mode === 'personal' && runtime.localDevelopment && <div className="development-ribbon" role="note"><strong>ローカル開発モード</strong><span>Google未設定でも開発・テストできます。本番の本人用モードへ黙って切り替わる設定ではありません。</span></div>}
      {syncMessage && mode === 'personal' && <div className={syncStatus === 'offline' || syncStatus === 'conflict' ? 'notice error' : 'notice'} role="status">{syncMessage}</div>}
      {legacyCandidate && <div className="notice migration-notice" role="note"><strong>localStorage v1を検出しました</strong><span>{legacyCandidate.data.userCompanies.length}社を検証済みです。旧データを残したままDriveへ移行できます。</span><button className="primary-button small" type="button" onClick={() => void migrateLegacyToDrive()}>確認してDriveへ移行</button><button className="text-button" type="button" onClick={() => setLegacyCandidate(null)}>今回はしない</button></div>}
      {conflict && <div className="notice error conflict-notice" role="alert"><strong>同期競合のため自動上書きを停止しました</strong><span>{conflict.message}</span>{conflict.localBackup && <button className="secondary-button" type="button" onClick={() => downloadConflict(conflict)}>local案をJSON退避</button>}<button className="secondary-button" type="button" onClick={() => void reloadRemote()}>remoteを再読込</button></div>}

      {personalGate ? (
        <section className="access-gate" aria-labelledby="access-title">
          <p className="eyebrow">PERSONAL MODE</p><h1 id="access-title">本人用データを開く</h1>
          <p>{runtime.storageMode === 'google' ? 'Google Drive appDataFolderから、自分のデータを読み込みます。要求するDrive権限はdrive.appdataだけです。' : '本番の本人用モードはGoogle設定後のみ利用できます。ローカル開発はVITE_STORAGE_MODE=localを明示してください。'}</p>
          {runtime.storageMode === 'google' && <button className="primary-button" type="button" onClick={() => void login()}>Googleでログインして読み込む</button>}
          <small>アクセストークンはメモリだけで扱い、localStorageへ保存しません。Gmail権限は要求しません。</small>
        </section>
      ) : (
        <>
          {view === 'dashboard' && <Dashboard companies={companyViews} findings={data.watchFindings} onOpenCompany={openCompany} onAddCompany={() => setFormState({ kind: 'add' })} onOpenWatch={() => setView('watch')} />}
          {view === 'companies' && <CompanyList companies={companyViews} filters={filters} onFiltersChange={setFilters} onOpen={openCompany} onEdit={(companyId) => setFormState({ kind: 'edit', companyId })} onDelete={deleteCompany} onAdd={() => setFormState({ kind: 'add' })} />}
          {view === 'scoring' && <ScoringSettings data={data} onChange={commitData} />}
          {view === 'ai-sync' && <AiSync data={data} catalog={demoCatalog} onChange={commitData} />}
          {view === 'watch' && <WatchCenter companies={companyViews} findings={data.watchFindings} runs={data.watchRuns} onStatusChange={changeWatchStatus} onOpenCompany={openCompany} />}
          {view === 'data' && <DataTools mode={mode} data={data} storageLabel={storageLabel} syncStatus={mode === 'demo' ? 'synced' : syncStatus} onImport={commitData} onClear={() => commitData(createEmptyAppData())} onResetDemo={() => setDemoData(createDemoAppData())} />}

          {selectedView && <CompanyDetail view={selectedView} profile={profile} onClose={() => setSelectedId(null)} onEdit={() => { setFormState({ kind: 'edit', companyId: selectedView.company.id }); setSelectedId(null) }} onUpdateEvents={updateEvents} onSaveFact={saveFact} />}
          {formState && <CompanyForm companyView={editingView} catalog={demoCatalog} profile={profile} evaluation={editingView?.evaluation ?? null} onSubmit={saveCompany} onCancel={() => setFormState(null)} />}
        </>
      )}
    </AppShell>
  )
}
