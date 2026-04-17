import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { KPICard } from './KPICard'
import { QuickSalePanel } from './QuickSalePanel'
import { RecentSales } from './RecentSales'
import { TodayExpensesSummary } from '@/components/admin'
import { ShoppingCart, Banknote, Package, Wallet } from 'lucide-react'
import { useCashSession } from '@/components/cash'

export function SalesDashboard() {
  const todayStats = useQuery(api.sales.getTodayStats, {})
  const products = useQuery(api.products.getProducts)
  const expectedData = useQuery(api.cashSessions.calculateExpectedAmount, {})
  const { sessionData } = useCashSession()

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  // Calcul du stock total
  const totalStock = products?.reduce((sum, p) => sum + p.stockQuantity, 0) || 0
  const lowStockCount = products?.filter(p => p.stockQuantity <= p.alertThreshold).length || 0

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <KPICard
          title="Ventes du jour"
          value={todayStats?.salesCount || 0}
          subtitle="transactions"
          icon={ShoppingCart}
          variant="default"
        />
        <KPICard
          title="Chiffre d'affaires"
          value={`${formatPrice(todayStats?.totalAmount || 0)}`}
          subtitle="FCFA"
          icon={Banknote}
          variant="success"
        />
        <KPICard
          title="Stock total"
          value={totalStock}
          subtitle={lowStockCount > 0 ? `${lowStockCount} en alerte` : 'Tous OK'}
          icon={Package}
          variant={lowStockCount > 0 ? 'warning' : 'default'}
        />
        <KPICard
          title="Caisse espèces"
          value={`${formatPrice(expectedData?.expectedAmount || sessionData?.openingAmount || 0)}`}
          subtitle="FCFA attendus"
          icon={Wallet}
          variant="default"
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Quick Sale Panel - 1 column */}
        <div className="lg:col-span-1">
          <QuickSalePanel />
        </div>

        {/* Recent Sales - 2 columns */}
        <div className="lg:col-span-2">
          <RecentSales />
        </div>
      </div>

      {/* Résumé des dépenses du jour */}
      <TodayExpensesSummary />

      {/* Stats par mode de paiement */}
      {todayStats && todayStats.totalAmount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl p-3 sm:p-5 border border-gray-100">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-500">Paiements espèces</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1 truncate">
                  {formatPrice(todayStats.cashAmount)} <span className="text-xs sm:text-sm font-normal">F</span>
                </p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
                  {todayStats.cashCount} vente{todayStats.cashCount > 1 ? 's' : ''}
                </p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#7ABE4E]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Banknote className="w-5 h-5 sm:w-6 sm:h-6 text-[#016124]" />
              </div>
            </div>
            {todayStats.totalAmount > 0 && (
              <div className="mt-2 sm:mt-3">
                <div className="h-1.5 sm:h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#7ABE4E] rounded-full transition-all"
                    style={{ width: `${(todayStats.cashAmount / todayStats.totalAmount) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
                  {Math.round((todayStats.cashAmount / todayStats.totalAmount) * 100)}% du total
                </p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-3 sm:p-5 border border-gray-100">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-500">Paiements Mobile</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1 truncate">
                  {formatPrice(todayStats.mobileAmount)} <span className="text-xs sm:text-sm font-normal">F</span>
                </p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
                  {todayStats.mobileCount} vente{todayStats.mobileCount > 1 ? 's' : ''}
                </p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#CF761C]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Banknote className="w-5 h-5 sm:w-6 sm:h-6 text-[#CF761C]" />
              </div>
            </div>
            {todayStats.totalAmount > 0 && (
              <div className="mt-2 sm:mt-3">
                <div className="h-1.5 sm:h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#CF761C] rounded-full transition-all"
                    style={{ width: `${(todayStats.mobileAmount / todayStats.totalAmount) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
                  {Math.round((todayStats.mobileAmount / todayStats.totalAmount) * 100)}% du total
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
