import type { ConvexReactClient } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  exportRowsToExcel,
  formatExportDate,
  formatExportPrice,
  type Cell,
} from './exportUtils'
import { exportTableToPdf } from './pdfUtils'

// Plafonds des exports de listes clients — DOIVENT rester identiques au backend
// (convex/assistant.ts : CLIENT_EXPORT_LIMIT / TOP_CLIENTS_EXPORT_LIMIT) pour que
// le comptage serveur et le fichier fabriqué portent le même ensemble de lignes.
const CLIENT_EXPORT_LIMIT = 200
const TOP_CLIENTS_EXPORT_LIMIT = 100

// Doit rester aligné avec le backend (convex/assistant.ts : ReportKey).
export type ReportKey =
  | 'sales'
  | 'stock_movements'
  | 'receivables'
  | 'expenses'
  | 'audit_logs'
  | 'cash_sessions'
  | 'safe_transactions'
  | 'new_clients'
  | 'inactive_clients'
  | 'top_clients'

export interface PreparedExport {
  report: ReportKey
  format: 'pdf' | 'xlsx'
  title: string
  rowCount: number
  params: Record<string, unknown>
}

interface BuiltReport {
  sheetName: string
  headers: string[]
  rows: Cell[][]
  totals?: Cell[]
}

// ---- helpers ----
const str = (v: unknown): string | undefined =>
  v === undefined || v === null || v === '' ? undefined : String(v)
const dayStartMs = (s: string): number => new Date(s + 'T00:00:00').getTime()
const dayEndMs = (s: string): number => new Date(s + 'T23:59:59.999').getTime()
// "AAAA-MM-JJ" → "JJ/MM/AAAA" (cohérent avec le format des autres rapports)
const formatDay = (s: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}
const money = (v: number | undefined | null): string =>
  v === undefined || v === null ? '-' : formatExportPrice(v)

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  credit: 'Crédit',
}
const EXPENSE_STATUS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Rejetée',
  withdrawn: 'Retirée',
}
const MOVEMENT_TYPE: Record<string, string> = {
  in: 'Entrée',
  out: 'Sortie',
  adjustment: 'Ajustement',
}
const SAFE_TX_TYPE: Record<string, string> = {
  initial: 'Solde initial',
  withdrawal: 'Retrait (fond)',
  deposit: 'Dépôt caissier',
  adjustment: 'Ajustement',
  bank_deposit: 'Versement bancaire',
}

// ---- builders (fetch + mapping) par rapport ----
async function buildReport(
  convex: ConvexReactClient,
  exp: PreparedExport
): Promise<BuiltReport> {
  const p = exp.params
  const startDate = str(p.startDate)
  const endDate = str(p.endDate)

  switch (exp.report) {
    case 'sales': {
      const sales = await convex.query(api.sales.getSalesHistory, {
        startDate: startDate ? dayStartMs(startDate) : undefined,
        endDate: endDate ? dayEndMs(endDate) : undefined,
      })
      const rows: Cell[][] = sales.map((s) => [
        s.reference ?? '-',
        formatExportDate(s.date),
        s.productName ?? '-',
        s.quantity,
        s.unitPrice,
        s.total,
        PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod,
        s.clientName ?? '-',
        s.userName,
      ])
      const totalAmount = sales.reduce((sum, s) => sum + s.total, 0)
      const totalQty = sales.reduce((sum, s) => sum + s.quantity, 0)
      return {
        sheetName: 'Ventes',
        headers: ['Référence', 'Date', 'Produit', 'Quantité', 'Prix unit. (FCFA)', 'Total (FCFA)', 'Paiement', 'Client', 'Vendeur'],
        rows,
        totals: ['TOTAL', '', '', totalQty, '', totalAmount, '', '', ''],
      }
    }

    case 'stock_movements': {
      const movements = await convex.query(api.stock.getStockHistory, {
        startDate: startDate ? dayStartMs(startDate) : undefined,
        endDate: endDate ? dayEndMs(endDate) : undefined,
        type: p.type as 'in' | 'out' | 'adjustment' | undefined,
      })
      const rows: Cell[][] = movements.map((m) => [
        m.reference ?? '-',
        formatExportDate(m.date),
        m.productName ?? '-',
        MOVEMENT_TYPE[m.type] ?? m.type,
        m.quantity,
        m.reason,
        m.previousStock,
        m.newStock,
        m.userName,
      ])
      return {
        sheetName: 'Mouvements',
        headers: ['Référence', 'Date', 'Produit', 'Type', 'Quantité', 'Motif', 'Stock avant', 'Stock après', 'Utilisateur'],
        rows,
      }
    }

    case 'receivables': {
      const data = await convex.query(api.clients.getReceivables, {})
      const rows: Cell[][] = data.clients.map((c) => [
        c.displayName,
        c.reference,
        c.phone ?? '-',
        c.quartier ?? '-',
        c.type === 'grossiste' ? 'Grossiste' : 'Particulier',
        c.balance,
      ])
      return {
        sheetName: 'Créances',
        headers: ['Client', 'Référence', 'Téléphone', 'Quartier', 'Type', 'Encours (FCFA)'],
        rows,
        totals: ['TOTAL', '', '', '', '', data.totalOutstanding],
      }
    }

    case 'expenses': {
      const expenses = await convex.query(api.expenses.getExpensesHistory, {
        startDate,
        endDate,
        status: p.status as 'pending' | 'approved' | 'rejected' | 'withdrawn' | undefined,
      })
      const rows: Cell[][] = expenses.map((e) => [
        formatExportDate(e.date),
        e.amount,
        e.reason,
        e.category,
        EXPENSE_STATUS[e.status] ?? e.status,
        e.requesterName,
        e.approvedByName ?? '-',
      ])
      const total = expenses.reduce((sum, e) => sum + e.amount, 0)
      return {
        sheetName: 'Dépenses',
        headers: ['Date', 'Montant (FCFA)', 'Motif', 'Catégorie', 'Statut', 'Demandeur', 'Approbateur'],
        rows,
        totals: ['TOTAL', total, '', '', '', '', ''],
      }
    }

    case 'audit_logs': {
      const logs = await convex.query(api.audit.getAuditLogs, {
        startDate: startDate ? dayStartMs(startDate) : undefined,
        endDate: endDate ? dayEndMs(endDate) : undefined,
        category: p.category as
          | 'user'
          | 'safe'
          | 'expense'
          | 'session'
          | 'stock'
          | 'product'
          | 'client'
          | undefined,
      })
      const rows: Cell[][] = logs.map((l) => [
        l.reference,
        formatExportDate(l.date),
        l.actorName,
        l.actorRole,
        l.action,
        l.category,
        l.targetName ?? l.targetRef ?? '-',
        l.summary,
      ])
      return {
        sheetName: 'Journal',
        headers: ['Référence', 'Date', 'Acteur', 'Rôle', 'Action', 'Catégorie', 'Cible', 'Résumé'],
        rows,
      }
    }

    case 'cash_sessions': {
      const sessions = await convex.query(api.cashSessions.getSessionHistory, {
        startDate,
        endDate,
        userId: str(p.userId),
      })
      const rows: Cell[][] = sessions.map((s) => [
        formatDay(s.date),
        s.userName,
        money(s.openingAmount),
        money(s.closingAmount),
        money(s.expectedAmount),
        s.discrepancy === undefined ? '-' : money(s.discrepancy),
        s.status === 'open' ? 'Ouverte' : 'Clôturée',
      ])
      return {
        sheetName: 'Sessions',
        headers: ['Date', 'Caissier', 'Ouverture (FCFA)', 'Clôture (FCFA)', 'Attendu (FCFA)', 'Écart (FCFA)', 'Statut'],
        rows,
      }
    }

    case 'safe_transactions': {
      const txs = await convex.query(api.safe.getTransactionHistory, {
        startDate: startDate ? dayStartMs(startDate) : undefined,
        endDate: endDate ? dayEndMs(endDate) : undefined,
        type: p.type as
          | 'initial'
          | 'withdrawal'
          | 'deposit'
          | 'adjustment'
          | 'bank_deposit'
          | undefined,
      })
      const rows: Cell[][] = txs.map((t) => [
        formatExportDate(t.date),
        SAFE_TX_TYPE[t.type] ?? t.type,
        t.amount,
        t.previousBalance,
        t.newBalance,
        t.performedByName,
        t.reason,
      ])
      return {
        sheetName: 'Coffre',
        headers: ['Date', 'Type', 'Montant (FCFA)', 'Solde avant', 'Solde après', 'Par', 'Motif'],
        rows,
      }
    }

    case 'new_clients': {
      const clients = await convex.query(api.analytics.getRecentClients, {
        startDate,
        endDate,
        days: typeof p.days === 'number' ? p.days : undefined,
        type: p.type as 'particulier' | 'grossiste' | undefined,
        includeInactive: p.includeInactive === true,
        limit: CLIENT_EXPORT_LIMIT,
      })
      const rows: Cell[][] = clients.map((c) => [
        c.displayName,
        c.reference,
        c.phone ?? '-',
        c.quartier ?? '-',
        c.type === 'grossiste' ? 'Grossiste' : 'Particulier',
        formatExportDate(c.createdAt),
        c.lastPurchaseAt ? formatExportDate(c.lastPurchaseAt) : '-',
        c.purchaseCount,
        c.totalPurchased,
      ])
      const totalAchats = clients.reduce((sum, c) => sum + c.totalPurchased, 0)
      return {
        sheetName: 'Nouveaux clients',
        headers: ['Client', 'Référence', 'Téléphone', 'Quartier', 'Type', 'Créé le', 'Dernier achat', 'Nb achats', 'Total acheté (FCFA)'],
        rows,
        totals: ['TOTAL', '', '', '', '', '', '', '', totalAchats],
      }
    }

    case 'inactive_clients': {
      const clients = await convex.query(api.analytics.getInactiveClients, {
        days: typeof p.days === 'number' ? p.days : undefined,
        type: p.type as 'particulier' | 'grossiste' | undefined,
        limit: CLIENT_EXPORT_LIMIT,
      })
      const rows: Cell[][] = clients.map((c) => [
        c.displayName,
        c.reference,
        c.phone ?? '-',
        c.quartier ?? '-',
        c.type === 'grossiste' ? 'Grossiste' : 'Particulier',
        c.lastPurchaseAt ? formatExportDate(c.lastPurchaseAt) : 'Jamais',
        c.daysSinceLastPurchase === null ? '-' : c.daysSinceLastPurchase,
        c.balance,
      ])
      const totalEncours = clients.reduce((sum, c) => sum + c.balance, 0)
      return {
        sheetName: 'Clients inactifs',
        headers: ['Client', 'Référence', 'Téléphone', 'Quartier', 'Type', 'Dernier achat', 'Jours inactif', 'Encours (FCFA)'],
        rows,
        totals: ['TOTAL', '', '', '', '', '', '', totalEncours],
      }
    }

    case 'top_clients': {
      const clients = await convex.query(api.analytics.getTopClients, {
        startDate,
        endDate,
        limit: TOP_CLIENTS_EXPORT_LIMIT,
      })
      const rows: Cell[][] = clients.map((c) => [
        c.displayName,
        c.reference,
        c.phone ?? '-',
        c.type === 'grossiste' ? 'Grossiste' : 'Particulier',
        c.purchaseCount,
        c.totalAmount,
        c.lastPurchaseAt ? formatExportDate(c.lastPurchaseAt) : '-',
      ])
      const total = clients.reduce((sum, c) => sum + c.totalAmount, 0)
      return {
        sheetName: 'Meilleurs clients',
        headers: ['Client', 'Référence', 'Téléphone', 'Type', 'Nb achats', 'Total acheté (FCFA)', 'Dernier achat'],
        rows,
        totals: ['TOTAL', '', '', '', '', total, ''],
      }
    }
  }
}

// Nom de fichier sûr à partir du titre.
function safeFilename(title: string, ext: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${base || 'export'}.${ext}`
}

/**
 * Récupère les données complètes et fabrique le fichier (PDF ou Excel) côté client.
 * Retourne le nombre de lignes effectivement exportées (0 = aucune donnée).
 */
export async function runAssistantExport(
  convex: ConvexReactClient,
  exp: PreparedExport
): Promise<number> {
  const built = await buildReport(convex, exp)
  if (built.rows.length === 0) return 0

  if (exp.format === 'xlsx') {
    exportRowsToExcel({
      sheetName: built.sheetName,
      headers: built.headers,
      rows: built.rows,
      totals: built.totals,
      filename: safeFilename(exp.title, 'xlsx'),
    })
  } else {
    exportTableToPdf({
      title: exp.title,
      subtitle: `${built.rows.length} ligne(s) — généré le ${formatExportDate(Date.now())}`,
      headers: built.headers,
      rows: built.rows,
      totals: built.totals,
      filename: safeFilename(exp.title, 'pdf'),
    })
  }
  return built.rows.length
}
