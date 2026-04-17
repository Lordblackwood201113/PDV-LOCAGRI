import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// Types for export data
export interface SaleExportData {
  reference?: string
  date: number
  productName: string
  productReference?: string
  quantity: number
  unitPrice: number
  total: number
  paymentMethod: 'cash' | 'mobile_money'
  userName: string
  clientName?: string
  clientReference?: string
}

export interface StockMovementExportData {
  reference?: string
  date: number
  productName: string
  productReference?: string
  type: 'in' | 'out' | 'adjustment'
  quantity: number
  reason: string
  userName: string
  previousStock: number
  newStock: number
  saleReference?: string
}

// Export type labels
export const exportTypeLabels = {
  sales: 'Ventes',
  stockIn: 'Entrées de stock',
  stockOut: 'Sorties de stock',
  allMovements: 'Tous les mouvements'
} as const

export type ExportType = keyof typeof exportTypeLabels

// Format date for display
export function formatExportDate(timestamp: number): string {
  return format(new Date(timestamp), 'dd/MM/yyyy HH:mm', { locale: fr })
}

// Format date for filename
export function formatFilenameDate(date: Date): string {
  return format(date, 'yyyy-MM-dd', { locale: fr })
}

// Format price for export
export function formatExportPrice(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount)
}

// Export sales to Excel
export function exportSalesToExcel(
  sales: SaleExportData[],
  startDate: Date,
  endDate: Date
): void {
  const data = sales.map((sale) => ({
    'Référence': sale.reference || '-',
    'Date': formatExportDate(sale.date),
    'Réf. Produit': sale.productReference || '-',
    'Produit': sale.productName,
    'Quantité': sale.quantity,
    'Prix unitaire (FCFA)': sale.unitPrice,
    'Total (FCFA)': sale.total,
    'Mode de paiement': sale.paymentMethod === 'cash' ? 'Espèces' : 'Mobile Money',
    'Client': sale.clientName || '-',
    'Réf. Client': sale.clientReference || '-',
    'Vendeur': sale.userName,
  }))

  // Add totals row
  const totalAmount = sales.reduce((sum, s) => sum + s.total, 0)
  const totalQuantity = sales.reduce((sum, s) => sum + s.quantity, 0)

  data.push({
    'Référence': '',
    'Date': '',
    'Réf. Produit': '',
    'Produit': 'TOTAL',
    'Quantité': totalQuantity,
    'Prix unitaire (FCFA)': 0,
    'Total (FCFA)': totalAmount,
    'Mode de paiement': '',
    'Client': '',
    'Réf. Client': '',
    'Vendeur': '',
  })

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventes')

  // Auto-size columns
  const colWidths = [
    { wch: 20 }, // Référence
    { wch: 18 }, // Date
    { wch: 12 }, // Réf. Produit
    { wch: 20 }, // Produit
    { wch: 10 }, // Quantité
    { wch: 18 }, // Prix unitaire
    { wch: 15 }, // Total
    { wch: 15 }, // Mode paiement
    { wch: 20 }, // Client
    { wch: 12 }, // Réf. Client
    { wch: 20 }, // Vendeur
  ]
  worksheet['!cols'] = colWidths

  const filename = `Ventes_${formatFilenameDate(startDate)}_au_${formatFilenameDate(endDate)}.xlsx`
  XLSX.writeFile(workbook, filename)
}

// Export stock movements to Excel
export function exportStockMovementsToExcel(
  movements: StockMovementExportData[],
  exportType: 'stockIn' | 'stockOut' | 'allMovements',
  startDate: Date,
  endDate: Date
): void {
  const typeLabels = {
    in: 'Entrée',
    out: 'Sortie',
    adjustment: 'Ajustement',
  }

  const data = movements.map((m) => ({
    'Référence': m.reference || '-',
    'Date': formatExportDate(m.date),
    'Réf. Produit': m.productReference || '-',
    'Produit': m.productName,
    'Type': typeLabels[m.type],
    'Quantité': m.quantity,
    'Motif': m.reason,
    'Réf. Vente': m.saleReference || '-',
    'Stock avant': m.previousStock,
    'Stock après': m.newStock,
    'Utilisateur': m.userName,
  }))

  // Add summary row
  const totalIn = movements.filter(m => m.type === 'in').reduce((sum, m) => sum + m.quantity, 0)
  const totalOut = movements.filter(m => m.type === 'out').reduce((sum, m) => sum + m.quantity, 0)

  data.push({
    'Référence': '',
    'Date': '',
    'Réf. Produit': '',
    'Produit': 'RÉSUMÉ',
    'Type': '',
    'Quantité': 0,
    'Motif': `Entrées: ${totalIn} | Sorties: ${totalOut} | Net: ${totalIn - totalOut}`,
    'Réf. Vente': '',
    'Stock avant': 0,
    'Stock après': 0,
    'Utilisateur': '',
  })

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()

  const sheetName = exportType === 'stockIn'
    ? 'Entrées'
    : exportType === 'stockOut'
      ? 'Sorties'
      : 'Mouvements'

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  // Auto-size columns
  const colWidths = [
    { wch: 22 }, // Référence
    { wch: 18 }, // Date
    { wch: 12 }, // Réf. Produit
    { wch: 20 }, // Produit
    { wch: 12 }, // Type
    { wch: 10 }, // Quantité
    { wch: 30 }, // Motif
    { wch: 22 }, // Réf. Vente
    { wch: 12 }, // Stock avant
    { wch: 12 }, // Stock après
    { wch: 20 }, // Utilisateur
  ]
  worksheet['!cols'] = colWidths

  const typeLabel = exportTypeLabels[exportType].replace(/\s/g, '_')
  const filename = `${typeLabel}_${formatFilenameDate(startDate)}_au_${formatFilenameDate(endDate)}.xlsx`
  XLSX.writeFile(workbook, filename)
}
