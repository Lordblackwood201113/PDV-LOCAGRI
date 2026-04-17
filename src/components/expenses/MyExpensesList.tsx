import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Clock, CheckCircle, XCircle, Wallet, Trash2, ArrowDownCircle } from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'

type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'
type ExpenseCategory = 'fournitures' | 'transport' | 'maintenance' | 'autre'

const statusConfig: Record<ExpenseStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'En attente', color: 'bg-[#CF761C] text-white', icon: Clock },
  approved: { label: 'Approuvée', color: 'bg-[#7ABE4E] text-white', icon: CheckCircle },
  rejected: { label: 'Rejetée', color: 'bg-red-500 text-white', icon: XCircle },
  withdrawn: { label: 'Retirée', color: 'bg-gray-500 text-white', icon: Wallet },
}

const categoryLabels: Record<ExpenseCategory, string> = {
  fournitures: 'Fournitures',
  transport: 'Transport',
  maintenance: 'Maintenance',
  autre: 'Autre',
}

export function MyExpensesList() {
  const myExpenses = useQuery(api.expenses.getMyExpenses, { limit: 20 })
  const approvedExpenses = useQuery(api.expenses.getApprovedExpenses)
  const cancelRequest = useMutation(api.expenses.cancelExpenseRequest)
  const withdrawExpense = useMutation(api.expenses.withdrawExpense)

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

  const handleCancel = async (expenseId: Id<'expenses'>) => {
    if (!confirm('Voulez-vous vraiment annuler cette demande ?')) return

    try {
      await cancelRequest({ expenseId })
      toast.success('Demande annulée')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    }
  }

  const handleWithdraw = async (expenseId: Id<'expenses'>, amount: number) => {
    if (!confirm(`Confirmer le retrait de ${formatPrice(amount)} FCFA de la caisse ?`)) return

    try {
      await withdrawExpense({ expenseId })
      toast.success('Retrait effectué', {
        description: `${formatPrice(amount)} FCFA retirés de la caisse`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    }
  }

  if (myExpenses === undefined) {
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

  // Combiner les dépenses approuvées (à retirer) avec mes dépenses
  const myApprovedToWithdraw = approvedExpenses?.filter(
    (e) => myExpenses.some((m) => m._id === e._id) && e.status === 'approved'
  ) || []

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
          Mes demandes de dépenses
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {myExpenses.length} demande{myExpenses.length > 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {/* Dépenses approuvées à retirer */}
        {myApprovedToWithdraw.length > 0 && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-[#7ABE4E]/10 rounded-lg border border-[#7ABE4E]/30">
            <h4 className="font-medium text-[#016124] mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
              <ArrowDownCircle className="w-4 h-4" />
              Dépenses à retirer
            </h4>
            <div className="space-y-2">
              {myApprovedToWithdraw.map((expense) => (
                <div
                  key={expense._id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg border border-gray-100"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm sm:text-base">
                      {formatPrice(expense.amount)} FCFA
                    </p>
                    <p className="text-[10px] sm:text-xs text-gray-500 truncate">{expense.reason}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleWithdraw(expense._id, expense.amount)}
                    className="bg-[#016124] hover:bg-[#017a2e] text-xs sm:text-sm h-8 self-end sm:self-auto"
                  >
                    <Wallet className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    Retirer
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liste complète */}
        {myExpenses.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-gray-500">
            <Wallet className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-gray-300" />
            <p className="text-sm">Aucune demande de dépense</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {myExpenses.map((expense) => {
              const config = statusConfig[expense.status as ExpenseStatus]
              const Icon = config.icon

              return (
                <div
                  key={expense._id}
                  className="p-3 sm:p-4 bg-gray-50/50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm sm:text-base">
                          {formatPrice(expense.amount)} F
                        </span>
                        <Badge className={`${config.color} text-[10px] sm:text-xs`}>
                          <Icon className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-600 mb-1 line-clamp-2">{expense.reason}</p>
                      <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-400">
                        <span>{categoryLabels[expense.category as ExpenseCategory]}</span>
                        <span>•</span>
                        <span>{formatDate(expense.date)}</span>
                      </div>

                      {/* Motif de rejet */}
                      {expense.status === 'rejected' && expense.rejectionReason && (
                        <div className="mt-1.5 sm:mt-2 p-1.5 sm:p-2 bg-red-50 rounded text-[10px] sm:text-xs text-red-600">
                          <span className="font-medium">Motif:</span> {expense.rejectionReason}
                        </div>
                      )}

                      {/* Info approbation */}
                      {(expense.status === 'approved' || expense.status === 'withdrawn') &&
                        expense.approvedByName && (
                          <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-400">
                            Approuvé par {expense.approvedByName}
                          </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0">
                      {expense.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                          onClick={() => handleCancel(expense._id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
