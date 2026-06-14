import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Cell } from './exportUtils'

// Couleur de marque LOCAGRI (vert)
const BRAND: [number, number, number] = [1, 97, 36]

// Formatage fr-FR des cellules numériques (séparateur de milliers) pour le PDF.
// L'Excel, lui, conserve les nombres bruts (tri/calcul) — voir exportRowsToExcel.
const NUM_FMT = new Intl.NumberFormat('fr-FR')
const cellToStr = (c: Cell): string => (typeof c === 'number' ? NUM_FMT.format(c) : String(c))

export interface PdfTableOptions {
  title: string
  subtitle?: string
  headers: string[]
  rows: Cell[][]
  totals?: Cell[]
  filename: string
}

/**
 * Construit et télécharge un PDF tabulaire (en-tête LOCAGRI + titre + période + total).
 * Au-delà de 6 colonnes, bascule en paysage pour rester lisible.
 */
export function exportTableToPdf(opts: PdfTableOptions): void {
  const doc = new jsPDF({
    orientation: opts.headers.length > 6 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
  doc.text('LOCAGRI', 40, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(17, 17, 17)
  doc.text(opts.title, 40, 60)

  let startY = 76
  if (opts.subtitle) {
    doc.setFontSize(9)
    doc.setTextColor(110, 110, 110)
    doc.text(opts.subtitle, 40, 74)
    startY = 90
  }

  autoTable(doc, {
    startY,
    head: [opts.headers],
    body: opts.rows.map((r) => r.map(cellToStr)),
    foot: opts.totals ? [opts.totals.map(cellToStr)] : undefined,
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    margin: { left: 40, right: 40 },
  })

  doc.save(opts.filename)
}
