import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { format, startOfMonth, endOfDay, startOfDay, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Download,
  FileSpreadsheet,
  CalendarIcon,
  ShoppingCart,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Loader2,
} from 'lucide-react'
import {
  exportSalesToExcel,
  exportStockMovementsToExcel,
  exportTypeLabels,
  type ExportType,
} from '@/lib/exportUtils'

type DateRange = {
  from: Date | undefined
  to: Date | undefined
}

const exportOptions: { type: ExportType; icon: React.ReactNode; description: string }[] = [
  {
    type: 'sales',
    icon: <ShoppingCart className="w-4 h-4" />,
    description: 'Toutes les ventes avec détails',
  },
  {
    type: 'stockIn',
    icon: <ArrowDownToLine className="w-4 h-4" />,
    description: 'Entrées de stock uniquement',
  },
  {
    type: 'stockOut',
    icon: <ArrowUpFromLine className="w-4 h-4" />,
    description: 'Sorties de stock (ventes incluses)',
  },
  {
    type: 'allMovements',
    icon: <ArrowLeftRight className="w-4 h-4" />,
    description: 'Entrées, sorties et ajustements',
  },
]

const presetPeriods = [
  { label: "Aujourd'hui", getValue: () => ({ from: startOfDay(new Date()), to: new Date() }) },
  { label: '7 derniers jours', getValue: () => ({ from: startOfDay(subDays(new Date(), 6)), to: new Date() }) },
  { label: '30 derniers jours', getValue: () => ({ from: startOfDay(subDays(new Date(), 29)), to: new Date() }) },
  { label: 'Ce mois', getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
]

export function ExportReportsModal() {
  const [open, setOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 6)),
    to: new Date(),
  })
  const [selectedExport, setSelectedExport] = useState<ExportType | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Queries for data - only fetch when we have valid dates and selected export
  const startTimestamp = dateRange.from ? startOfDay(dateRange.from).getTime() : undefined
  const endTimestamp = dateRange.to ? endOfDay(dateRange.to).getTime() : undefined

  const salesData = useQuery(
    api.sales.getSalesHistory,
    selectedExport === 'sales' && startTimestamp && endTimestamp
      ? { startDate: startTimestamp, endDate: endTimestamp }
      : 'skip'
  )

  const stockInData = useQuery(
    api.stock.getStockHistory,
    selectedExport === 'stockIn' && startTimestamp && endTimestamp
      ? { startDate: startTimestamp, endDate: endTimestamp, type: 'in' as const }
      : 'skip'
  )

  const stockOutData = useQuery(
    api.stock.getStockHistory,
    selectedExport === 'stockOut' && startTimestamp && endTimestamp
      ? { startDate: startTimestamp, endDate: endTimestamp, type: 'out' as const }
      : 'skip'
  )

  const allMovementsData = useQuery(
    api.stock.getStockHistory,
    selectedExport === 'allMovements' && startTimestamp && endTimestamp
      ? { startDate: startTimestamp, endDate: endTimestamp }
      : 'skip'
  )

  const handleExport = async (type: ExportType) => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Veuillez sélectionner une période')
      return
    }

    setSelectedExport(type)
    setIsExporting(true)
  }

  // Effect to handle export when data is loaded
  const performExport = () => {
    if (!isExporting || !selectedExport || !dateRange.from || !dateRange.to) return

    try {
      if (selectedExport === 'sales') {
        if (salesData === undefined) return // Still loading
        if (salesData.length === 0) {
          toast.warning('Aucune donnée', { description: 'Aucune vente sur cette période' })
          setIsExporting(false)
          setSelectedExport(null)
          return
        }
        exportSalesToExcel(salesData, dateRange.from, dateRange.to)
        toast.success('Export réussi', { description: `${salesData.length} vente(s) exportée(s)` })
      } else if (selectedExport === 'stockIn') {
        if (stockInData === undefined) return
        if (stockInData.length === 0) {
          toast.warning('Aucune donnée', { description: 'Aucune entrée de stock sur cette période' })
          setIsExporting(false)
          setSelectedExport(null)
          return
        }
        exportStockMovementsToExcel(stockInData, 'stockIn', dateRange.from, dateRange.to)
        toast.success('Export réussi', { description: `${stockInData.length} entrée(s) exportée(s)` })
      } else if (selectedExport === 'stockOut') {
        if (stockOutData === undefined) return
        if (stockOutData.length === 0) {
          toast.warning('Aucune donnée', { description: 'Aucune sortie de stock sur cette période' })
          setIsExporting(false)
          setSelectedExport(null)
          return
        }
        exportStockMovementsToExcel(stockOutData, 'stockOut', dateRange.from, dateRange.to)
        toast.success('Export réussi', { description: `${stockOutData.length} sortie(s) exportée(s)` })
      } else if (selectedExport === 'allMovements') {
        if (allMovementsData === undefined) return
        if (allMovementsData.length === 0) {
          toast.warning('Aucune donnée', { description: 'Aucun mouvement sur cette période' })
          setIsExporting(false)
          setSelectedExport(null)
          return
        }
        exportStockMovementsToExcel(allMovementsData, 'allMovements', dateRange.from, dateRange.to)
        toast.success('Export réussi', { description: `${allMovementsData.length} mouvement(s) exporté(s)` })
      }

      setIsExporting(false)
      setSelectedExport(null)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Erreur lors de l\'export')
      setIsExporting(false)
      setSelectedExport(null)
    }
  }

  // Trigger export when data is ready
  if (isExporting && selectedExport) {
    const isDataReady =
      (selectedExport === 'sales' && salesData !== undefined) ||
      (selectedExport === 'stockIn' && stockInData !== undefined) ||
      (selectedExport === 'stockOut' && stockOutData !== undefined) ||
      (selectedExport === 'allMovements' && allMovementsData !== undefined)

    if (isDataReady) {
      performExport()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 text-sm h-9">
          <FileSpreadsheet className="w-4 h-4" />
          <span className="hidden sm:inline">Exporter</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Download className="w-5 h-5 text-[#016124]" />
            Exporter les rapports
          </DialogTitle>
          <DialogDescription className="text-sm">
            Sélectionnez la période et le type de données à exporter en Excel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Period selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Période
            </label>

            {/* Preset periods */}
            <div className="flex flex-wrap gap-2 mb-3">
              {presetPeriods.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setDateRange(preset.getValue())}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Date range picker */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'flex-1 justify-start text-left font-normal text-sm h-10',
                      !dateRange.from && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      format(dateRange.from, 'dd MMM yyyy', { locale: fr })
                    ) : (
                      <span>Date début</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) =>
                      setDateRange((prev) => ({ ...prev, from: date }))
                    }
                    initialFocus
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>

              <span className="text-gray-400 self-center hidden sm:block">→</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'flex-1 justify-start text-left font-normal text-sm h-10',
                      !dateRange.to && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? (
                      format(dateRange.to, 'dd MMM yyyy', { locale: fr })
                    ) : (
                      <span>Date fin</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) =>
                      setDateRange((prev) => ({ ...prev, to: date }))
                    }
                    initialFocus
                    disabled={(date) =>
                      date > new Date() || (dateRange.from ? date < dateRange.from : false)
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Export options */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Type d'export
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {exportOptions.map((option) => {
                const isLoading = isExporting && selectedExport === option.type
                return (
                  <Button
                    key={option.type}
                    variant="outline"
                    className={cn(
                      'h-auto py-3 px-4 justify-start flex-col items-start gap-1 text-left',
                      'hover:border-[#016124] hover:bg-[#016124]/5',
                      isLoading && 'border-[#016124] bg-[#016124]/5'
                    )}
                    onClick={() => handleExport(option.type)}
                    disabled={isExporting || !dateRange.from || !dateRange.to}
                  >
                    <div className="flex items-center gap-2 w-full">
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#016124]" />
                      ) : (
                        <span className="text-[#016124]">{option.icon}</span>
                      )}
                      <span className="font-medium text-sm">
                        {exportTypeLabels[option.type]}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 pl-6">
                      {option.description}
                    </span>
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Info message */}
          <p className="text-xs text-gray-500 text-center pt-2">
            Le fichier Excel sera téléchargé automatiquement
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
