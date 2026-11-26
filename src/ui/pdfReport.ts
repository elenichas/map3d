import { downloadFile } from '../data/download';

type ReportMeta = { location: string; status: string; summary: string; methods: string[]; filename: string };

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
/** `rgb(…)` or `#rrggbb` to an [r, g, b] triple jsPDF understands. */
function rgb(color: string): [number, number, number] {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const parts = color.match(/[\d.]+/g)?.map(Number) || [255, 255, 255];
  return [parts[0], parts[1], parts[2]];
}

/**
 * A4 PDF of the dashboard as it looks on screen: every card is captured as an image and laid out
 * two-up where the dashboard shows two columns, followed by the methodology as selectable text.
 * The PDF libraries are loaded only when a report is requested.
 */
export async function downloadPdfReport(root: HTMLElement, meta: ReportMeta) {
  const [{ jsPDF }, { toPng, getFontEmbedCSS }] = await Promise.all([import('jspdf'), import('html-to-image')]);
  // Capture a copy laid out at a fixed, print-friendly width, off screen, so the page never flickers.
  const host = document.createElement('div');
  host.className = 'site-export-host';
  const clone = root.cloneNode(true) as HTMLElement;
  clone.classList.add('site-exporting');
  clone.removeAttribute('tabindex');
  clone.querySelectorAll('details:not(.site-method)').forEach(element => { (element as HTMLDetailsElement).open = true; });
  host.append(clone);
  document.body.append(host);
  try {
    await nextFrame();
    // SVG presentation attributes that use CSS variables are resolved here, since the image capture cannot see them.
    clone.querySelectorAll('svg *').forEach(element => {
      for (const attribute of ['fill', 'stroke', 'stop-color'] as const) {
        const value = element.getAttribute(attribute);
        if (value?.includes('var(')) element.setAttribute(attribute, getComputedStyle(element).getPropertyValue(attribute));
      }
    });
    const style = getComputedStyle(clone), background = rgb(style.backgroundColor), text = rgb(style.color);
    const muted = rgb(style.getPropertyValue('--muted').trim() || '#7c7d85');
    const blocks = [clone.querySelector<HTMLElement>('.site-stats'), ...clone.querySelectorAll<HTMLElement>('.site-grid > .site-card'), clone.querySelector<HTMLElement>('.site-quality')].filter((el): el is HTMLElement => !!el);
    const stats = clone.querySelector<HTMLElement>('.site-stats') || clone, origin = stats.getBoundingClientRect();
    let fontEmbedCSS: string | undefined;
    try { fontEmbedCSS = await getFontEmbedCSS(clone); } catch { fontEmbedCSS = undefined; }
    // Cards that share a row on screen share a row in the PDF.
    const rows: { element: HTMLElement; data: string; left: number; width: number; height: number }[][] = [];
    for (const element of blocks) {
      const box = element.getBoundingClientRect();
      const image = { element, data: await toPng(element, { pixelRatio: 2.5, fontEmbedCSS, backgroundColor: style.backgroundColor }), left: box.left - origin.left, width: box.width, height: box.height };
      const row = rows[rows.length - 1];
      if (row && Math.abs(row[0].element.getBoundingClientRect().top - box.top) < 2) row.push(image); else rows.push([image]);
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const pageW = 210, pageH = 297, margin = 12, contentW = pageW - margin * 2, footer = 10, gap = 4;
    const paint = () => { pdf.setFillColor(...background); pdf.rect(0, 0, pageW, pageH, 'F'); };
    paint();
    // Header
    pdf.setTextColor(...muted); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    pdf.text(meta.location.toUpperCase(), margin, margin + 3);
    pdf.setTextColor(...text); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20);
    pdf.text('Site report', margin, margin + 12);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...muted);
    pdf.text(`${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} · ${meta.status}`, margin, margin + 18);
    pdf.text(pdf.splitTextToSize(meta.summary, contentW), margin, margin + 23);
    let y = margin + 30;
    const scale = contentW / origin.width, bottom = pageH - margin - footer;
    for (const row of rows) {
      const rowHeight = Math.max(...row.map(image => image.height)) * scale;
      let fit = Math.min(1, (bottom - margin) / rowHeight);
      // A row that nearly fits shrinks a little rather than leaving most of a page empty.
      if (y + rowHeight * fit > bottom) {
        if ((bottom - y) / rowHeight >= .8) fit = (bottom - y) / rowHeight;
        else { pdf.addPage(); paint(); y = margin; }
      }
      for (const image of row) pdf.addImage(image.data, 'PNG', margin + image.left * scale * fit, y, image.width * scale * fit, image.height * scale * fit, undefined, 'FAST');
      y += rowHeight * fit + gap;
    }

    // Methodology as selectable text.
    pdf.addPage(); paint();
    pdf.setTextColor(...text); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text('Methodology', margin, margin + 6);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    let line = margin + 14;
    for (const method of meta.methods) {
      const lines = pdf.splitTextToSize(`• ${method}`, contentW);
      pdf.text(lines, margin, line); line += lines.length * 4.4 + 2.5;
    }
    pdf.setTextColor(...muted); pdf.setFontSize(8.5);
    pdf.text(pdf.splitTextToSize('Source: © OpenStreetMap contributors, available under the Open Database Licence (ODbL). Data may be missing, incomplete or incorrect. Verify findings independently and use at your own risk.', contentW), margin, line + 4);

    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page); pdf.setFontSize(7.5); pdf.setTextColor(...muted);
      pdf.text('map3d site report · © OpenStreetMap contributors · indicative metrics from mapped data', margin, pageH - 7);
      pdf.text(`${page} / ${pages}`, pageW - margin, pageH - 7, { align: 'right' });
    }
    downloadFile(meta.filename, pdf.output('blob'), 'application/pdf');
  } finally {
    host.remove();
  }
}
