import { useState, useEffect } from 'react'
import { useMutation } from 'convex/react'
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
import { toast } from 'sonner'
import { Wallet, CheckCircle } from 'lucide-react'

interface OpenSessionModalProps {
  open: boolean
  onSuccess: () => void
  prefilledAmount?: number
  fundRequestApproved?: boolean
}

export function OpenSessionModal({ open, onSuccess, prefilledAmount, fundRequestApproved }: OpenSessionModalProps) {
  const [openingAmount, setOpeningAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const openSession = useMutation(api.cashSessions.openSession)

  // Pré-remplir avec le montant approuvé si disponible
  useEffect(() => {
    if (prefilledAmount !== undefined && open) {
      setOpeningAmount(prefilledAmount.toString())
    }
  }, [prefilledAmount, open])

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amount = parseInt(openingAmount)

    if (isNaN(amount) || amount < 0) {
      toast.error('Veuillez entrer un montant valide')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await openSession({ openingAmount: amount })

      toast.success('Caisse ouverte', {
        description: `Fond de caisse: ${formatPrice(result.openingAmount)}`,
      })

      setOpeningAmount('')
      onSuccess()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Raccourcis pour montants courants
  const quickAmounts = [0, 10000, 25000, 50000, 100000]

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#7ABE4E]/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
            </div>
            Ouverture de caisse
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {fundRequestApproved
              ? 'Votre demande de fond a été approuvée. Confirmez le montant reçu.'
              : 'Comptez et déclarez le montant en espèces présent dans la caisse avant de commencer.'
            }
          </DialogDescription>
        </DialogHeader>

        {/* Badge fond approuvé */}
        {fundRequestApproved && (
          <div className="flex items-center gap-2 p-2 sm:p-3 bg-[#7ABE4E]/10 rounded-lg border border-[#7ABE4E]/30">
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124] flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm font-medium text-[#016124]">Fond de caisse approuvé</p>
              <p className="text-[10px] sm:text-xs text-gray-600">Montant attribué: {formatPrice(prefilledAmount || 0)}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 mt-3 sm:mt-4">
          {/* Champ montant */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="opening-amount" className="text-sm sm:text-base">
              Montant en espèces (FCFA)
            </Label>
            <Input
              id="opening-amount"
              type="number"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              placeholder="Ex: 50000"
              min={0}
              disabled={isSubmitting}
              className="text-xl sm:text-2xl h-12 sm:h-14 text-center font-bold"
              autoFocus
            />
          </div>

          {/* Raccourcis montants */}
          <div className="space-y-1.5 sm:space-y-2">
            <p className="text-xs sm:text-sm text-muted-foreground">Montants rapides:</p>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant={parseInt(openingAmount) === amount ? 'default' : 'outline'}
                  size="sm"
                  className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3"
                  onClick={() => setOpeningAmount(amount.toString())}
                  disabled={isSubmitting}
                >
                  {amount === 0 ? 'Vide (0)' : formatPrice(amount)}
                </Button>
              ))}
            </div>
          </div>

          {/* Aperçu */}
          {openingAmount && !isNaN(parseInt(openingAmount)) && (
            <div className="p-3 sm:p-4 bg-primary/5 rounded-lg text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">Fond de caisse déclaré</p>
              <p className="text-2xl sm:text-3xl font-bold text-primary">
                {formatPrice(parseInt(openingAmount))}
              </p>
            </div>
          )}

          {/* Bouton de validation */}
          <Button
            type="submit"
            className="w-full h-10 sm:h-12 text-sm sm:text-lg"
            disabled={isSubmitting || openingAmount === ''}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Ouverture...
              </span>
            ) : (
              'Ouvrir la caisse'
            )}
          </Button>

          {/* Note */}
          <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
            Ce montant sera utilisé pour calculer l'écart à la clôture
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
