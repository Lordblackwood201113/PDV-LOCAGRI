import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { KPICard, RecentSales, SalesChart } from '@/components/dashboard'
import { ShoppingCart, Banknote, Package, Wallet, TrendingUp } from 'lucide-react'
import { useCashSession, CashSessionProvider } from '@/components/cash'

export function DashboardPage() {
  const currentUser = useQuery(api.users.getCurrentUser)

  // Les admins et managers peuvent accéder au dashboard sans session de caisse
  const isPrivilegedUser = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  return (
    <CashSessionProvider requireSession={!isPrivilegedUser}>
      <DashboardContent />
    </CashSessionProvider>
  )
}

function DashboardContent() {
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
    <div className="h-full overflow-auto p-3 sm:p-6">
      <div className="space-y-4 sm:space-y-6">
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

        {/* Graphique d'évolution des ventes */}
        <SalesChart days={7} />

        {/* Stats par mode de paiement + Ventes récentes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Stats paiements + Produits */}
          <div className="lg:col-span-1 space-y-3 sm:space-y-4">
            {/* Paiements espèces */}
            <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-gray-500">Paiements espèces</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1 truncate">
                    {formatPrice(todayStats?.cashAmount || 0)} F
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
                    {todayStats?.cashCount || 0} vente{(todayStats?.cashCount || 0) > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#7ABE4E]/10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2">
                  <Banknote className="w-5 h-5 sm:w-6 sm:h-6 text-[#016124]" />
                </div>
              </div>
              {todayStats && todayStats.totalAmount > 0 && (
                <div className="mt-3">
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

            {/* Paiements Mobile Money */}
            <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-gray-500">Mobile Money</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1 truncate">
                    {formatPrice(todayStats?.mobileAmount || 0)} F
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
                    {todayStats?.mobileCount || 0} vente{(todayStats?.mobileCount || 0) > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#CF761C]/10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2">
                  <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-[#CF761C]" />
                </div>
              </div>
              {todayStats && todayStats.totalAmount > 0 && (
                <div className="mt-3">
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

            {/* Produits en stock */}
            <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <p className="text-xs sm:text-sm font-medium text-gray-700">Produits</p>
                <Package className="w-4 h-4 text-[#016124]" />
              </div>
              <div className="space-y-2 sm:space-y-3">
                {products?.slice(0, 4).map((product) => (
                  <div key={product._id} className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-gray-600 truncate flex-1">{product.name}</span>
                    <span className={`text-xs sm:text-sm font-medium whitespace-nowrap ${
                      product.stockQuantity <= product.alertThreshold
                        ? 'text-[#CF761C]'
                        : 'text-gray-900'
                    }`}>
                      {product.stockQuantity} {product.unit}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Sales - 2 columns */}
          <div className="lg:col-span-2">
            <RecentSales />
          </div>
        </div>
      </div>
    </div>
  )
}
