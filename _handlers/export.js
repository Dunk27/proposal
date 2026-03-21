// api/export.js — экспорт КП в DOCX и PDF
// POST /api/export {format:'docx'|'pdf', markdown, title}
// DOCX: docx.js (без внешних зависимостей кроме npm)
// PDF:  HTML-to-PDF через Chromium (@sparticuz/chromium + puppeteer-core) — только Pro/Agency
// Env: нет специальных — PDF работает через Vercel serverless с размером до 50MB

import { getUserFromToken, checkUserPlan } from '../lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const user  = await getUserFromToken(token)
  if (!user) return res.status(401).json({ error: 'Необходима авторизация' })

  const { format = 'docx', markdown, title = 'Коммерческое предложение', companyName, accentColor = '#B8922A' } = req.body || {}
  if (!markdown) return res.status(400).json({ error: 'markdown обязателен' })

  const { plan } = await checkUserPlan(user.id)

  // PDF только для Pro/Agency
  if (format === 'pdf' && !['pro', 'agency', 'trial'].includes(plan)) {
    return res.status(403).json({
      error:          'PDF-экспорт доступен только на тарифе Pro',
      upgrade:        true,
      upgradeMessage: 'Перейдите на Pro для экспорта в PDF с фирменным оформлением',
    })
  }

  if (format === 'pdf') {
    return exportPdf(res, { markdown, title, companyName, accentColor })
  }

  return exportDocx(res, { markdown, title })
}

// ── DOCX ──────────────────────────────────────────────────────────────────────
async function exportDocx(res, { markdown, title }) {
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
            BorderStyle, TableCell, TableRow, Table, WidthType, ShadingType } = require('docx')

    const children = []
    const lines    = markdown.split('\n')

    for (const line of lines) {
      if (!line.trim()) {
        children.push(new Paragraph({ text: '' }))
        continue
      }
      if (line.startsWith('# ')) {
        children.push(new Paragraph({
          text:    line.slice(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 120 },
        }))
      } else if (line.startsWith('## ')) {
        children.push(new Paragraph({
          text:    line.slice(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 80 },
          border:  { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8922A' } },
        }))
      } else if (line.startsWith('### ')) {
        children.push(new Paragraph({
          text:    line.slice(4).toUpperCase(),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 60 },
        }))
      } else if (line.startsWith('> ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.slice(2), italics: true, color: '555555' })],
          indent:   { left: 720 },
          border:   { left: { style: BorderStyle.SINGLE, size: 12, color: 'B8922A' } },
          spacing:  { before: 80, after: 80 },
        }))
      } else if (/^\s*[-*•] /.test(line)) {
        children.push(new Paragraph({
          text:    line.replace(/^\s*[-*•] /, ''),
          bullet:  { level: 0 },
          spacing: { before: 40, after: 40 },
        }))
      } else if (/^\s*\d+\. /.test(line)) {
        children.push(new Paragraph({
          text:         line.replace(/^\s*\d+\. /, ''),
          numbering:    { reference: 'my-numbering', level: 0 },
          spacing:      { before: 40, after: 40 },
        }))
      } else {
        // Инлайн форматирование
        const runs = parseBold(line)
        children.push(new Paragraph({
          children: runs,
          spacing:  { before: 40, after: 40 },
        }))
      }
    }

    const doc = new Document({
      numbering: {
        config: [{
          reference: 'my-numbering',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }],
        }],
      },
      sections: [{
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children,
      }],
      styles: {
        default: {
          document: { run: { font: 'Arial', size: 24, color: '1A1612' } },
          heading1: { run: { font: 'Arial', size: 36, bold: true, color: '1A1612' }, paragraph: { spacing: { before: 400, after: 160 } } },
          heading2: { run: { font: 'Arial', size: 28, bold: true, color: '1A1612' } },
          heading3: { run: { font: 'Arial', size: 22, bold: true, color: 'B8922A' } },
        },
      },
    })

    const buffer   = await Packer.toBuffer(doc)
    const filename = encodeURIComponent(title.replace(/[^\wа-яёА-ЯЁ\s-]/gi, '').trim() + '.docx')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    return res.status(200).send(buffer)
  } catch (err) {
    return res.status(500).json({ error: 'DOCX: ' + err.message })
  }
}

function parseBold(text) {
  const runs  = []
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new (require('docx').TextRun)({ text: part.slice(2, -2), bold: true }))
    } else {
      runs.push(new (require('docx').TextRun)(part))
    }
  }
  return runs.length > 0 ? runs : [new (require('docx').TextRun)(text)]
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function exportPdf(res, { markdown, title, companyName, accentColor }) {
  try {
    // Конвертируем markdown → HTML → PDF через headless Chrome
    const html = buildPdfHtml({ markdown, title, companyName, accentColor })

    let pdfBuffer

    // Попытка через puppeteer-core + @sparticuz/chromium (serverless-friendly)
    try {
      const chromium    = require('@sparticuz/chromium')
      const puppeteer   = require('puppeteer-core')
      const browser     = await puppeteer.launch({
        args:            chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath:  await chromium.executablePath(),
        headless:        chromium.headless,
      })
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      pdfBuffer  = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' } })
      await browser.close()
    } catch (puppeteerErr) {
      // Fallback: вернуть HTML для самостоятельного сохранения в PDF
      console.warn('Puppeteer unavailable, returning HTML:', puppeteerErr.message)
      const htmlBuffer = Buffer.from(html, 'utf-8')
      const filename   = encodeURIComponent(title.replace(/[^\wа-яёА-ЯЁ\s-]/gi, '').trim() + '.html')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return res.status(200).send(htmlBuffer)
    }

    const filename = encodeURIComponent(title.replace(/[^\wа-яёА-ЯЁ\s-]/gi, '').trim() + '.pdf')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.status(200).send(pdfBuffer)
  } catch (err) {
    return res.status(500).json({ error: 'PDF: ' + err.message })
  }
}

function buildPdfHtml({ markdown, title, companyName, accentColor }) {
  const ac = accentColor || '#B8922A'

  // Простой markdown → HTML
  let body = markdown
    .split('\n')
    .map(line => {
      if (!line.trim()) return '<p style="margin:0 0 8px"></p>'
      if (line.startsWith('# '))  return `<h1 style="font-size:28px;font-weight:300;color:#1A1612;border-bottom:2px solid #1A1612;padding-bottom:12px;margin:0 0 20px">${esc(line.slice(2))}</h1>`
      if (line.startsWith('## ')) return `<h2 style="font-size:18px;font-weight:600;color:#1A1612;border-bottom:2px solid ${ac};padding-bottom:6px;margin:28px 0 12px;display:flex;gap:8px;align-items:center"><span style="display:inline-block;width:3px;height:18px;background:${ac};border-radius:1px;flex-shrink:0"></span>${esc(line.slice(3))}</h2>`
      if (line.startsWith('### ')) return `<h3 style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${ac};margin:20px 0 8px">${esc(line.slice(4))}</h3>`
      if (line.startsWith('> '))  return `<div style="border-left:3px solid ${ac};padding:12px 16px;margin:12px 0;background:${ac}18;border-radius:0 4px 4px 0"><p style="margin:0;font-style:italic;color:#3D3530">${esc(line.slice(2))}</p></div>`
      if (/^\s*[-*] /.test(line)) return `<li style="margin-bottom:4px;color:#3D3530">${fmtInline(esc(line.replace(/^\s*[-*] /, '')))}</li>`
      return `<p style="margin:0 0 10px;line-height:1.8;color:#3D3530">${fmtInline(esc(line))}</p>`
    })
    .join('\n')
    // Wrap списки в <ul>
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, m => `<ul style="padding-left:20px;margin:8px 0">${m}</ul>`)

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1A1612; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; padding: 0; }
  .header { background: #1A1612; padding: 28px 40px; margin-bottom: 32px; }
  .header-logo { font-size: 22px; font-weight: 300; color: #F5F0E8; }
  .header-logo strong { font-weight: 600; color: ${ac}; }
  .header-co { font-size: 12px; color: rgba(245,240,232,.5); margin-top: 4px; }
  .content { padding: 0 40px 40px; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head><body>
<div class="page">
  <div class="header">
    <div class="header-logo">Propose<strong>AI</strong></div>
    ${companyName ? `<div class="header-co">${esc(companyName)}</div>` : ''}
  </div>
  <div class="content">${body}</div>
</div>
</body></html>`
}

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function fmtInline(s) { return s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>') }
