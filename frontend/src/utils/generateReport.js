/**
 * GestureExplorer Elite — Auto-Generated Data Report PDF
 * Captures 3D visualization + AI analysis + deep stats into a professional PDF.
 */
import { jsPDF } from 'jspdf'
import { applyPlugin } from 'jspdf-autotable'
applyPlugin(jsPDF)

// ── Color palette (matches the app theme) ──────────────────────────────────
const COLORS = {
  primary:    [102, 126, 234],  // #667EEA indigo
  secondary:  [118, 75, 162],   // #764BA2 purple
  accent:     [249, 115, 22],   // #F97316 orange
  dark:       [15, 23, 42],     // #0F172A navy
  card:       [30, 41, 59],     // #1E293B slate
  text:       [226, 232, 240],  // #E2E8F0
  textDim:    [148, 163, 184],  // #94A3B8
  success:    [34, 197, 94],    // #22C55E
  danger:     [239, 68, 68],    // #EF4444
  white:      [255, 255, 255],
}

/**
 * Capture the Three.js canvas as a PNG data URL.
 * Must be called right before generating the PDF.
 */
function captureCanvas() {
  const canvasEl = document.querySelector('canvas')
  if (!canvasEl) return null
  try {
    return canvasEl.toDataURL('image/png', 0.92)
  } catch {
    return null
  }
}

/**
 * Add page header with gradient-like bar.
 */
function addHeader(doc, title, pageNum) {
  const w = doc.internal.pageSize.getWidth()
  // Dark header bar
  doc.setFillColor(...COLORS.dark)
  doc.rect(0, 0, w, 28, 'F')
  // Accent stripe
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 28, w, 1.5, 'F')

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...COLORS.white)
  doc.text(title, 14, 18)

  // Page number
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.textDim)
  doc.text(`Page ${pageNum}`, w - 20, 18)
}

/**
 * Add a section heading.
 */
function addSection(doc, y, title) {
  const w = doc.internal.pageSize.getWidth()
  // Section background
  doc.setFillColor(241, 245, 249) // #F1F5F9
  doc.roundedRect(14, y - 5, w - 28, 10, 2, 2, 'F')
  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.dark)
  doc.text(title, 18, y + 2)
  return y + 14
}

/**
 * Add wrapped paragraph text.
 */
function addParagraph(doc, y, text, maxWidth) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(51, 65, 85) // #334155
  const lines = doc.splitTextToSize(text, maxWidth || 170)
  doc.text(lines, 18, y)
  return y + lines.length * 4.5 + 4
}

/**
 * Add page footer with dark bar and title.
 */
function addFooter(doc) {
  const w = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  // Dark footer bar
  doc.setFillColor(...COLORS.dark)
  doc.rect(0, pageH - 12, w, 12, 'F')
  // Footer text
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.textDim)
  doc.text('3D Data Explorer', w / 2, pageH - 5, { align: 'center' })
}

/**
 * Check if we need a new page and add it with header.
 */
function checkPage(doc, y, needed, pageNum, title) {
  const pageH = doc.internal.pageSize.getHeight()
  if (y + needed > pageH - 20) {
    addFooter(doc)
    doc.addPage()
    pageNum++
    addHeader(doc, title, pageNum)
    return { y: 38, pageNum }
  }
  return { y, pageNum }
}

/**
 * Strip markdown/emoji so jsPDF's built-in Helvetica doesn't garble it.
 * Removes: **bold** markers, emoji, bullet symbols, non-ASCII chars.
 */
function cleanForPdf(text) {
  if (!text) return ''
  return text
    // Remove **bold** markers (keep inner text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    // Remove emoji and symbols (U+1F000–U+1FFFF and common symbol ranges)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}]/gu, '')
    // Remove other non-latin / special unicode
    .replace(/[^\x00-\x7E\u00C0-\u024F]/g, '')
    // Collapse multiple spaces
    .replace(/  +/g, ' ')
    .trim()
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export default function generateReport({
  dataStats,
  deepAnalysis,
  aiInsight,
  chartData,
  columns,
  uniqueLabels,
  defaultAxes,
  savedFilename,
  dataPreview,
  rowCount,
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const w = doc.internal.pageSize.getWidth()  // 210mm
  const reportTitle = '3D Data Explore — Data Report'
  let pageNum = 1
  let y = 0

  // ─── PAGE 1: Cover + Overview ──────────────────────────────────────────

  // Cover bar
  doc.setFillColor(...COLORS.dark)
  doc.rect(0, 0, w, 55, 'F')
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 55, w, 2, 'F')

  // Cover title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...COLORS.white)
  doc.text('3D Data Explore', 14, 25)

  doc.setFontSize(12)
  doc.setTextColor(...COLORS.textDim)
  doc.text('AI-Powered 3D Data Analysis Report', 14, 34)

  // Date + filename
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.textDim)
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
  doc.text(`Generated: ${dateStr}`, 14, 45)
  doc.text(`Dataset: ${savedFilename || 'Uploaded CSV'}`, 14, 50)

  y = 66

  // ── 3D Visualization Screenshot ───────────────────────────────────────
  const canvasImage = captureCanvas()
  if (canvasImage) {
    y = addSection(doc, y, '3D Visualization Snapshot')
    try {
      // Calculate image dimensions to fit width with aspect ratio
      const imgW = w - 32
      const imgH = imgW * 0.55 // ~16:9 aspect
      doc.addImage(canvasImage, 'PNG', 16, y, imgW, imgH)
      y += imgH + 8
    } catch {
      y = addParagraph(doc, y, 'Could not capture 3D visualization.', 170)
    }
  }

  // ── Dataset Overview ──────────────────────────────────────────────────
  ;({ y, pageNum } = checkPage(doc, y, 40, pageNum, reportTitle))
  y = addSection(doc, y, 'Dataset Overview')

  const overviewData = [
    ['Total Rows', String(rowCount || chartData?.length || 0)],
    ['Numeric Columns', (columns?.numeric || []).join(', ') || 'N/A'],
    ['Categorical Columns', (columns?.categorical || []).join(', ') || 'None'],
    ['Categories', (uniqueLabels || []).slice(0, 10).join(', ') || 'None'],
    ['Visualized Axes', `X: ${defaultAxes?.x || '—'}  |  Y: ${defaultAxes?.y || '—'}  |  Z: ${defaultAxes?.z || '—'}`],
  ]

  doc.autoTable({
    startY: y,
    head: [],
    body: overviewData,
    theme: 'plain',
    margin: { left: 18, right: 18 },
    styles: { fontSize: 9, cellPadding: 3, textColor: [51, 65, 85] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45, textColor: [...COLORS.primary] },
      1: { cellWidth: 'auto' },
    },
  })
  y = doc.lastAutoTable.finalY + 8

  // ── AI Analysis ───────────────────────────────────────────────────────
  if (aiInsight?.text) {
    ;({ y, pageNum } = checkPage(doc, y, 30, pageNum, reportTitle))
    y = addSection(doc, y, 'AI Data Analysis')

    // Source badge
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.secondary)
    const sourceLabel = aiInsight.source === 'gemini' ? 'Powered by Gemini AI' : 'Deep Analysis Engine'
    doc.text(sourceLabel, 18, y)
    y += 6

    // Split into paragraphs, clean each one (strip **markers**, emoji, unicode)
    const paragraphs = aiInsight.text
      .split('\n\n')
      .map(p => cleanForPdf(p.replace(/\n/g, ' ').trim()))
      .filter(p => p.length > 0)

    for (const para of paragraphs) {
      ;({ y, pageNum } = checkPage(doc, y, 16, pageNum, reportTitle))
      y = addParagraph(doc, y, para, 174)
    }
  }

  // ── Column Statistics Table ───────────────────────────────────────────
  if (dataStats && Object.keys(dataStats).length > 0) {
    ;({ y, pageNum } = checkPage(doc, y, 40, pageNum, reportTitle))
    y = addSection(doc, y, 'Column Statistics')

    const statsHead = [['Column', 'Min', 'Max', 'Mean', 'Std Dev']]
    const statsBody = Object.entries(dataStats).map(([col, s]) => [
      col, String(s.min), String(s.max), String(s.mean), String(s.std)
    ])

    doc.autoTable({
      startY: y,
      head: statsHead,
      body: statsBody,
      theme: 'striped',
      margin: { left: 18, right: 18 },
      headStyles: {
        fillColor: [...COLORS.primary],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ═══════════ PAGE 2+ : Deep Analysis ═══════════════════════════════════

  const deep = deepAnalysis || {}

  // ── Correlations ──────────────────────────────────────────────────────
  const correlations = deep.correlations || []
  if (correlations.length > 0) {
    ;({ y, pageNum } = checkPage(doc, y, 35, pageNum, reportTitle))
    y = addSection(doc, y, 'Correlations Between Columns')

    const corrHead = [['Column A', 'Column B', 'Correlation (r)', 'Strength']]
    const corrBody = correlations.map(c => [c.col_a, c.col_b, String(c.r), c.direction])

    doc.autoTable({
      startY: y,
      head: corrHead,
      body: corrBody,
      theme: 'striped',
      margin: { left: 18, right: 18 },
      headStyles: { fillColor: [...COLORS.secondary], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [245, 243, 255] },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Top / Bottom Values ───────────────────────────────────────────────
  const topBottom = deep.top_bottom || {}
  if (Object.keys(topBottom).length > 0) {
    ;({ y, pageNum } = checkPage(doc, y, 35, pageNum, reportTitle))
    y = addSection(doc, y, 'Top & Bottom Values')

    const tbHead = [['Column', 'Highest', 'Lowest', 'Median']]
    const tbBody = Object.entries(topBottom).map(([col, info]) => {
      const hiRow = info.highest?.row || {}
      const loRow = info.lowest?.row || {}
      // Try to find a category label for context
      const catCols = columns?.categorical || []
      const hiLabel = catCols.length > 0 && hiRow[catCols[0]] ? ` (${hiRow[catCols[0]]})` : ''
      const loLabel = catCols.length > 0 && loRow[catCols[0]] ? ` (${loRow[catCols[0]]})` : ''
      return [
        col,
        `${info.highest?.value}${hiLabel}`,
        `${info.lowest?.value}${loLabel}`,
        String(info.median ?? '—'),
      ]
    })

    doc.autoTable({
      startY: y,
      head: tbHead,
      body: tbBody,
      theme: 'striped',
      margin: { left: 18, right: 18 },
      headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [255, 247, 237] },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Outliers ──────────────────────────────────────────────────────────
  const outliers = deep.outliers || {}
  if (Object.keys(outliers).length > 0) {
    ;({ y, pageNum } = checkPage(doc, y, 30, pageNum, reportTitle))
    y = addSection(doc, y, 'Outliers Detected')

    const outHead = [['Column', 'Count', '% of Data', 'Example Values']]
    const outBody = Object.entries(outliers).map(([col, info]) => [
      col,
      String(info.count),
      `${info.percent}%`,
      (info.example_values || []).slice(0, 4).join(', '),
    ])

    doc.autoTable({
      startY: y,
      head: outHead,
      body: outBody,
      theme: 'striped',
      margin: { left: 18, right: 18 },
      headStyles: { fillColor: [...COLORS.danger], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Category Breakdown ────────────────────────────────────────────────
  const catBreakdown = deep.category_breakdown || {}
  if (Object.keys(catBreakdown).length > 0) {
    ;({ y, pageNum } = checkPage(doc, y, 35, pageNum, reportTitle))
    y = addSection(doc, y, 'Category Breakdown')

    for (const [col, info] of Object.entries(catBreakdown).slice(0, 3)) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.primary)
      doc.text(`Column: ${col}  (${info.unique_count} unique values)`, 18, y)
      y += 5

      const catHead = [['Value', 'Count', 'Percentage']]
      const catBody = (info.top_values || []).map(v => [
        v.value, String(v.count), `${v.percent}%`
      ])

      doc.autoTable({
        startY: y,
        head: catHead,
        body: catBody,
        theme: 'striped',
        margin: { left: 18, right: 18 },
        headStyles: { fillColor: [...COLORS.success], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        tableWidth: 100,
      })
      y = doc.lastAutoTable.finalY + 6
    }
  }

  // ── Group Averages ────────────────────────────────────────────────────
  const groupAvgs = deep.group_averages || {}
  if (Object.keys(groupAvgs).length > 0) {
    ;({ y, pageNum } = checkPage(doc, y, 40, pageNum, reportTitle))
    y = addSection(doc, y, 'Group Averages by Category')

    for (const [catCol, groups] of Object.entries(groupAvgs).slice(0, 1)) {
      if (!groups || Object.keys(groups).length === 0) continue
      const numericKeys = Object.keys(Object.values(groups)[0] || {})
      const gaHead = [['Group', ...numericKeys]]
      const gaBody = Object.entries(groups).map(([grp, avgs]) => [
        grp, ...numericKeys.map(k => String(avgs[k] ?? '—'))
      ])

      doc.autoTable({
        startY: y,
        head: gaHead,
        body: gaBody,
        theme: 'striped',
        margin: { left: 18, right: 18 },
        headStyles: { fillColor: [...COLORS.secondary], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2.2 },
        alternateRowStyles: { fillColor: [245, 243, 255] },
      })
      y = doc.lastAutoTable.finalY + 8
    }
  }

  // ── Distribution Shape ────────────────────────────────────────────────
  const distribution = deep.distribution || {}
  if (Object.keys(distribution).length > 0) {
    ;({ y, pageNum } = checkPage(doc, y, 30, pageNum, reportTitle))
    y = addSection(doc, y, 'Distribution Shape')

    const distHead = [['Column', 'Shape', 'Skewness']]
    const distBody = Object.entries(distribution).map(([col, info]) => [
      col, info.shape, String(info.skewness)
    ])

    doc.autoTable({
      startY: y,
      head: distHead,
      body: distBody,
      theme: 'striped',
      margin: { left: 18, right: 18 },
      headStyles: { fillColor: [6, 182, 212], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [236, 254, 255] },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Sample Data ───────────────────────────────────────────────────────
  const sampleRows = deep.sample_rows || dataPreview || []
  if (sampleRows.length > 0) {
    ;({ y, pageNum } = checkPage(doc, y, 40, pageNum, reportTitle))
    y = addSection(doc, y, `Sample Data (${sampleRows.length} rows)`)

    const sampleCols = Object.keys(sampleRows[0] || {})
    const sampleHead = [sampleCols]
    const sampleBody = sampleRows.slice(0, 10).map(row =>
      sampleCols.map(c => {
        const v = row[c]
        return v === null || v === undefined ? '' : String(v).substring(0, 20)
      })
    )

    doc.autoTable({
      startY: y,
      head: sampleHead,
      body: sampleBody,
      theme: 'grid',
      margin: { left: 14, right: 14 },
      headStyles: { fillColor: [...COLORS.card], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'ellipsize' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Footer on last page ───────────────────────────────────────────────
  addFooter(doc)

  // ── Save ──────────────────────────────────────────────────────────────
  const dateTag = new Date().toISOString().slice(0, 10)
  const cleanName = savedFilename ? savedFilename.replace('.csv', '') : 'analysis'
  const filename = `DataReport_${cleanName}_${dateTag}.pdf`

  try {
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Manual blob download failed, falling back to doc.save:', err)
    doc.save(filename)
  }

  return filename
}
