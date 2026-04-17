import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Clock, Banknote, XCircle, CheckCircle, Loader2 } from 'lucide-react'

interface CashierFundRequestProps {
  onSessionOpened?: () => void
}

export function CashierFundRequest({ onSessionOpened }: CashierFundRequestProps) {
  const myFundRequest = useQuery(api.safe.getMyFundRequest)
  const currentSession = useQuery(api.cashSessions.getCurrentSession)
  const safeIsInitialized = useQuery(api.safe.isSafeInitialized)

  const requestCashFund = useMutation(api.safe.requestCashFund)
  const cancelFundRequest = useMutation(api.safe.cancelFundRequest)

  const handleRequest = async () => {
    try {
      await requestCashFund({})
      toast.success('Demande envoyée', {
        description: 'Un responsable va vous attribuer un fond de caisse'
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    }
  }

  const handleCancel = async () => {
    try {
      await cancelFundRequest({})
      toast.success('Demande annulée')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    }
  }

  // Si le coffre n'est pas initialisé, ne pas afficher ce composant
  if (safeIsInitialized === false) {
    return null
  }

  // Chargement
  if (myFundRequest === undefined || currentSession === undefined) {
    return (
      <Card>
        <CardContent className="py-6 sm:py-8">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-gray-400" />
            <span className="text-gray-500 text-sm">Chargement...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Si déjà une session ouverte, ne rien afficher (le composant normal de caisse prend le relais)
  if (currentSession && currentSession.status === 'open') {
    onSessionOpened?.()
    return null
  }

  // Si session clôturée
  if (currentSession && currentSession.status === 'closed') {
    return null
  }

  // Demande en attente
  if (myFundRequest && myFundRequest.status === 'pending') {
    return (
      <Card className="border-[#CF761C]/30 bg-[#CF761C]/5">
        <CardHeader className="text-center p-4 sm:p-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#CF761C]/20 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-[#CF761C] animate-pulse" />
          </div>
          <CardTitle className="text-lg sm:text-xl text-[#CF761C]">Demande en cours</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Votre demande de fond de caisse est en attente de validation par un responsable
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center p-4 sm:p-6 pt-0 sm:pt-0">
          <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
            Veuillez patienter ou contacter un administrateur
          </p>
          <Button
            variant="outline"
            onClick={handleCancel}
            className="text-red-600 border-red-200 hover:bg-red-50 text-sm h-9"
          >
            <XCircle className="w-4 h-4 mr-1.5 sm:mr-2" />
            Annuler ma demande
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Pas de demande en cours - afficher le bouton pour demander
  return (
    <Card>
      <CardHeader className="text-center p-4 sm:p-6">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#016124]/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
          <Banknote className="w-6 h-6 sm:w-8 sm:h-8 text-[#016124]" />
        </div>
        <CardTitle className="text-lg sm:text-xl">Ouvrir ma caisse</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Demandez un fond de caisse à un responsable pour commencer votre journée
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center p-4 sm:p-6 pt-0 sm:pt-0">
        <Button
          onClick={handleRequest}
          className="bg-[#016124] hover:bg-[#017a2e] text-sm sm:text-base"
          size="lg"
        >
          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
          Demander un fond de caisse
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * Composant pour afficher le statut du versement en attente (après clôture)
 */
export function PendingDepositStatus() {
  const myPendingDeposit = useQuery(api.safe.getMyPendingDeposit)

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  if (!myPendingDeposit) {
    return null
  }

  return (
    <div className="p-3 sm:p-4 bg-[#7ABE4E]/10 rounded-lg border border-[#7ABE4E]/30">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#7ABE4E]/20 rounded-full flex items-center justify-center flex-shrink-0">
          <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 text-sm sm:text-base">Versement en attente</p>
          <p className="text-xs sm:text-sm text-gray-500">
            Un responsable doit confirmer la réception de {formatPrice(myPendingDeposit.expectedAmount)} FCFA
          </p>
        </div>
      </div>
    </div>
  )
}
