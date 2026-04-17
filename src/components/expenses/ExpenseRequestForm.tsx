import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Receipt, Send, Wallet, AlertCircle } from 'lucide-react'

type ExpenseCategory = 'fournitures' | 'transport' | 'maintenance' | 'autre'

const categoryLabels: Record<ExpenseCategory, string> = {
  fournitures: 'Fournitures',
  transport: 'Transport',
  maintenance: 'Maintenance',
  autre: 'Autre',
}

interface ExpenseRequestFormProps {
  onSuccess?: () => void
}

export function ExpenseRequestForm({ onSuccess }: ExpenseRequestFormProps) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('fournitures')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createExpenseRequest = useMutation(api.expenses.createExpenseRequest)
  const availableCash = useQuery(api.expenses.getAvailableCashForExpenses)

  const formatPrice = (value: string | number) => {
    const num = typeof value === 'string' ? parseInt(value.replace(/\D/g, '')) : value
    if (isNaN(num)) return ''
    return new Intl.NumberFormat('fr-FR').format(num)
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '')
    setAmount(raw)
  }

  const amountNum = parseInt(amount) || 0
  const available = availableCash?.available ?? 0
  const exceedsAvailable = amountNum > available && amount !== ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Montant invalide', { description: 'Le montant doit être supérieur à 0' })
      return
    }

    if (amountNum > available) {
      toast.error('Montant insuffisant', {
        description: `Le montant demandé dépasse le disponible en caisse (${formatPrice(available)} FCFA)`
      })
      return
    }

    if (!reason.trim()) {
      toast.error('Motif requis', { description: 'Veuillez indiquer le motif de la dépense' })
      return
    }

    setIsSubmitting(true)
    try {
      await createExpenseRequest({
        amount: amountNum,
        reason: reason.trim(),
        category,
      })

      toast.success('Demande envoyée', {
        description: `Demande de ${formatPrice(amount)} FCFA envoyée pour validation`,
      })

      // Reset form
      setAmount('')
      setReason('')
      setCategory('fournitures')

      onSuccess?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Si pas de session ouverte
  if (availableCash && !availableCash.hasOpenSession) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#016124]" />
            Demande de dépense
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-gray-500">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p>Vous devez ouvrir votre caisse pour faire une demande de dépense</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
          Demande de dépense
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Soumettez une demande qui sera validée par un administrateur
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {/* Montant disponible */}
        <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-gray-600 flex items-center gap-1.5 sm:gap-2">
              <Wallet className="w-3 h-3 sm:w-4 sm:h-4" />
              Disponible en caisse
            </span>
            <span className="font-semibold text-[#016124] text-sm sm:text-base">
              {formatPrice(available)} F
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {/* Montant */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="expense-amount" className="text-sm">Montant (FCFA) *</Label>
            <Input
              id="expense-amount"
              type="text"
              inputMode="numeric"
              value={amount ? formatPrice(amount) : ''}
              onChange={handleAmountChange}
              placeholder="Ex: 5 000"
              disabled={isSubmitting}
              className={`text-base sm:text-lg ${exceedsAvailable ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {exceedsAvailable && (
              <p className="text-xs sm:text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Le montant dépasse le disponible en caisse
              </p>
            )}
          </div>

          {/* Catégorie */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="expense-category" className="text-sm">Catégorie *</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ExpenseCategory)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="expense-category">
                <SelectValue placeholder="Sélectionnez une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Motif */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="expense-reason" className="text-sm">Motif de la dépense *</Label>
            <Textarea
              id="expense-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Achat de fournitures de bureau (stylos, cahiers)"
              disabled={isSubmitting}
              rows={3}
              className="text-sm"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-[#016124] hover:bg-[#017a2e] text-sm sm:text-base h-9 sm:h-10"
            disabled={isSubmitting || !amount || !reason.trim() || exceedsAvailable || available <= 0}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Envoi en cours...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" />
                Envoyer la demande
              </span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
