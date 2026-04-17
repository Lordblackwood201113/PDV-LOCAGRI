import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Receipt, CheckCircle, XCircle, Clock, User, Wallet } from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'

type ExpenseCategory = 'fournitures' | 'transport' | 'maintenance' | 'autre'

const categoryLabels: Record<ExpenseCategory, string> = {
  fournitures: 'Fournitures',
  transport: 'Transport',
  maintenance: 'Maintenance',
  autre: 'Autre',
}

const categoryColors: Record<ExpenseCategory, string> = {
  fournitures: 'bg-blue-100 text-blue-700',
  transport: 'bg-purple-100 text-purple-700',
  maintenance: 'bg-orange-100 text-orange-700',
  autre: 'bg-gray-100 text-gray-700',
}

export function ExpenseManagement() {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedExpenseId, setSelectedExpenseId] = useState<Id<'expenses'> | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const pendingExpenses = useQuery(api.expenses.getPendingExpenses)
  const currentUser = useQuery(api.users.getCurrentUser)
  const approveExpense = useMutation(api.expenses.approveExpense)
  const rejectExpense = useMutation(api.expenses.rejectExpense)

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleApprove = async (expenseId: Id<'expenses'>) => {
    setIsProcessing(true)
    try {
      await approveExpense({ expenseId })
      toast.success('Dépense approuvée', {
        description: 'Le caissier peut maintenant retirer les fonds',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsProcessing(false)
    }
  }

  const openRejectDialog = (expenseId: Id<'expenses'>) => {
    setSelectedExpenseId(expenseId)
    setRejectionReason('')
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!selectedExpenseId) return

    if (!rejectionReason.trim()) {
      toast.error('Motif requis', { description: 'Veuillez indiquer le motif du rejet' })
      return
    }

    setIsProcessing(true)
    try {
      await rejectExpense({
        expenseId: selectedExpenseId,
        rejectionReason: rejectionReason.trim(),
      })
      toast.success('Dépense rejetée')
      setRejectDialogOpen(false)
      setSelectedExpenseId(null)
      setRejectionReason('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsProcessing(false)
    }
  }

  if (pendingExpenses === undefined || currentUser === undefined) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-[#016124] border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500">Chargement...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (currentUser?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-gray-500">
          Accès réservé aux administrateurs
        </CardContent>
      </Card>
    )
  }

  // Calcul du total en attente
  const totalPending = pendingExpenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <>
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
                Demandes de dépenses
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {pendingExpenses.length} demande{pendingExpenses.length > 1 ? 's' : ''} en attente
                {totalPending > 0 && (
                  <span className="ml-1 sm:ml-2 font-medium text-[#CF761C]">
                    ({formatPrice(totalPending)} F)
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {pendingExpenses.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-gray-500">
              <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-gray-300" />
              <p className="text-sm">Aucune demande en attente</p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {pendingExpenses.map((expense) => (
                <div
                  key={expense._id}
                  className="p-3 sm:p-4 bg-gray-50/50 rounded-lg border border-gray-100"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                    {/* Infos principales */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 flex-wrap">
                        <span className="text-lg sm:text-xl font-bold text-gray-900">
                          {formatPrice(expense.amount)} F
                        </span>
                        <Badge className={`${categoryColors[expense.category as ExpenseCategory]} text-[10px] sm:text-xs`}>
                          {categoryLabels[expense.category as ExpenseCategory]}
                        </Badge>
                      </div>

                      <p className="text-gray-700 mb-2 sm:mb-3 text-sm sm:text-base line-clamp-2">{expense.reason}</p>

                      <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-sm text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 sm:w-4 sm:h-4" />
                          {expense.requesterName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                          {formatDate(expense.date)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 sm:flex-col self-end sm:self-start">
                      <Button
                        size="sm"
                        className="flex-1 sm:flex-none bg-[#7ABE4E] hover:bg-[#6aa842] text-xs sm:text-sm h-8"
                        onClick={() => handleApprove(expense._id)}
                        disabled={isProcessing}
                      >
                        <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        Approuver
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 sm:flex-none text-red-600 border-red-200 hover:bg-red-50 text-xs sm:text-sm h-8"
                        onClick={() => openRejectDialog(expense._id)}
                        disabled={isProcessing}
                      >
                        <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        Rejeter
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de rejet */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription>
              Veuillez indiquer le motif du rejet
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Budget insuffisant, dépense non justifiée..."
              rows={3}
              disabled={isProcessing}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={isProcessing}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isProcessing || !rejectionReason.trim()}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Rejet...
                </span>
              ) : (
                'Confirmer le rejet'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Composant compact pour afficher les dépenses retirées du jour (pour rapports)
 */
export function TodayExpensesSummary() {
  const todayExpenses = useQuery(api.expenses.getTodayWithdrawnExpenses)

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  if (!todayExpenses || todayExpenses.total === 0) {
    return null
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#CF761C]/10 rounded-lg border border-[#CF761C]/20">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-[#CF761C] flex-shrink-0" />
        <span className="text-xs sm:text-sm text-gray-600">Dépenses retirées aujourd'hui</span>
      </div>
      <span className="font-semibold text-[#CF761C] text-sm sm:text-base self-end sm:self-auto">
        -{formatPrice(todayExpenses.total)} F
      </span>
    </div>
  )
}
