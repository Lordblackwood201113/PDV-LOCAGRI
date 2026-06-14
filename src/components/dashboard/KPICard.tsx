import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: {
    value: number
    label: string
  }
  variant?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
}

const variantStyles = {
  default: {
    iconBg: 'bg-locagri-primary/10',
    iconColor: 'text-locagri-primary',
  },
  success: {
    iconBg: 'bg-locagri-success/20',
    iconColor: 'text-locagri-primary',
  },
  warning: {
    iconBg: 'bg-locagri-accent/15',
    iconColor: 'text-locagri-accent',
  },
  danger: {
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
  },
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}: KPICardProps) {
  const styles = variantStyles[variant]

  return (
    <div className={cn(
      'bg-white rounded-xl p-3 sm:p-5 border border-gray-100 hover:shadow-sm transition-shadow',
      className
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 sm:space-y-2 min-w-0 flex-1">
          <p className="text-[10px] sm:text-sm font-medium text-gray-500 truncate">{title}</p>
          <p className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{value}</p>
          {subtitle && (
            <p className="text-[10px] sm:text-xs text-gray-400 truncate">{subtitle}</p>
          )}
        </div>
        <div className={cn(
          'w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0',
          styles.iconBg
        )}>
          <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', styles.iconColor)} />
        </div>
      </div>

      {trend && (
        <div className="mt-2 sm:mt-3 flex items-center gap-1">
          <span className={cn(
            'text-[10px] sm:text-xs font-medium',
            trend.value >= 0 ? 'text-locagri-success' : 'text-red-600'
          )}>
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </span>
          <span className="text-[10px] sm:text-xs text-gray-400">{trend.label}</span>
        </div>
      )}
    </div>
  )
}
