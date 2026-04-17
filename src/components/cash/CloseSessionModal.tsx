import { useState, useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Lock, Wallet } from 'lucide-react'

interface CloseSessionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CloseSessionModal({ open, onOpenChange, onSuccess }: CloseSessionModalProps) {
  const [closingAmount, setClosingAmount] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const closeSession = useMutation(api.cashSessions.closeSession)
  const expectedData = useQuery(api.cashSessions.calculateExpectedAmount, {})
  const currentSession = useQuery(api.cashSessions.getCurrentSession)
  const withdrawnExpenses = useQuery(api.expenses.getWithdrawnExpensesForSession, {})

  // Réinitialiser quand le modal s'ouvre
  useEffect(() => {
    if (open) {
      setClosingAmount('')
      setReason('')
    }
  }, [open])

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Calculer l'écart
  const amount = parseInt(closingAmount) || 0
  const expected = expectedData?.expectedAmount ?? 0
  const discrepancy = amount - expected
  const hasDiscrepancy = closingAmount !== '' && discrepancy !== 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amount = parseInt(closingAmount)

    if (isNaN(amount) || amount < 0) {
      toast.error('Veuillez entrer un montant valide')
      return
    }

    if (hasDiscrepancy && !reason.trim()) {
      toast.error('Une justification est requise pour tout écart de caisse')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await closeSession({
        closingAmount: amount,
        discrepancyReason: hasDiscrepancy ? reason.trim() : undefined,
      })

      if (result.discrepancy === 0) {
        toast.success('Caisse clôturée', {
          description: 'Aucun écart constaté. Bonne journée !',
        })
      } else {
        toast.success('Caisse clôturée', {
          description: `Écart de ${result.discrepancy >= 0 ? '+' : ''}${formatPrice(result.discrepancy)} enregistré`,
        })
      }

      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!expectedData || !currentSession) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
            </div>
            Clôture de caisse
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Comptez les espèces et déclarez le montant réel pour clôturer votre journée.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
          {/* Récapitulatif de la journée */}
          <div className="p-3 sm:p-4 bg-muted rounded-lg space-y-2 sm:space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-muted-foreground">Ouverture</span>
              <span className="font-medium text-sm sm:text-base">
                {formatPrice(expectedData.openingAmount)}
                <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">
                  ({formatTime(currentSession.openedAt)})
                </span>
              </span>
            </div>

            <Separator />

            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-muted-foreground">Ventes espèces</span>
              <span className="font-medium text-[#016124] text-sm sm:text-base">
                +{formatPrice(expectedData.totalCashSales)}
                <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">
                  ({expectedData.cashSalesCount})
                </span>
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-muted-foreground">Ventes Mobile</span>
              <span className="font-medium text-[#CF761C] text-sm sm:text-base">
                {formatPrice(expectedData.totalMobileSales)}
                <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">
                  ({expectedData.mobileSalesCount})
                </span>
              </span>
            </div>

            {withdrawnExpenses && withdrawnExpenses.total > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  Dépenses
                </span>
                <span className="font-medium text-red-600 text-sm sm:text-base">
                  -{formatPrice(withdrawnExpenses.total)}
                  <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">
                    ({withdrawnExpenses.count})
                  </span>
                </span>
              </div>
            )}

            <Separator />

            <div className="flex justify-between items-center">
              <span className="font-medium text-xs sm:text-sm">Montant attendu</span>
              <span className="text-lg sm:text-xl font-bold text-primary">
                {formatPrice(expectedData.expectedAmount)}
              </span>
            </div>
          </div>

          {/* Champ montant réel */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="closing-amount" className="text-sm sm:text-base">
              Montant réel compté (FCFA)
            </Label>
            <Input
              id="closing-amount"
              type="number"
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              placeholder="Ex: 185000"
              min={0}
              disabled={isSubmitting}
              className="text-xl sm:text-2xl h-12 sm:h-14 text-center font-bold"
              autoFocus
            />
          </div>

          {/* Affichage de l'écart */}
          {closingAmount !== '' && (
            <div className={`p-3 sm:p-4 rounded-lg text-center ${
              discrepancy === 0
                ? 'bg-[#7ABE4E]/10 border border-[#7ABE4E]/30'
                : discrepancy > 0
                  ? 'bg-blue-50 border border-blue-200'
                  : 'bg-red-50 border border-red-200'
            }`}>
              {discrepancy === 0 ? (
                <>
                  <p className="text-[#016124] font-medium text-sm sm:text-base">Caisse équilibrée</p>
                  <p className="text-xs sm:text-sm text-[#016124]/80">Aucun écart constaté</p>
                </>
              ) : (
                <>
                  <p className={`text-base sm:text-lg font-bold ${discrepancy > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    Écart: {discrepancy > 0 ? '+' : ''}{formatPrice(discrepancy)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {discrepancy > 0 ? 'Excédent de caisse' : 'Manquant de caisse'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Champ justification (si écart) */}
          {hasDiscrepancy && (
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="reason" className="text-sm sm:text-base flex items-center gap-2">
                Justification de l'écart
                <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Expliquez la raison de cet écart..."
                disabled={isSubmitting}
                className="min-h-[60px] sm:min-h-[80px] text-sm"
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Cette justification sera enregistrée dans l'historique
              </p>
            </div>
          )}

          {/* Boutons */}
          <div className="flex gap-2 sm:gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-sm h-9 sm:h-10"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="flex-1 text-sm h-9 sm:h-10"
              disabled={isSubmitting || closingAmount === '' || (hasDiscrepancy && !reason.trim())}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Clôture...</span>
                </span>
              ) : (
                'Clôturer'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
