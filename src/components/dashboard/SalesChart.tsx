import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp } from 'lucide-react'

interface SalesChartProps {
  days?: number
}

export function SalesChart({ days = 7 }: SalesChartProps) {
  const salesEvolution = useQuery(api.sales.getSalesEvolution, { days })

  const formatPrice = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(0)}k`
    }
    return amount.toString()
  }

  // Calculer la tendance
  const calculateTrend = () => {
    if (!salesEvolution || salesEvolution.length < 2) return null

    const midPoint = Math.floor(salesEvolution.length / 2)
    const firstHalf = salesEvolution.slice(0, midPoint)
    const secondHalf = salesEvolution.slice(midPoint)

    const firstHalfTotal = firstHalf.reduce((sum, d) => sum + d.amount, 0)
    const secondHalfTotal = secondHalf.reduce((sum, d) => sum + d.amount, 0)

    if (firstHalfTotal === 0) return secondHalfTotal > 0 ? 100 : 0

    return Math.round(((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100)
  }

  const trend = calculateTrend()
  const totalAmount = salesEvolution?.reduce((sum, d) => sum + d.amount, 0) || 0
  const totalCount = salesEvolution?.reduce((sum, d) => sum + d.count, 0) || 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
              <TrendingUp className="w-4 h-4 text-[#016124]" />
              Évolution des ventes
            </h3>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
              {days} derniers jours
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-base sm:text-lg font-bold text-gray-900">
              {new Intl.NumberFormat('fr-FR').format(totalAmount)} <span className="text-[10px] sm:text-xs font-normal text-gray-400">F</span>
            </p>
            <div className="flex items-center gap-2 sm:justify-end">
              <span className="text-[10px] sm:text-xs text-gray-500">{totalCount} ventes</span>
              {trend !== null && (
                <span className={`text-[10px] sm:text-xs font-medium ${trend >= 0 ? 'text-[#7ABE4E]' : 'text-red-600'}`}>
                  {trend >= 0 ? '+' : ''}{trend}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-1 sm:px-2 py-3 sm:py-4">
        {salesEvolution === undefined ? (
          <div className="h-[150px] sm:h-[200px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#7ABE4E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : salesEvolution.length === 0 ? (
          <div className="h-[150px] sm:h-[200px] flex items-center justify-center text-gray-400 text-xs sm:text-sm">
            Aucune donnée disponible
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 150 : 200}>
            <AreaChart
              data={salesEvolution}
              margin={{ top: 10, right: 5, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7ABE4E" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7ABE4E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: window.innerWidth < 640 ? 9 : 11 }}
                dy={10}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: window.innerWidth < 640 ? 9 : 11 }}
                tickFormatter={formatPrice}
                width={35}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#014d1c',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
                labelStyle={{ color: '#7ABE4E', fontSize: 11, marginBottom: 4 }}
                formatter={(value) => {
                  const numValue = typeof value === 'number' ? value : 0
                  return [`${new Intl.NumberFormat('fr-FR').format(numValue)} F`, 'CA']
                }}
                itemStyle={{ color: '#fff', fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#7ABE4E"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorAmount)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
