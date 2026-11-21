// Tiny PDF writer (vector text, lines, shapes and JPEG photos) so the report
// can be saved or printed from the home-screen app, where iOS ignores
// window.print(). Uses the built-in Helvetica / Times fonts.

const W = 612, H = 792; // US Letter, points

// ---- text encoding (WinAnsi) ----
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '‰': 0x89, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
const SUB = { '→': '->', '←': '<-', '↑': '^', '↓': 'v', '≥': '>=', '≤': '<=', '▲': '^', '▼': 'v', '●': '*', '○': 'o', '✕': 'x', '✓': 'v', '−': '-', ' ': ' ' };
function winBytes(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    if (SUB[ch]) { for (const c of SUB[ch]) out.push(c.charCodeAt(0)); continue; }
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) out.push(c);
    else if (c >= 0xA0 && c <= 0xFF) out.push(c);
    else if (WIN[ch]) out.push(WIN[ch]);
    else if (c >= 0x2700 || (c >= 0x2600 && c < 0x2700)) out.push(42); // decorative glyphs → *
    else out.push(63);
  }
  return out;
}
const hex = bytes => '<' + bytes.map(b => b.toString(16).padStart(2, '0')).join('') + '>';
const clean = str => String.fromCharCode(...winBytes(str).map(b => b < 128 ? b : 32)); // for measuring

// ---- measuring via canvas (same metrics as the PDF base fonts) ----
const FONTS = { sans: ['F1', 'Helvetica, Arial, sans-serif', ''], bold: ['F2', 'Helvetica, Arial, sans-serif', 'bold '], serif: ['F3', 'Times, "Times New Roman", serif', ''], serifb: ['F4', 'Times, "Times New Roman", serif', 'bold '] };
const ctx = document.createElement('canvas').getContext('2d');
export function measure(str, size, font = 'sans') {
  const f = FONTS[font]; ctx.font = `${f[2]}100px ${f[1]}`;
  return ctx.measureText(String(str ?? '').replace(/[^\x20-\x7e -ÿ]/g, 'm')).width / 100 * size;
}
export function wrap(str, width, size, font = 'sans') {
  const out = [];
  for (const para of String(str ?? '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? line + ' ' + word : word;
      if (measure(t, size, font) <= width || !line) line = t; else { out.push(line); line = word; }
      while (measure(line, size, font) > width && line.length > 1) { // very long word
        let k = line.length; while (k > 1 && measure(line.slice(0, k), size, font) > width) k--;
        out.push(line.slice(0, k)); line = line.slice(k);
      }
    }
    out.push(line);
  }
  return out;
}

const rgb = c => { const n = parseInt(c.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(v => v.toFixed(3)).join(' '); };
const n = v => (Math.round(v * 100) / 100).toString();

export class PDF {
  constructor() { this.pages = []; this.images = []; this.page(); }
  page() { this.cur = []; this.pages.push(this.cur); return this; }
  get pageCount() { return this.pages.length; }
  op(s) { this.cur.push(s); }
  text(x, y, str, { size = 10, font = 'sans', color = '#3A2F33', align = 'left' } = {}) {
    let tx = x; if (align !== 'left') { const w = measure(str, size, font); tx = align === 'right' ? x - w : x - w / 2; }
    this.op(`BT /${FONTS[font][0]} ${n(size)} Tf ${rgb(color)} rg ${n(tx)} ${n(H - y)} Td ${hex(winBytes(str))} Tj ET`);
  }
  line(x1, y1, x2, y2, { color = '#E4D8D3', width = 0.75, dash } = {}) {
    this.op(`${n(width)} w ${dash ? `[${dash.join(' ')}] 0 d` : '[] 0 d'} ${rgb(color)} RG ${n(x1)} ${n(H - y1)} m ${n(x2)} ${n(H - y2)} l S`);
  }
  rect(x, y, w, h, { fill, stroke, r = 0, width = 0.75 } = {}) {
    const path = r ? roundRect(x, H - y - h, w, h, r) : `${n(x)} ${n(H - y - h)} ${n(w)} ${n(h)} re`;
    this.op(`${fill ? rgb(fill) + ' rg ' : ''}${stroke ? rgb(stroke) + ' RG ' + n(width) + ' w ' : ''}${path} ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  }
  circle(cx, cy, r, { fill, alpha } = {}) {
    const k = 0.5523 * r, y = H - cy;
    this.op(`q ${alpha != null ? `/GS${Math.round(alpha * 10)} gs ` : ''}${rgb(fill)} rg ${n(cx + r)} ${n(y)} m ${n(cx + r)} ${n(y + k)} ${n(cx + k)} ${n(y + r)} ${n(cx)} ${n(y + r)} c ${n(cx - k)} ${n(y + r)} ${n(cx - r)} ${n(y + k)} ${n(cx - r)} ${n(y)} c ${n(cx - r)} ${n(y - k)} ${n(cx - k)} ${n(y - r)} ${n(cx)} ${n(y - r)} c ${n(cx + k)} ${n(y - r)} ${n(cx + r)} ${n(y - k)} ${n(cx + r)} ${n(y)} c f Q`);
  }
  polyline(pts, { color, width = 1.6 } = {}) {
    if (pts.length < 2) return;
    this.op(`${n(width)} w 1 J 1 j [] 0 d ${rgb(color)} RG ${pts.map(([x, y], i) => `${n(x)} ${n(H - y)} ${i ? 'l' : 'm'}`).join(' ')} S`);
  }
  // JPEG bytes → embedded as-is (DCTDecode)
  image(bytes, iw, ih, x, y, w, h) {
    let idx = this.images.findIndex(im => im.bytes === bytes);
    if (idx < 0) { this.images.push({ bytes, iw, ih }); idx = this.images.length - 1; }
    this.op(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(H - y - h)} cm /Im${idx} Do Q`);
  }

  async output() {
    const te = new TextEncoder();
    const chunks = []; const offsets = []; let len = 0;
    const push = b => { const u = typeof b === 'string' ? te.encode(b) : b; chunks.push(u); len += u.length; };
    const objs = []; // index = obj number - 1
    const add = () => objs.push(null);
    const deflate = async str => {
      const bytes = te.encode(str);
      if (typeof CompressionStream === 'undefined') return { bytes, filter: '' };
      const out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
      return { bytes: out, filter: '/Filter /FlateDecode ' };
    };
    // fixed objects: 1 catalog, 2 pages, 3-6 fonts, 7 ext graphics states
    for (let i = 0; i < 7; i++) add();
    const imgStart = objs.length + 1; this.images.forEach(() => add());
    const pageObjs = this.pages.map(() => { add(); add(); return objs.length - 1; }); // page obj = k, content = k+1
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const write = (num, body) => { offsets[num] = len; push(`${num} 0 obj\n`); if (typeof body === 'string') push(body); else body.forEach(push); push('\nendobj\n'); };
    write(1, '<< /Type /Catalog /Pages 2 0 R >>');
    write(2, `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageObjs.map(k => `${k} 0 R`).join(' ')}] >>`);
    ['Helvetica', 'Helvetica-Bold', 'Times-Roman', 'Times-Bold'].forEach((f, i) => write(3 + i, `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
    write(7, `<< ${Array.from({ length: 11 }, (_, i) => `/GS${i} << /Type /ExtGState /ca ${(i / 10).toFixed(1)} /CA ${(i / 10).toFixed(1)} >>`).join(' ')} >>`);
    this.images.forEach((im, i) => write(imgStart + i, [`<< /Type /XObject /Subtype /Image /Width ${im.iw} /Height ${im.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`, im.bytes, '\nendstream']));
    const resources = `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> /ExtGState 7 0 R /XObject << ${this.images.map((_, i) => `/Im${i} ${imgStart + i} 0 R`).join(' ')} >> >>`;
    for (let p = 0; p < this.pages.length; p++) {
      const k = pageObjs[p];
      write(k, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${resources} /Contents ${k + 1} 0 R >>`);
      const c = await deflate(this.pages[p].join('\n'));
      write(k + 1, [`<< /Length ${c.bytes.length} ${c.filter}>>\nstream\n`, c.bytes, '\nendstream']);
    }
    const xref = len;
    push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
    for (let i = 1; i <= objs.length; i++) push(`${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out = new Uint8Array(len); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}
function roundRect(x, y, w, h, r) {
  const k = 0.5523 * r;
  return `${n(x + r)} ${n(y)} m ${n(x + w - r)} ${n(y)} l ${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} c ${n(x + w)} ${n(y + h - r)} l ${n(x + w)} ${n(y + h - r + k)} ${n(x + w - r + k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c ${n(x + r)} ${n(y + h)} l ${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)} c ${n(x)} ${n(y + r)} l ${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c h`;
}
export const PAGE = { W, H };
export { clean };
