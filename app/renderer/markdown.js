/* Tiny safe Markdown renderer (escapes HTML first). */
'use strict'
window.renderMarkdown = (src) => {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => `<span class="lnk" data-href="${href.replace(/"/g, '&quot;')}">${text}</span>`)
  const lines = src.replace(/\r/g, '').split('\n')
  let out = '', i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (/^```/.test(l)) {
      const buf = []; i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++; out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; continue
    }
    if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const row = s => s.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()))
      let h = `<table><thead><tr>${row(l).map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`
      i += 2
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) h += `<tr>${row(lines[i++]).map(c => `<td>${c}</td>`).join('')}</tr>`
      out += h + '</tbody></table>'; continue
    }
    let m
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) { out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++; continue }
    if (/^\s*[-*+]\s+/.test(l)) {
      out += '<ul>'; while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*[-*+]\s+/, ''))}</li>`; out += '</ul>'; continue
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      out += '<ol>'; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))}</li>`; out += '</ol>'; continue
    }
    if (/^>\s?/.test(l)) { const b = []; while (i < lines.length && /^>\s?/.test(lines[i])) b.push(inline(lines[i++].replace(/^>\s?/, ''))); out += `<blockquote>${b.join('<br>')}</blockquote>`; continue }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out += '<hr>'; i++; continue }
    if (!l.trim()) { i++; continue }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>|\|)/.test(lines[i])) p.push(inline(lines[i++]))
    if (!p.length) p.push(inline(lines[i++]))
    out += `<p>${p.join('<br>')}</p>`
  }
  return out
}
