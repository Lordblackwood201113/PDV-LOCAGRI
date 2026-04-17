import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { ProductSetup } from '@/components/sales'
import { CashSessionProvider, useCashSession } from '@/components/cash'
import { QuickSalePanel, RecentSales } from '@/components/dashboard'
import { ExpenseRequestForm, MyExpensesList } from '@/components/expenses'
import { Lock, Clock, Banknote, Smartphone, CheckCircle, AlertCircle, Receipt, Wallet, RotateCcw, Vault } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function SalesPage() {
  const products = useQuery(api.products.getProducts)
  const currentUser = useQuery(api.users.getCurrentUser)

  // Chargement
  if (products === undefined || currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#7ABE4E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500">Chargement...</p>
        </div>
      </div>
    )
  }

  // Produit non configuré - seul l'admin peut configurer
  if (!products || products.length === 0) {
    if (currentUser?.role === 'admin') {
      return <ProductSetup />
    }

    // Les autres rôles ne peuvent pas configurer
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-6">
        <div className="text-center max-w-md bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Configuration en attente</h2>
          <p className="text-slate-500">
            Aucun produit n'a été configuré.
            <br />
            Veuillez contacter un administrateur.
          </p>
        </div>
      </div>
    )
  }

  // Interface de caisse avec gestion de session
  return (
    <CashSessionProvider>
      <SalesContent />
    </CashSessionProvider>
  )
}

// Composant séparé pour accéder au contexte de session
function SalesContent() {
  const [activeTab, setActiveTab] = useState('sales')
  const { isSessionClosed, sessionData, openCloseModal, isAdminDirectSale } = useCashSession()
  const currentSession = useQuery(api.cashSessions.getCurrentSession)
  const withdrawnExpenses = useQuery(api.expenses.getWithdrawnExpensesForSession, {})

  // Session clôturée - afficher le récapitulatif
  // SAUF pour les admins qui peuvent continuer en mode vente directe au coffre
  if (isSessionClosed && currentSession && !isAdminDirectSale) {
    return <ClosedSessionSummary session={currentSession} />
  }

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  // Session ouverte ou mode admin direct - afficher l'interface de caisse
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Barre de statut pour l'admin en mode vente directe */}
      {isAdminDirectSale && (
        <div className="bg-[#CF761C] text-white px-3 sm:px-6 py-2 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Vault className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">Mode Admin - Ventes au coffre</span>
            </div>
            <span className="text-white/80 text-xs hidden sm:block">
              Les ventes en espèces sont automatiquement ajoutées au coffre
            </span>
          </div>
        </div>
      )}

      {/* Session status bar (mode normal avec session) */}
      {sessionData && !isAdminDirectSale && (
        <div className="bg-[#016124] text-white px-3 sm:px-6 py-2 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-[#7ABE4E] rounded-full animate-pulse" />
                Caisse ouverte
              </span>
              <span className="text-[#7ABE4E]/80 hidden sm:inline">
                Ouvert à {new Date(sessionData.openedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[#7ABE4E]/80">
                Fond: {formatPrice(sessionData.openingAmount)} F
              </span>
              {withdrawnExpenses && withdrawnExpenses.total > 0 && (
                <span className="text-[#CF761C]">
                  <Wallet className="w-3 h-3 inline mr-1" />
                  -{formatPrice(withdrawnExpenses.total)} F
                </span>
              )}
            </div>
            <button
              onClick={openCloseModal}
              className="text-xs sm:text-sm font-medium text-[#7ABE4E]/90 hover:text-white transition-colors self-end sm:self-auto"
            >
              Clôturer
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-4 sm:mb-6">
            <TabsTrigger value="sales" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
              <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Ventes
            </TabsTrigger>
            <TabsTrigger value="expenses" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
              <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Dépenses
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="flex-1 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Quick Sale Panel - Interface de vente */}
              <div className="lg:col-span-1 order-1">
                <QuickSalePanel />
              </div>

              {/* Recent Sales - Ventes récentes */}
              <div className="lg:col-span-2 order-2">
                <RecentSales />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="expenses" className="flex-1 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Formulaire de demande */}
              <div>
                <ExpenseRequestForm />
              </div>

              {/* Mes demandes */}
              <div>
                <MyExpensesList />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// Récapitulatif après clôture
interface ClosedSessionSummaryProps {
  session: {
    _id: string
    openingAmount: number
    closingAmount?: number
    expectedAmount?: number
    discrepancy?: number
    discrepancyReason?: string
    totalCashSales?: number
    totalMobileSales?: number
    salesCount?: number
    openedAt: number
    closedAt?: number
  }
}

function ClosedSessionSummary({ session }: ClosedSessionSummaryProps) {
  const [isReopening, setIsReopening] = useState(false)
  const withdrawnExpenses = useQuery(api.expenses.getWithdrawnExpensesForSession, {
    sessionId: session._id as any
  })
  const reopenSession = useMutation(api.cashSessions.reopenSession)

  const handleReopenSession = async () => {
    setIsReopening(true)
    try {
      const result = await reopenSession({})
      if (result.needsNewFundRequest) {
        toast.success('Nouvelle session', {
          description: 'Demandez un nouveau fond de caisse pour reprendre le travail'
        })
      } else {
        toast.success('Caisse rouverte', {
          description: 'Vous pouvez continuer à travailler'
        })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsReopening(false)
    }
  }

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="h-full overflow-auto p-3 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-5 sm:p-8 shadow-sm border border-gray-100 text-center">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
          <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-gray-600" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Caisse clôturée</h1>
        <p className="text-sm sm:text-base text-gray-500 mt-1">Votre journée de travail est terminée</p>

        {/* Bouton de réouverture */}
        <Button
          onClick={handleReopenSession}
          disabled={isReopening}
          variant="outline"
          className="mt-4 border-[#016124] text-[#016124] hover:bg-[#016124]/10 text-sm"
        >
          <RotateCcw className={`w-4 h-4 mr-2 ${isReopening ? 'animate-spin' : ''}`} />
          {isReopening ? 'Réouverture...' : 'Rouvrir la caisse'}
        </Button>
      </div>

      {/* Timing */}
      <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 sm:gap-3 text-gray-600 mb-3 sm:mb-4">
          <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="font-medium text-sm sm:text-base">Horaires</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
            <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Ouverture</p>
            <p className="text-base sm:text-lg font-semibold text-gray-900">{formatTime(session.openedAt)}</p>
          </div>
          {session.closedAt && (
            <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Clôture</p>
              <p className="text-base sm:text-lg font-semibold text-gray-900">{formatTime(session.closedAt)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Montants */}
      <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 sm:gap-3 text-gray-600 mb-3 sm:mb-4">
          <Banknote className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="font-medium text-sm sm:text-base">Récapitulatif financier</span>
        </div>
        <div className="space-y-2 sm:space-y-3 text-sm sm:text-base">
          <div className="flex justify-between py-2">
            <span className="text-gray-500">Fond d'ouverture</span>
            <span className="font-semibold text-gray-900">{formatPrice(session.openingAmount)} F</span>
          </div>
          {session.totalCashSales !== undefined && (
            <div className="flex justify-between py-2 border-t border-gray-100">
              <span className="text-gray-500 flex items-center gap-2">
                <div className="w-2 h-2 bg-[#7ABE4E] rounded-full flex-shrink-0" />
                <span className="truncate">Espèces</span>
              </span>
              <span className="font-semibold text-[#016124] whitespace-nowrap">+{formatPrice(session.totalCashSales)} F</span>
            </div>
          )}
          {session.totalMobileSales !== undefined && (
            <div className="flex justify-between py-2 border-t border-gray-100">
              <span className="text-gray-500 flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">Mobile</span>
              </span>
              <span className="font-semibold text-[#CF761C] whitespace-nowrap">{formatPrice(session.totalMobileSales)} F</span>
            </div>
          )}
          {withdrawnExpenses && withdrawnExpenses.total > 0 && (
            <div className="flex justify-between py-2 border-t border-gray-100">
              <span className="text-gray-500 flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">Dépenses ({withdrawnExpenses.count})</span>
              </span>
              <span className="font-semibold text-red-600 whitespace-nowrap">-{formatPrice(withdrawnExpenses.total)} F</span>
            </div>
          )}
          <div className="flex justify-between py-2 sm:py-3 border-t-2 border-gray-200">
            <span className="font-medium text-gray-700">Attendu</span>
            <span className="font-bold text-base sm:text-lg text-gray-900 whitespace-nowrap">{formatPrice(session.expectedAmount || 0)} F</span>
          </div>
          {session.closingAmount !== undefined && (
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Déclaré</span>
              <span className="font-semibold text-gray-900 whitespace-nowrap">{formatPrice(session.closingAmount)} F</span>
            </div>
          )}
        </div>
      </div>

      {/* Écart */}
      {session.discrepancy !== undefined && (
        <div className={`rounded-xl p-4 sm:p-5 shadow-sm border ${
          session.discrepancy === 0
            ? 'bg-[#7ABE4E]/10 border-[#7ABE4E]/30'
            : session.discrepancy > 0
              ? 'bg-blue-50 border-blue-200'
              : 'bg-rose-50 border-rose-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              {session.discrepancy === 0 ? (
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-[#016124] flex-shrink-0" />
              ) : (
                <AlertCircle className={`w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 ${session.discrepancy > 0 ? 'text-blue-600' : 'text-rose-600'}`} />
              )}
              <div>
                <p className={`font-medium text-sm sm:text-base ${
                  session.discrepancy === 0 ? 'text-[#016124]' : session.discrepancy > 0 ? 'text-blue-700' : 'text-rose-700'
                }`}>
                  {session.discrepancy === 0 ? 'Caisse équilibrée' : session.discrepancy > 0 ? 'Excédent' : 'Manquant'}
                </p>
                {session.discrepancyReason && (
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">{session.discrepancyReason}</p>
                )}
              </div>
            </div>
            {session.discrepancy !== 0 && (
              <span className={`text-lg sm:text-xl font-bold self-end sm:self-auto ${session.discrepancy > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                {session.discrepancy > 0 ? '+' : ''}{formatPrice(session.discrepancy)} F
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {session.salesCount !== undefined && (
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-3xl sm:text-4xl font-bold text-[#016124]">{session.salesCount}</p>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            vente{session.salesCount !== 1 ? 's' : ''} réalisée{session.salesCount !== 1 ? 's' : ''} aujourd'hui
          </p>
        </div>
      )}

      <p className="text-center text-xs sm:text-sm text-gray-400">
        Vous pouvez rouvrir la caisse si vous devez continuer à travailler
      </p>
      </div>
    </div>
  )
}
