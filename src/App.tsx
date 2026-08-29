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
import { LandingPage } from './components/LandingPage'
import { CollectorFindings } from './components/CollectorFindings'
import { getRuntimeConfig } from './config/runtime'
import { demoCatalog } from './data/catalogData'
import { createDemoAppData } from './data/demoDataV2'
import { createEmptyAppData } from './domain/migration'
import { getActiveScoringProfile, getCompanyViews, getEvaluation } from './domain/selectors'
import type {
  AppDataV2,
  AppMode,
  CatalogData,
  CompanyFilters,
  ResearchFact,
  SelectionEvent,
  SyncStatus,
  UserCompanyDraft,
  ViewName,
  WatchFindingStatus,
} from './domain/types'
import { updateWatchFindingStatus } from './domain/watch'
import { selectionLabel } from './domain/selection'
import { saveProfileDraft } from './domain/profileManagement'
import type { AuthAccount, AuthProvider } from './providers/auth'
import { GoogleAuthProvider, loadGoogleIdentityServices } from './providers/googleAuth'
import { createSupabaseClient, SupabaseAuthProvider } from './providers/supabaseAuth'
import { GoogleDriveRestTransport, GoogleDriveStorageRepository } from './repositories/googleDriveStorage'
import { LocalDevelopmentStorageRepository } from './repositories/localDevelopmentStorage'
import { SupabaseStorageRepository, type CollectorStateSummary } from './repositories/supabaseStorage'
import { StaticCatalogRepository } from './repositories/catalog'
import type { ImportPreview, StorageConflict, StorageRepository } from './repositories/types'
import { createImportPreview, serializeAppDataV2, StorageRepositoryError } from './repositories/types'
import {
  driveMigrationMarkerKey,
  inspectLocalDriveCandidate,
  isSameAppData,
  localCandidateFingerprint,
  type LocalDriveCandidate,
} from './services/localDriveCandidate'
import { createId } from './utils/id'
import { syncMonitoringTargetsFromCandidates } from './services/monitoringOnboarding'
import { previewMonitoringTargetsCsv, type CsvPreview } from './services/monitoringCsv'
import { approveCollectorFinding, type CollectorFinding } from './services/collectorFindings'
import type { TodayAction } from './domain/watch'

type FormState = { kind: 'add' } | { kind: 'edit'; companyId: string } | null
type LocalCandidateScenario = 'drive-empty' | 'both'

const catalogRepository = new StaticCatalogRepository(demoCatalog)

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

function downloadJson(json: string, fileName: string) {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function needsGoogleReconnect(error: unknown): boolean {
  return error instanceof StorageRepositoryError && (
    error.code === 'unauthenticated' || error.status === 401
  )
}

export default function App() {
  const runtime = useMemo(getRuntimeConfig, [])
  const [entryChosen, setEntryChosen] = useState(runtime.storageMode !== 'google' && runtime.storageMode !== 'supabase')
  const [mode, setMode] = useState<AppMode>('demo')
  const [view, setView] = useState<ViewName>('dashboard')
  const [demoData, setDemoData] = useState<AppDataV2>(createDemoAppData)
  const [personalData, setPersonalData] = useState<AppDataV2>(() => createEmptyAppData())
  const [filters, setFilters] = useState<CompanyFilters>(defaultFilters)
  const [formState, setFormState] = useState<FormState>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [personalSyncStatus, setPersonalSyncStatus] = useState<SyncStatus>('signed-out')
  const [personalSyncMessage, setPersonalSyncMessage] = useState('')
  const [conflict, setConflict] = useState<StorageConflict | null>(null)
  const [account, setAccount] = useState<AuthAccount | null>(null)
  const [localCandidate, setLocalCandidate] = useState<LocalDriveCandidate | null>(null)
  const [localCandidateScenario, setLocalCandidateScenario] = useState<LocalCandidateScenario | null>(null)
  const [reconnectRequired, setReconnectRequired] = useState(false)
  const [catalog, setCatalog] = useState<CatalogData>(demoCatalog)
  const [collectorFindings, setCollectorFindings] = useState<CollectorFinding[]>([])
  const [collectorStates, setCollectorStates] = useState<CollectorStateSummary[]>([])

  const repositoryRef = useRef<StorageRepository | null>(null)
  const authRef = useRef<AuthProvider | null>(null)
  const expectedVersionRef = useRef<string | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const personalLoadedRef = useRef(false)
  const storageGenerationRef = useRef(0)
  const conflictRef = useRef<StorageConflict | null>(null)
  const unsavedPersonalRef = useRef<AppDataV2 | null>(null)

  const data = mode === 'demo' ? demoData : personalData
  const profile = getActiveScoringProfile(data)
  const companyViews = useMemo(() => getCompanyViews(data, catalog), [catalog, data])
  const selectedView = companyViews.find((item) => item.company.id === selectedId)
  const editingView = formState?.kind === 'edit' ? companyViews.find((item) => item.company.id === formState.companyId) : undefined

  const storageLabel = mode === 'demo'
    ? '架空データ（外部保存なし）'
    : runtime.storageMode === 'local'
      ? 'ローカル開発モード'
      : runtime.storageMode === 'google'
        ? 'Google Drive appDataFolder'
        : runtime.storageMode === 'supabase'
          ? 'Supabase（本人専用）'
        : 'Google設定なし（本人用停止）'

  useEffect(() => {
    let active = true
    void catalogRepository.load().then((loadedCatalog) => {
      if (active) setCatalog(loadedCatalog)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (runtime.storageMode !== 'google' || !runtime.googleClientId) return
    void loadGoogleIdentityServices().catch(() => {
      // ログイン操作時に具体的なエラーを表示する。読込失敗だけではデータを変更しない。
    })
  }, [runtime.googleClientId, runtime.storageMode])

  useEffect(() => {
    if (runtime.storageMode !== 'supabase' || !runtime.supabaseUrl || !runtime.supabasePublishableKey) return
    const provider = new SupabaseAuthProvider(createSupabaseClient(runtime.supabaseUrl, runtime.supabasePublishableKey))
    authRef.current = provider
    return provider.subscribe((snapshot) => {
      if (snapshot.status === 'authenticating') { setPersonalSyncStatus('loading'); return }
      if (snapshot.status !== 'signed-in' || !snapshot.account) { setAccount(null); setMode('demo'); setEntryChosen(false); setPersonalSyncStatus('signed-out'); return }
      setAccount(snapshot.account); setMode('personal'); setEntryChosen(true)
      const repository = new SupabaseStorageRepository(provider.client, snapshot.account.id)
      repositoryRef.current = repository; expectedVersionRef.current = null; void loadRepository(repository, snapshot.account.id)
    })
  // loadRepository is stable enough for this one-time provider lifecycle; runtime values are immutable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.storageMode, runtime.supabasePublishableKey, runtime.supabaseUrl])

  const rememberConflict = (next: StorageConflict | null) => {
    conflictRef.current = next
    setConflict(next)
  }

  const loadRepository = async (repository: StorageRepository, googleAccountId: string | null = account?.id ?? null) => {
    const generation = ++storageGenerationRef.current
    setPersonalSyncStatus('loading')
    setPersonalSyncMessage('保存先からデータを読み込んでいます。')
    rememberConflict(null)
    setReconnectRequired(false)
    setLocalCandidate(null)
    setLocalCandidateScenario(null)
    try {
      const result = await repository.load()
      if (generation !== storageGenerationRef.current) return
      if (result.status === 'conflict') {
        expectedVersionRef.current = null
        rememberConflict(result.conflict)
        setPersonalSyncStatus('conflict')
        setPersonalSyncMessage(result.conflict.message)
        return
      }
      const loaded = result.status === 'loaded' ? result.data : createEmptyAppData()
      if (repository instanceof SupabaseStorageRepository) {
        void repository.loadCollectorFindings().then(setCollectorFindings).catch(() => setCollectorFindings([]))
        void repository.loadCollectorStates().then(setCollectorStates).catch(() => setCollectorStates([]))
      }
      expectedVersionRef.current = result.version
      unsavedPersonalRef.current = null
      setPersonalData(loaded)
      personalLoadedRef.current = true
      setPersonalSyncStatus('synced')
      setPersonalSyncMessage(result.status === 'loaded'
        ? `${loaded.userCompanies.length}社を読み込みました。${result.migratedFromV1 ? ' v1原文は退避し、旧キーも保持しています。' : ''}`
        : '保存先は空です。最初の保存で新規作成します。')

      if (runtime.storageMode === 'google') {
        const inspection = inspectLocalDriveCandidate(localStorage)
        if (inspection.warning !== null) {
          setPersonalSyncMessage(`${result.status === 'empty' ? 'Driveは空です。' : 'Driveを読み込みました。'} ${inspection.warning}`)
        } else if (
          inspection.candidate !== null &&
          (
            googleAccountId === null ||
            localStorage.getItem(driveMigrationMarkerKey(googleAccountId)) !== localCandidateFingerprint(inspection.candidate)
          ) &&
          (result.status === 'empty' || !isSameAppData(inspection.candidate.data, loaded))
        ) {
          setLocalCandidate(inspection.candidate)
          setLocalCandidateScenario(result.status === 'empty' ? 'drive-empty' : 'both')
          setPersonalSyncMessage(result.status === 'empty'
            ? 'Driveは空です。この端末の既存データをどう扱うか選んでください。'
            : 'Driveとこの端末の両方にデータがあります。自動上書きせず、使用するデータを選んでください。')
        }
      }
    } catch (error) {
      if (generation !== storageGenerationRef.current) return
      setReconnectRequired(needsGoogleReconnect(error))
      setPersonalSyncStatus('offline')
      setPersonalSyncMessage(needsGoogleReconnect(error)
        ? 'Google Driveへの接続期限が切れました。現在の画面データを保持したまま再接続してください。'
        : error instanceof Error ? error.message : '保存先を読み込めませんでした。')
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
    unsavedPersonalRef.current = next
    setPersonalSyncStatus('saving')
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (generation !== storageGenerationRef.current || conflictRef.current) return
      try {
        const result = await repository.save(next, expectedVersionRef.current ?? undefined)
        if (generation !== storageGenerationRef.current) return
        if (result.status === 'conflict') {
          rememberConflict(result.conflict)
          setPersonalSyncStatus('conflict')
          setPersonalSyncMessage(result.conflict.message)
          return
        }
        expectedVersionRef.current = result.version
        unsavedPersonalRef.current = null
        setReconnectRequired(false)
        setPersonalSyncStatus('synced')
        setPersonalSyncMessage('明示的な変更単位で保存しました。')
      } catch (error) {
        if (generation !== storageGenerationRef.current) return
        setReconnectRequired(needsGoogleReconnect(error))
        setPersonalSyncStatus('offline')
        setPersonalSyncMessage(needsGoogleReconnect(error)
          ? 'Google Driveへの接続期限が切れました。未保存の画面データを保持しています。再接続してください。'
          : error instanceof Error ? error.message : '保存に失敗しました。JSONバックアップを利用してください。')
      }
    })
  }

  const commitData = (next: AppDataV2) => {
    const activeNow = new Date().toISOString()
    const withActivity = { ...next, userSettings: { ...next.userSettings, lastUserActiveAt: activeNow }, updatedAt: activeNow }
    if (mode === 'demo') setDemoData(withActivity)
    else {
      setPersonalData(withActivity)
      persistPersonal(withActivity)
    }
  }

  const previewCsvImport = (raw: string): CsvPreview => previewMonitoringTargetsCsv(raw, data)
  const commitCsvImport = async (preview: CsvPreview): Promise<void> => {
    const next = touch(data, { userCompanies: preview.candidates })
    commitData(next)
    if (repositoryRef.current instanceof SupabaseStorageRepository) await repositoryRef.current.syncMonitoringTargets(preview.targets)
  }

  const changeMode = (nextMode: AppMode) => {
    if (nextMode === mode) return
    setSelectedId(null)
    setFormState(null)
    setFilters(defaultFilters)
    setView('dashboard')
    setMode(nextMode)
    if (nextMode === 'demo') return
    if (runtime.storageMode === 'local' && !personalLoadedRef.current) void loadRepository(ensureLocalRepository())
    else if ((runtime.storageMode === 'google' || runtime.storageMode === 'supabase') && !account) setPersonalSyncStatus('signed-out')
    else if (runtime.storageMode === 'disabled') setPersonalSyncStatus('signed-out')
  }

  const login = async () => {
    if (runtime.storageMode === 'supabase') {
      if (!authRef.current) { setPersonalSyncMessage('Supabase設定を確認してください。'); return }
      try { await authRef.current.signIn() } catch (error) { setPersonalSyncStatus('offline'); setPersonalSyncMessage(error instanceof Error ? error.message : 'Googleログインを開始できません。') }
      return
    }
    if (runtime.storageMode !== 'google' || !runtime.googleClientId) {
      setPersonalSyncStatus('offline')
      setPersonalSyncMessage('Google Client IDがありません。GOOGLE_AUTH_SETUP.mdを確認してください。')
      return
    }
    setPersonalSyncStatus('loading')
    setPersonalSyncMessage('Googleログインを開始します。')
    setReconnectRequired(false)
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
      unsavedPersonalRef.current = null
      await loadRepository(repository, signedIn.id)
    } catch (error) {
      authRef.current = null
      repositoryRef.current = null
      setAccount(null)
      setPersonalSyncStatus('offline')
      setPersonalSyncMessage(error instanceof Error ? error.message : 'Googleログインに失敗しました。')
    }
  }

  const reconnectGoogleDrive = async () => {
    const provider = authRef.current
    const previousAccount = account
    if (!provider || !previousAccount) {
      await login()
      return
    }

    setPersonalSyncStatus('loading')
    setPersonalSyncMessage('Google Driveへ再接続しています。')
    try {
      const signedIn = await provider.signIn()
      const repository = new GoogleDriveStorageRepository({
        transport: new GoogleDriveRestTransport({ getAccessToken: () => provider.getAccessToken() }),
      })
      repositoryRef.current = repository

      if (signedIn.id !== previousAccount.id) {
        ++storageGenerationRef.current
        expectedVersionRef.current = null
        unsavedPersonalRef.current = null
        personalLoadedRef.current = false
        setPersonalData(createEmptyAppData())
        setLocalCandidate(null)
        setLocalCandidateScenario(null)
        rememberConflict(null)
        setAccount(signedIn)
        await loadRepository(repository, signedIn.id)
        return
      }

      setAccount(signedIn)
      const pending = unsavedPersonalRef.current
      if (pending === null) {
        await loadRepository(repository, signedIn.id)
        return
      }

      const result = await repository.save(pending, expectedVersionRef.current ?? undefined)
      if (result.status === 'conflict') {
        rememberConflict(result.conflict)
        setPersonalSyncStatus('conflict')
        setPersonalSyncMessage(result.conflict.message)
        return
      }
      expectedVersionRef.current = result.version
      unsavedPersonalRef.current = null
      setPersonalData(result.data)
      setReconnectRequired(false)
      setPersonalSyncStatus('synced')
      setPersonalSyncMessage('Google Driveへ再接続し、保持していた未保存変更を保存しました。')
    } catch (error) {
      setReconnectRequired(true)
      setPersonalSyncStatus('offline')
      setPersonalSyncMessage(error instanceof Error ? error.message : 'Google Driveへの再接続に失敗しました。')
    }
  }

  const logout = async () => {
    const provider = authRef.current
    ++storageGenerationRef.current
    authRef.current = null
    repositoryRef.current = null
    expectedVersionRef.current = null
    personalLoadedRef.current = false
    setAccount(null)
    setPersonalData(createEmptyAppData())
    setLocalCandidate(null)
    setLocalCandidateScenario(null)
    setReconnectRequired(false)
    unsavedPersonalRef.current = null
    rememberConflict(null)
    setPersonalSyncStatus('signed-out')
    setPersonalSyncMessage('ログアウトし、トークン・アカウント表示・個人データをメモリから消去しました。')
    if (runtime.storageMode === 'google') {
      setMode('demo')
      setEntryChosen(false)
    }
    try {
      await provider?.logout()
    } catch {
      // UIとメモリ上の参照は先に破棄済み。revoke失敗で個人データを画面へ戻さない。
    }
  }

  const rememberLocalDecision = (candidate: LocalDriveCandidate) => {
    if (!account) return
    try {
      localStorage.setItem(
        driveMigrationMarkerKey(account.id),
        localCandidateFingerprint(candidate),
      )
    } catch {
      // marker保存に失敗しても、本人データのDrive保存結果は取り消さない。
    }
  }

  const saveLocalCandidateToDrive = async () => {
    if (!localCandidate || !repositoryRef.current) return
    if (
      localCandidateScenario === 'both' &&
      !window.confirm('Google Driveの現在データを、この端末の既存データで上書きします。続けますか？')
    ) return

    try {
      if (localCandidate.backupKey !== null) {
        localStorage.setItem(localCandidate.backupKey, localCandidate.raw)
      }
      setPersonalSyncStatus('saving')
      const result = await repositoryRef.current.save(localCandidate.data, expectedVersionRef.current ?? undefined)
      if (result.status === 'conflict') {
        rememberConflict(result.conflict)
        setPersonalSyncStatus('conflict')
        setPersonalSyncMessage(result.conflict.message)
        return
      }
      expectedVersionRef.current = result.version
      setPersonalData(result.data)
      rememberLocalDecision(localCandidate)
      setLocalCandidate(null)
      setLocalCandidateScenario(null)
      setPersonalSyncStatus('synced')
      setPersonalSyncMessage(`${localCandidate.source}をDriveへ移行しました。元の端末データは削除していません。`)
    } catch (error) {
      setReconnectRequired(needsGoogleReconnect(error))
      setPersonalSyncStatus('offline')
      setPersonalSyncMessage(needsGoogleReconnect(error)
        ? 'Google Driveへの接続期限が切れました。端末データは変更していません。再接続してください。'
        : error instanceof Error ? error.message : 'Driveへの移行に失敗しました。端末データは変更していません。')
    }
  }

  const startWithEmptyDrive = async () => {
    const repository = repositoryRef.current
    if (!repository) return
    try {
      setPersonalSyncStatus('saving')
      const initial = createEmptyAppData()
      const result = await repository.save(initial, expectedVersionRef.current ?? undefined)
      if (result.status === 'conflict') {
        rememberConflict(result.conflict)
        setPersonalSyncStatus('conflict')
        setPersonalSyncMessage(result.conflict.message)
        return
      }
      expectedVersionRef.current = result.version
      setPersonalData(result.data)
      if (localCandidate !== null) rememberLocalDecision(localCandidate)
      setLocalCandidate(null)
      setLocalCandidateScenario(null)
      setPersonalSyncStatus('synced')
      setPersonalSyncMessage('Google Driveに新しい空のデータを作成しました。端末の既存データは残しています。')
    } catch (error) {
      setReconnectRequired(needsGoogleReconnect(error))
      setPersonalSyncStatus('offline')
      setPersonalSyncMessage(needsGoogleReconnect(error)
        ? 'Google Driveへの接続期限が切れました。端末データは変更していません。再接続してください。'
        : error instanceof Error ? error.message : 'Driveへ新規データを作成できませんでした。')
    }
  }

  const cancelLocalMigration = async () => {
    setLocalCandidate(null)
    setLocalCandidateScenario(null)
    await logout()
  }

  const useRemoteData = () => {
    if (localCandidate !== null) rememberLocalDecision(localCandidate)
    setLocalCandidate(null)
    setLocalCandidateScenario(null)
    setPersonalSyncMessage('Google Driveのデータを使用します。この端末の既存データは残しています。')
  }

  const reloadRemote = async () => {
    if (!repositoryRef.current) return
    const activeConflict = conflictRef.current
    if (activeConflict?.localBackup) downloadConflict(activeConflict)
    rememberConflict(null)
    await loadRepository(repositoryRef.current)
  }

  const previewBackupImport = async (raw: string): Promise<ImportPreview> => {
    if (mode === 'demo') return createImportPreview(raw)
    const repository = repositoryRef.current
    if (!repository) throw new Error('保存先を読み込んでからバックアップを選んでください。現在データは変更していません。')
    return repository.importBackup(raw)
  }

  const commitBackupImport = async (preview: ImportPreview): Promise<void> => {
    if (mode === 'demo') {
      const verified = createImportPreview(preview.raw)
      setDemoData(verified.data)
      return
    }

    const repository = repositoryRef.current
    if (!repository) throw new Error('保存先が利用できないため反映していません。現在データは変更していません。')
    const generation = storageGenerationRef.current
    setPersonalSyncStatus('saving')
    setPersonalSyncMessage('検証済みバックアップを保存先へ反映しています。')

    try {
      const result = await repository.commitImport(preview, expectedVersionRef.current ?? undefined)
      if (generation !== storageGenerationRef.current) {
        throw new Error('保存先が切り替わったため反映を中止しました。現在データは変更していません。')
      }
      if (result.status === 'conflict') {
        rememberConflict(result.conflict)
        setPersonalSyncStatus('conflict')
        setPersonalSyncMessage(result.conflict.message)
        throw new Error(`${result.conflict.message} 現在の画面データは置き換えていません。`)
      }

      expectedVersionRef.current = result.version
      setPersonalData(result.data)
      personalLoadedRef.current = true
      rememberConflict(null)
      setPersonalSyncStatus('synced')
      setPersonalSyncMessage('バックアップの保存完了を確認してから画面へ反映しました。')
    } catch (error) {
      if (generation === storageGenerationRef.current && conflictRef.current === null) {
        setReconnectRequired(needsGoogleReconnect(error))
        setPersonalSyncStatus('offline')
        setPersonalSyncMessage(needsGoogleReconnect(error)
          ? 'Google Driveへの接続期限が切れました。バックアップは反映せず、previewを保持しています。再接続してください。'
          : error instanceof Error ? error.message : 'バックアップを保存できませんでした。')
      }
      throw error
    }
  }

  const openCompany = (id: string) => {
    setSelectedId(id)
    setSelectedEventId(null)
    setView('companies')
  }
  const openAction = (action: TodayAction) => {
    setSelectedId(action.userCompanyId)
    setSelectedEventId(action.selectionEventId ?? null)
    setView('companies')
  }
  const setActionStatus = (action: TodayAction, status: TodayAction['status']) => {
    const now = new Date().toISOString()
    if (action.source === 'watch_finding' && action.watchFindingId) {
      commitData(touch(data, { watchFindings: updateWatchFindingStatus(data.watchFindings, action.watchFindingId, status as WatchFindingStatus) }, now))
      return
    }
    if (action.source !== 'selection_event' || !action.selectionEventId) return
    commitData(touch(data, { userCompanies: data.userCompanies.map((company) => company.id !== action.userCompanyId ? company : {
      ...company,
      updatedAt: now,
      events: company.events.map((event) => event.id === action.selectionEventId ? { ...event, status: status as SelectionEvent['status'] } : event),
    }) }, now))
  }

  const saveCompany = (draft: UserCompanyDraft, values: Record<string, number | null>) => {
    const now = new Date().toISOString()
    const companyId = formState?.kind === 'edit' ? formState.companyId : createId('user-company')
    const currentCompany = data.userCompanies.find((item) => item.id === companyId)
    const stageChanged = !currentCompany || selectionLabel(currentCompany) !== selectionLabel(draft)
    const company = {
      ...draft,
      id: companyId,
      events: currentCompany?.events ?? [],
      createdAt: currentCompany?.createdAt ?? now,
      updatedAt: now,
      selectionStageUpdatedAt: stageChanged ? now : currentCompany?.selectionStageUpdatedAt ?? now,
      lastCompanyInteractionAt: now,
    }
    const canonicalProfileId = data.canonicalScoringProfileId ?? profile.id
    const existingEvaluation = getEvaluation(data, companyId, canonicalProfileId)
    const evaluation = {
      id: existingEvaluation?.id ?? createId('evaluation'),
      userCompanyId: companyId,
      scoringProfileId: canonicalProfileId,
      values,
      createdAt: existingEvaluation?.createdAt ?? now,
      updatedAt: now,
    }
    const nextData = touch(data, {
      userCompanies: currentCompany ? data.userCompanies.map((item) => item.id === companyId ? company : item) : [...data.userCompanies, company],
      evaluations: existingEvaluation ? data.evaluations.map((item) => item.id === existingEvaluation.id ? evaluation : item) : [...data.evaluations, evaluation],
    }, now)
    commitData(nextData)
    if (repositoryRef.current instanceof SupabaseStorageRepository) {
      void repositoryRef.current.syncMonitoringTargets(syncMonitoringTargetsFromCandidates(nextData.userCompanies, []).targets)
        .then(() => currentCompany ? undefined : repositoryRef.current instanceof SupabaseStorageRepository ? repositoryRef.current.queueLimitedGmailBackfill(companyId) : undefined)
        .catch((error: unknown) => setPersonalSyncMessage(error instanceof Error ? error.message : '監視対象または限定Gmail確認の登録に失敗しました。'))
    }
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
  const approveFinding = (finding: CollectorFinding, companyId: string) => {
    if (!(repositoryRef.current instanceof SupabaseStorageRepository)) return
    const watch = approveCollectorFinding(finding, companyId)
    if (data.watchFindings.some(item => item.userCompanyId === companyId && item.fingerprint === finding.fingerprint)) return
    void repositoryRef.current.setCollectorFindingStatus(finding.id, 'approved').then(() => { commitData(touch(data, { watchFindings: [...data.watchFindings, watch] })); setCollectorFindings(items => items.filter(item => item.id !== finding.id)) }).catch(error => setPersonalSyncMessage(error instanceof Error ? error.message : '承認に失敗しました。'))
  }
  const rejectFinding = (id: string) => { if (!(repositoryRef.current instanceof SupabaseStorageRepository)) return; void repositoryRef.current.setCollectorFindingStatus(id, 'rejected').then(() => setCollectorFindings(items => items.filter(item => item.id !== id))).catch(error => setPersonalSyncMessage(error instanceof Error ? error.message : '却下に失敗しました。')) }

  const enterDemo = () => {
    setMode('demo')
    setEntryChosen(true)
  }

  const enterGooglePersonal = () => {
    setMode('personal')
    setEntryChosen(true)
    void login()
  }

  const personalGate = mode === 'personal' && (
    runtime.storageMode === 'disabled' || ((runtime.storageMode === 'google' || runtime.storageMode === 'supabase') && !account)
  )
  const personalEditsBlocked = mode === 'personal' && (
    conflict !== null || personalSyncStatus === 'loading' || localCandidate !== null
  )

  if (!entryChosen) {
    if (runtime.storageMode === 'google') return (
      <main className="welcome-screen"><section className="welcome-card" aria-labelledby="welcome-title"><span className="brand-mark welcome-mark" aria-hidden="true">J</span><p className="eyebrow">JOB HUNT MANAGER</p><h1 id="welcome-title">就活の情報を、次の行動へ。</h1><p>架空データで機能を見るか、自分のGoogle Driveへ接続して本人用データを開きます。</p><div className="welcome-actions"><button className="secondary-button" type="button" onClick={enterDemo}>デモを見る</button><button className="primary-button" type="button" disabled={!runtime.googleClientId} onClick={enterGooglePersonal}>Googleアカウントで利用する</button></div></section></main>
    )
    return <LandingPage onDemo={enterDemo} onLogin={enterGooglePersonal} loginAvailable={runtime.storageMode === 'supabase' ? Boolean(runtime.supabaseUrl && runtime.supabasePublishableKey) : Boolean(runtime.googleClientId)} />
  }

  return (
    <AppShell
      mode={mode}
      view={view}
      syncStatus={mode === 'demo' ? 'synced' : personalSyncStatus}
      storageLabel={storageLabel}
      accountEmail={account?.email}
      accountName={account?.name}
      accountPictureUrl={account?.pictureUrl}
      authAvailable={runtime.storageMode === 'google' || runtime.storageMode === 'supabase'}
      reconnectRequired={reconnectRequired}
      onModeChange={changeMode}
      onViewChange={setView}
      onLogin={() => void login()}
      onReconnect={() => void reconnectGoogleDrive()}
      onLogout={() => void logout()}
    >
      {mode === 'demo' && <div className="demo-ribbon" role="note"><strong>公開デモ</strong><span>企業・選考・Watchはすべて架空です。実在企業の情報ではありません。</span></div>}
      {mode === 'personal' && runtime.localDevelopment && <div className="development-ribbon" role="note"><strong>ローカル開発モード</strong><span>Google未設定でも開発・テストできます。本番の本人用モードへ黙って切り替わる設定ではありません。</span></div>}
      {personalSyncMessage && mode === 'personal' && <div className={personalSyncStatus === 'offline' || personalSyncStatus === 'conflict' ? 'notice error' : 'notice'} role="status">{personalSyncMessage}</div>}
      {mode === 'personal' && reconnectRequired && account && <div className="notice error reconnect-notice" role="alert"><strong>Google Driveへの再接続が必要です</strong><span>画面上の未保存変更はメモリに保持しています。別アカウントを選んだ場合は混在させず、そのアカウントのDriveを新しく読み込みます。</span><button className="primary-button small" type="button" onClick={() => void reconnectGoogleDrive()}>Google Driveへ再接続</button></div>}
      {mode === 'personal' && localCandidate && localCandidateScenario === 'drive-empty' && <div className="notice migration-notice" role="note"><strong>この端末の既存データを検出しました</strong><span>localStorage {localCandidate.source} / {localCandidate.data.userCompanies.length}社 / 更新 {new Date(localCandidate.updatedAt).toLocaleString('ja-JP')}。元データは削除しません。</span><button className="primary-button small" type="button" onClick={() => void saveLocalCandidateToDrive()}>移行する</button><button className="secondary-button" type="button" onClick={() => void startWithEmptyDrive()}>新規で開始</button><button className="text-button" type="button" onClick={() => void cancelLocalMigration()}>キャンセル</button></div>}
      {mode === 'personal' && localCandidate && localCandidateScenario === 'both' && <div className="notice migration-notice" role="note"><strong>Driveとこの端末の両方にデータがあります</strong><span>Google Drive: 更新 {new Date(personalData.updatedAt).toLocaleString('ja-JP')} / この端末 ({localCandidate.source}): 更新 {new Date(localCandidate.updatedAt).toLocaleString('ja-JP')}。自動統合・自動上書きはしません。</span><button className="primary-button small" type="button" onClick={useRemoteData}>Google Driveのデータを使用</button><button className="secondary-button" type="button" onClick={() => void saveLocalCandidateToDrive()}>この端末のデータをDriveへ上書き</button><button className="secondary-button" type="button" onClick={() => downloadJson(serializeAppDataV2(localCandidate.data), 'job-hunt-manager-local-candidate-v2.json')}>JSONバックアップをダウンロード</button></div>}
      {mode === 'personal' && conflict && <div className="notice error conflict-notice" role="alert" id="conflict-edit-lock"><strong>同期競合のため自動上書きと本人用データの編集を停止しました</strong><span>{conflict.message}</span><span>現在のlocal案はJSON退避できます。remote再読込を選ぶ場合も、先に同じlocal案を自動ダウンロードします。</span>{conflict.localBackup && <button className="secondary-button" type="button" onClick={() => downloadConflict(conflict)}>local案をJSON退避</button>}<button className="secondary-button" type="button" onClick={() => void reloadRemote()}>{conflict.localBackup ? 'local案を退避してremote再読込' : 'remoteを再読込'}</button></div>}

      <fieldset disabled={personalEditsBlocked} aria-describedby={mode === 'personal' && conflict ? 'conflict-edit-lock' : undefined} style={{ border: 0, margin: 0, minWidth: 0, padding: 0, width: '100%' }}>
        {personalGate ? (
          <section className="access-gate" aria-labelledby="access-title">
            <p className="eyebrow">PERSONAL MODE</p><h1 id="access-title">本人用データを開く</h1>
            <p>{runtime.storageMode === 'google' ? 'Google Drive appDataFolderから、自分のデータを読み込みます。要求するDrive権限はdrive.appdataだけです。' : '本番の本人用モードはGoogle設定後のみ利用できます。ローカル開発はVITE_STORAGE_MODE=localを明示してください。'}</p>
            {runtime.storageMode === 'google' && <button className="primary-button" type="button" onClick={() => void login()}>Googleでログインして読み込む</button>}
            <small>このGoogleアカウントのDriveへ個人データを保存します。将来のメール連携では別のGoogleアカウントも選べる設計を想定しています。現在Gmail権限は要求しません。</small>
          </section>
        ) : (
          <>
            {view === 'dashboard' && <Dashboard companies={companyViews} findings={data.watchFindings} collectorStates={collectorStates} collectorFindings={collectorFindings} onOpenCompany={openCompany} onAddCompany={() => setFormState({ kind: 'add' })} onOpenWatch={() => setView('watch')} onOpenCollectorFindings={() => setView('findings')} onOpenAction={openAction} onCompleteAction={(action) => setActionStatus(action, action.source === 'selection_event' ? '完了' : 'completed')} onUndoAction={(action) => setActionStatus(action, action.status)} />}
            {view === 'companies' && <CompanyList companies={companyViews} profile={profile} filters={filters} onFiltersChange={setFilters} onOpen={openCompany} onEdit={(companyId) => setFormState({ kind: 'edit', companyId })} onDelete={deleteCompany} onAdd={() => setFormState({ kind: 'add' })} />}
            {view === 'scoring' && <ScoringSettings data={data} onChange={commitData} />}
            {view === 'ai-sync' && <AiSync data={data} catalog={catalog} onChange={commitData} />}
            {view === 'watch' && <WatchCenter companies={companyViews} findings={data.watchFindings} runs={data.watchRuns} onStatusChange={changeWatchStatus} onOpenCompany={openCompany} />}
            {view === 'findings' && <CollectorFindings findings={collectorFindings} companies={companyViews} onApprove={approveFinding} onReject={rejectFinding} />}
            {view === 'data' && <DataTools mode={mode} data={data} storageLabel={storageLabel} syncStatus={mode === 'demo' ? 'synced' : personalSyncStatus} accountEmail={account?.email} collectorStates={collectorStates} collectorFindings={collectorFindings} onPreviewImport={previewBackupImport} onCommitImport={commitBackupImport} onPreviewCsvImport={previewCsvImport} onCommitCsvImport={commitCsvImport} onClear={() => commitData(createEmptyAppData())} onResetDemo={() => setDemoData(createDemoAppData())} />}

            {selectedView && <CompanyDetail view={selectedView} profile={profile} highlightedEventId={selectedEventId} gmailAccount={collectorStates.find((state) => state.collectorType === 'gmail')?.gmailAccount ?? null} onClose={() => { setSelectedId(null); setSelectedEventId(null) }} onEdit={() => { setFormState({ kind: 'edit', companyId: selectedView.company.id }); setSelectedId(null); setSelectedEventId(null) }} onUpdateEvents={updateEvents} onSaveFact={saveFact} />}
            {formState && <CompanyForm companyView={editingView} catalog={catalog} profile={profile} evaluation={editingView?.evaluation ?? null} onSubmit={saveCompany} onSaveProfile={(profileDraft) => commitData(saveProfileDraft(data, profileDraft))} onCancel={() => setFormState(null)} />}
          </>
        )}
      </fieldset>
    </AppShell>
  )
}
