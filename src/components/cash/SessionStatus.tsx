import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useCashSession } from './CashSessionProvider'
import { Lock } from 'lucide-react'

export function SessionStatus() {
  const { hasOpenSession, isSessionClosed, sessionData, openCloseModal } = useCashSession()
  const expectedData = useQuery(api.cashSessions.calculateExpectedAmount, {})

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Session clôturée
  if (isSessionClosed) {
    return (
      <div className="bg-gray-100 border-b border-gray-200 px-2 sm:px-4 py-1.5 sm:py-2">
        <div className="max-w-lg mx-auto flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
          <Lock className="w-3 h-3 sm:w-4 sm:h-4" />
          <span>Caisse clôturée pour aujourd'hui</span>
        </div>
      </div>
    )
  }

  // Session ouverte
  if (hasOpenSession && sessionData) {
    return (
      <div className="bg-locagri-success/10 border-b border-locagri-success/30 px-2 sm:px-4 py-1.5 sm:py-2">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-3 text-[10px] sm:text-sm flex-wrap min-w-0">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-locagri-success rounded-full animate-pulse shrink-0" />
              <span className="text-locagri-primary font-medium">Ouverte</span>
            </span>
            <span className="text-locagri-primary/80 hidden sm:inline">
              {formatTime(sessionData.openedAt)}
            </span>
            <span className="text-muted-foreground hidden sm:inline">|</span>
            <span className="text-locagri-primary/80">
              Fond: {formatPrice(sessionData.openingAmount)}
            </span>
            {expectedData && (
              <span className="text-locagri-primary/80 hidden sm:inline">
                | Attendu: {formatPrice(expectedData.expectedAmount)}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-[10px] sm:text-xs border-locagri-success/50 text-locagri-primary hover:bg-locagri-success/20 h-6 sm:h-7 px-2 shrink-0"
            onClick={openCloseModal}
          >
            Clôturer
          </Button>
        </div>
      </div>
    )
  }

  // Pas de session (ne devrait pas arriver si le provider fonctionne)
  return null
}
