import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { TodayStats } from '@/components/sales'
import { ExportReportsModal } from '@/components/reports'
import { ClientSelector } from '@/components/clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Banknote, Smartphone, Wallet, Receipt, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

type DateRange = 'today' | '7days' | '30days'

export function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [clientFilter, setClientFilter] = useState<{
    id: Id<'clients'> | null
    name: string | null
  }>({ id: null, name: null })

  const currentUser = useQuery(api.users.getCurrentUser)
  const todayExpenses = useQuery(api.expenses.getTodayWithdrawnExpenses)
  const expensesHistory = useQuery(api.expenses.getExpensesHistory, { status: 'withdrawn', limit: 10 })

  // Calculer le startDate en fonction de la plage
  const startOfRange = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (dateRange === '7days') start.setDate(start.getDate() - 6)
    if (dateRange === '30days') start.setDate(start.getDate() - 29)
    return start.getTime()
  }, [dateRange])

  // Historique des ventes avec filtres (startDate + clientId)
  // Le backend filtre déjà au cashier ses propres ventes
  const sales = useQuery(api.sales.getSalesHistory, {
    startDate: startOfRange,
    clientId: clientFilter.id ?? undefined,
  })

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

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
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

  const isCashier = currentUser?.role === 'cashier'
  const canSeeExpenses = !isCashier
  const canExport = !isCashier

  const rangeLabels: Record<DateRange, string> = {
    today: "Aujourd'hui",
    '7days': '7 derniers jours',
    '30days': '30 derniers jours',
  }

  const totalAmount = sales?.reduce((sum, s) => sum + s.total, 0) ?? 0

  return (
    <div className="h-full overflow-auto p-3 sm:p-4">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            {isCashier ? 'Mon historique' : 'Rapports & Statistiques'}
          </h2>
          {canExport && <ExportReportsModal />}
        </div>

        {/* Statistiques du jour — tous les rôles (le backend filtre le caissier à ses ventes) */}
        <TodayStats expanded />

        {/* Résumé des dépenses du jour — admin/manager uniquement */}
        {canSeeExpenses && todayExpenses && todayExpenses.total > 0 && (
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

        {/* Historique des ventes avec filtres */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-sm sm:text-base">
                {isCashier ? 'Mes ventes' : 'Historique des ventes'} · {rangeLabels[dateRange]}
              </CardTitle>
              <span className="text-xs sm:text-sm text-muted-foreground">
                {sales?.length ?? 0} vente{(sales?.length ?? 0) > 1 ? 's' : ''} · {formatPrice(totalAmount)} F
              </span>
            </div>

            {/* Filtres */}
            <div className="flex flex-col sm:flex-row gap-3 mt-3">
              {/* Range selector */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {(Object.keys(rangeLabels) as DateRange[]).map((r) => (
                  <Button
                    key={r}
                    variant="ghost"
                    size="sm"
                    onClick={() => setDateRange(r)}
                    className={cn(
                      'text-xs h-7 px-3',
                      dateRange === r && 'bg-white shadow-sm text-[#016124] hover:bg-white'
                    )}
                  >
                    <Calendar className="w-3 h-3 mr-1.5" />
                    {rangeLabels[r]}
                  </Button>
                ))}
              </div>

              {/* Client filter */}
              <div className="flex-1 min-w-0">
                <ClientSelector
                  selectedClientId={clientFilter.id}
                  selectedClientName={clientFilter.name}
                  onSelect={(id, name) => setClientFilter({ id, name })}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            {sales === undefined ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sales.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {clientFilter.id
                  ? `Aucune vente pour ce client sur ${rangeLabels[dateRange].toLowerCase()}`
                  : `Aucune vente sur ${rangeLabels[dateRange].toLowerCase()}`}
              </p>
            ) : (
              <div className="space-y-3">
                {sales.map((sale) => (
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-primary truncate">
                            {sale.productName} <span className="text-gray-500 font-normal">x{sale.quantity}</span>
                          </p>
                          {sale.reference && (
                            <Badge variant="secondary" className="text-[9px] font-mono">
                              {sale.reference}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 flex-wrap">
                          <span>
                            {dateRange === 'today' ? formatTime(sale.date) : formatDateTime(sale.date)}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="truncate">{sale.userName}</span>
                          {sale.clientName && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="truncate text-[#016124] font-medium">
                                {sale.clientName}
                              </span>
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

        {/* Historique des dépenses récentes — admin/manager uniquement */}
        {canSeeExpenses && expensesHistory && expensesHistory.length > 0 && (
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
