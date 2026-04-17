import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { TodayStats } from '@/components/sales'
import { ExportReportsModal } from '@/components/reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Banknote, Smartphone, Wallet, Receipt } from 'lucide-react'

export function ReportsPage() {
  const todaySales = useQuery(api.sales.getTodaySales, {})
  const currentUser = useQuery(api.users.getCurrentUser)
  const todayExpenses = useQuery(api.expenses.getTodayWithdrawnExpenses)
  const expensesHistory = useQuery(api.expenses.getExpensesHistory, { status: 'withdrawn', limit: 10 })

  // Formatage
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Vérifier l'accès
  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (currentUser?.role === 'cashier') {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">
            Vous n'avez pas accès à cette section.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3 sm:p-4">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Rapports & Statistiques</h2>
          <ExportReportsModal />
        </div>

        {/* Statistiques du jour - version étendue */}
        <TodayStats expanded />

        {/* Résumé des dépenses du jour */}
        {todayExpenses && todayExpenses.total > 0 && (
          <Card className="border-[#CF761C]/30 bg-[#CF761C]/5">
            <CardContent className="p-4 sm:pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#CF761C]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-[#CF761C]" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm sm:text-base">Dépenses retirées aujourd'hui</p>
                    <p className="text-xs sm:text-sm text-gray-500">{todayExpenses.count} dépense{todayExpenses.count > 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className="text-lg sm:text-xl font-bold text-[#CF761C] self-end sm:self-auto">
                  -{formatPrice(todayExpenses.total)} F
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historique des ventes du jour - Card View on Mobile */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm sm:text-base">Détail des ventes du jour</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            {todaySales === undefined ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : todaySales.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Aucune vente aujourd'hui
              </p>
            ) : (
              <div className="space-y-3">
                {todaySales.map((sale) => (
                  <div
                    key={sale._id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        sale.paymentMethod === 'cash' ? 'bg-[#7ABE4E]/10' : 'bg-[#CF761C]/10'
                      }`}>
                        {sale.paymentMethod === 'cash' ? (
                          <Banknote className="w-4 h-4 text-[#016124]" />
                        ) : (
                          <Smartphone className="w-4 h-4 text-[#CF761C]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-primary truncate">
                            {sale.productName} <span className="text-gray-500 font-normal">x{sale.quantity}</span>
                          </p>
                          {sale.reference && (
                            <Badge variant="secondary" className="text-[9px] font-mono">
                              {sale.reference}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500">
                          <span>{formatTime(sale.date)}</span>
                          <span className="text-gray-300">·</span>
                          <span className="truncate">{sale.userName}</span>
                          {sale.clientName && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="truncate text-[#016124]">{sale.clientName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 pl-11 sm:pl-0">
                      <Badge variant="outline" className="text-[10px] sm:hidden">
                        {sale.paymentMethod === 'cash' ? 'Espèces' : 'Mobile'}
                      </Badge>
                      <span className="font-semibold text-sm whitespace-nowrap">
                        {formatPrice(sale.total)} F
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historique des dépenses récentes */}
        {expensesHistory && expensesHistory.length > 0 && (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#CF761C]" />
                Dernières dépenses retirées
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
              <div className="space-y-3">
                {expensesHistory.map((expense) => (
                  <div
                    key={expense._id}
                    className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {expense.requesterName}
                          </span>
                          <Badge variant="outline" className="text-[10px] flex-shrink-0">
                            {expense.category === 'fournitures' && 'Fournitures'}
                            {expense.category === 'transport' && 'Transport'}
                            {expense.category === 'maintenance' && 'Maintenance'}
                            {expense.category === 'autre' && 'Autre'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {expense.reason}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(expense.withdrawnAt || expense.date).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span className="font-semibold text-sm text-[#CF761C] whitespace-nowrap flex-shrink-0">
                        -{formatPrice(expense.amount)} F
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
