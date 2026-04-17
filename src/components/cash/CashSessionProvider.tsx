import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { OpenSessionModal } from './OpenSessionModal'
import { CloseSessionModal } from './CloseSessionModal'
import { CashierFundRequest, PendingDepositStatus } from '@/components/safe'

interface CashSessionContextType {
  hasOpenSession: boolean
  isSessionClosed: boolean
  sessionData: {
    openingAmount: number
    openedAt: number
    userName: string
  } | null
  openCloseModal: () => void
  /** Indique si l'admin fait des ventes directes (sans session, vers le coffre) */
  isAdminDirectSale: boolean
}

const CashSessionContext = createContext<CashSessionContextType | null>(null)

export function useCashSession() {
  const context = useContext(CashSessionContext)
  if (!context) {
    throw new Error('useCashSession must be used within a CashSessionProvider')
  }
  return context
}

interface CashSessionProviderProps {
  children: ReactNode
  /**
   * Si true, exige une session de caisse ouverte pour afficher le contenu.
   * Si false, le contenu est accessible sans session (utile pour dashboard admin/manager).
   * Par défaut: true
   */
  requireSession?: boolean
}

export function CashSessionProvider({ children, requireSession = true }: CashSessionProviderProps) {
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [fundApproved, setFundApproved] = useState(false)

  const currentSession = useQuery(api.cashSessions.getCurrentSession)
  const sessionStatus = useQuery(api.cashSessions.hasOpenSession)
  const safeIsInitialized = useQuery(api.safe.isSafeInitialized)
  const myFundRequest = useQuery(api.safe.getMyFundRequest)
  const myPendingDeposit = useQuery(api.safe.getMyPendingDeposit)
  const currentUser = useQuery(api.users.getCurrentUser)

  const handleOpenSessionSuccess = useCallback(() => {
    setFundApproved(false)
  }, [])

  const handleCloseSessionSuccess = useCallback(() => {
    setShowCloseModal(false)
  }, [])

  const openCloseModal = useCallback(() => {
    setShowCloseModal(true)
  }, [])

  // Callback quand la session s'ouvre via le workflow du coffre
  const handleFundSessionOpened = useCallback(() => {
    setFundApproved(true)
  }, [])

  // En attente des données
  if (sessionStatus === undefined || safeIsInitialized === undefined || currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  // Les admins peuvent toujours bypass (ventes directes au coffre)
  // Les managers peuvent bypass seulement si requireSession=false (dashboard)
  const isAdmin = currentUser?.role === 'admin'
  const isManager = currentUser?.role === 'manager'
  const isPrivilegedUser = isAdmin || isManager

  // L'admin peut toujours bypass pour faire des ventes directes au coffre
  // Les managers ne peuvent bypass que si requireSession=false (dashboard seulement)
  const canBypassSession = isAdmin || (!requireSession && isManager)

  const hasOpenSession = sessionStatus.hasSession && sessionStatus.status === 'open'
  const isSessionClosed = sessionStatus.hasSession && sessionStatus.status === 'closed'
  const needsToOpenSession = !sessionStatus.hasSession

  // Vérifier si le coffre est initialisé et si le workflow de demande de fond est actif
  const safeIsActive = safeIsInitialized === true
  const hasApprovedFundRequest = myFundRequest?.status === 'approved'
  const approvedAmount = hasApprovedFundRequest && myFundRequest ? (myFundRequest as { amount?: number }).amount : undefined

  // Données de la session pour le contexte
  const sessionData = currentSession && currentSession.status === 'open'
    ? {
        openingAmount: currentSession.openingAmount,
        openedAt: currentSession.openedAt,
        userName: currentSession.userName,
      }
    : null

  // Workflow de demande de fond (coffre actif) :
  // - Seulement pour les caissiers (pas admin/manager)
  // - Seulement si pas de session et pas déjà clôturée
  // - Seulement si requireSession=true
  const showFundRequestWorkflow = safeIsActive && needsToOpenSession && !fundApproved && !isSessionClosed && !isPrivilegedUser && requireSession

  // Modal d'ouverture standard :
  // - S'affiche si pas de session ouverte
  // - Ne s'affiche pas pour les admins (ventes directes au coffre)
  // - Ne s'affiche pas si le workflow de demande est affiché
  // - Pour les managers sans session, on affiche le modal sur la page caisse (requireSession=true)
  const shouldShowOpenModal = needsToOpenSession && !isAdmin && !showFundRequestWorkflow && requireSession

  // Le contenu est visible si :
  // - L'admin peut toujours voir (ventes directes au coffre)
  // - Manager peut bypass sur dashboard (!requireSession)
  // - Ou si le workflow de demande n'est pas affiché (session ouverte ou modal standard géré)
  const shouldShowContent = canBypassSession || !showFundRequestWorkflow

  // L'admin fait des ventes directes si:
  // - Il est admin ET il n'a pas de session ouverte ET le coffre est actif
  const isAdminDirectSale = isAdmin && !hasOpenSession && safeIsActive

  return (
    <CashSessionContext.Provider
      value={{
        hasOpenSession,
        isSessionClosed,
        sessionData,
        openCloseModal,
        isAdminDirectSale,
      }}
    >
      {/* Workflow de demande de fond de caisse (si coffre actif) - seulement pour les caissiers */}
      {showFundRequestWorkflow && (
        <div className="flex items-center justify-center min-h-screen p-6 bg-gray-50">
          <div className="w-full max-w-md space-y-4">
            <CashierFundRequest onSessionOpened={handleFundSessionOpened} />
            {myPendingDeposit && <PendingDepositStatus />}
          </div>
        </div>
      )}

      {/* Modal d'ouverture standard (seulement pour les caissiers) */}
      {shouldShowOpenModal && (
        <OpenSessionModal
          open={needsToOpenSession}
          onSuccess={handleOpenSessionSuccess}
          prefilledAmount={approvedAmount}
          fundRequestApproved={hasApprovedFundRequest}
        />
      )}

      {/* Modal de clôture (pour tous les utilisateurs qui ont une session) */}
      <CloseSessionModal
        open={showCloseModal}
        onOpenChange={setShowCloseModal}
        onSuccess={handleCloseSessionSuccess}
      />

      {/* Contenu de l'application */}
      {shouldShowContent && children}
    </CashSessionContext.Provider>
  )
}
