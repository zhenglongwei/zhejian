/**
 * 车主案例稿 → 可粘贴成文的图文导出（与小程序 utils/merchant-case-draft-article.js 同步）
 */

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function absoluteUrl(url, publicBaseUrl = '') {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const base = String(publicBaseUrl || '').replace(/\/$/, '')
  if (!base) return value
  if (value.startsWith('/')) return `${base}${value}`
  return `${base}/${value}`
}

function collectSectionBodies(draft = {}) {
  return (draft.sections || [])
    .map((sec) => ({
      key: String((sec && sec.key) || ''),
      title: String((sec && sec.title) || '').trim(),
      body: String((sec && sec.body) || '').trim(),
    }))
    .filter((sec) => sec.body || sec.title)
}

function mediaBySection(draft = {}, publicBaseUrl = '') {
  const map = {}
  ;(draft.media || []).forEach((item) => {
    const url = absoluteUrl((item && (item.maskedUrl || item.displayUrl)) || '', publicBaseUrl)
    if (!url) return
    const key = String((item && item.sectionKey) || 'process')
    if (!map[key]) map[key] = []
    map[key].push({
      url,
      caption: String((item && item.caption) || '').trim(),
    })
  })
  return map
}

function buildDraftArticleExport(draft = {}, options = {}) {
  const publicBaseUrl = options.publicBaseUrl || ''
  const title = String(draft.title || '维修案例').trim() || '维修案例'
  const summary = String(draft.caseSummary || '').trim()
  const sections = collectSectionBodies(draft)
  const mediaMap = mediaBySection(draft, publicBaseUrl)

  const style = {
    wrap: 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2329;line-height:1.75;font-size:15px;',
    h1: 'font-size:22px;font-weight:600;margin:0 0 16px;line-height:1.4;',
    h2: 'font-size:17px;font-weight:600;margin:24px 0 10px;line-height:1.4;',
    p: 'margin:0 0 12px;white-space:pre-wrap;',
    lead: 'margin:0 0 20px;padding:12px 14px;background:#f5f6f7;border-radius:8px;color:#646a73;',
    img: 'display:block;width:100%;max-width:100%;margin:10px 0 6px;border-radius:8px;',
    caption: 'font-size:13px;color:#8f959e;margin:0 0 12px;text-align:center;',
    tip: 'font-size:12px;color:#8f959e;margin:28px 0 0;',
  }

  const htmlParts = [
    `<article style="${style.wrap}">`,
    `<h1 style="${style.h1}">${escapeHtml(title)}</h1>`,
  ]
  if (summary) {
    htmlParts.push(
      `<p style="${style.lead}"><strong>案例摘要</strong><br/>${escapeHtml(summary)}</p>`,
    )
  }

  const mdParts = [`# ${title}`, '']
  if (summary) {
    mdParts.push('> **案例摘要**', `>`, `> ${summary.replace(/\n/g, '\n> ')}`, '')
  }

  const plainParts = [title]
  if (summary) plainParts.push('', summary)

  sections.forEach((sec) => {
    const heading = sec.title || '正文'
    htmlParts.push(`<h2 style="${style.h2}">${escapeHtml(heading)}</h2>`)
    if (sec.body) {
      htmlParts.push(`<p style="${style.p}">${escapeHtml(sec.body)}</p>`)
    }
    mdParts.push(`## ${heading}`, '')
    if (sec.body) {
      mdParts.push(sec.body, '')
    }
    plainParts.push('', `【${heading}】`)
    if (sec.body) plainParts.push(sec.body)

    const images = mediaMap[sec.key] || []
    images.forEach((img) => {
      htmlParts.push(
        `<img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.caption || heading)}" style="${style.img}" />`,
      )
      if (img.caption) {
        htmlParts.push(`<p style="${style.caption}">${escapeHtml(img.caption)}</p>`)
      }
      mdParts.push(`![${img.caption || heading}](${img.url})`, '')
      if (img.caption) mdParts.push(`*${img.caption}*`, '')
      plainParts.push(`[图片] ${img.url}`)
    })
  })

  const usedKeys = new Set(sections.map((s) => s.key))
  Object.keys(mediaMap).forEach((key) => {
    if (usedKeys.has(key)) return
    const images = mediaMap[key] || []
    if (!images.length) return
    htmlParts.push(`<h2 style="${style.h2}">过程配图</h2>`)
    mdParts.push('## 过程配图', '')
    plainParts.push('', '【过程配图】')
    images.forEach((img) => {
      htmlParts.push(`<img src="${escapeHtml(img.url)}" alt="" style="${style.img}" />`)
      mdParts.push(`![](${img.url})`, '')
      plainParts.push(`[图片] ${img.url}`)
    })
  })

  htmlParts.push(
    `<p style="${style.tip}">公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。实际方案与费用请与门店线下确认。</p>`,
  )
  htmlParts.push('</article>')
  mdParts.push('---', '', '公开展示仅使用脱敏图片。实际方案与费用请与门店线下确认。')

  return {
    title,
    html: htmlParts.join('\n'),
    markdown: mdParts.join('\n'),
    plain: plainParts.filter((line) => line != null).join('\n'),
  }
}

function buildDraftArticleClipboardPage(exportData = {}) {
  const title = escapeHtml(exportData.title || '维修案例')
  const articleHtml = String(exportData.html || '')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <title>${title}</title>
  <style>
    body{margin:0;background:#f5f6f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
    .bar{position:sticky;top:0;z-index:10;padding:12px 16px;background:#fff;border-bottom:1px solid #e5e6eb;display:flex;gap:10px;}
    .bar button{flex:1;height:44px;border:0;border-radius:8px;font-size:15px;font-weight:600;}
    .primary{background:#1677ff;color:#fff;}
    .ghost{background:#e8f3ff;color:#1677ff;}
    .hint{padding:10px 16px;font-size:12px;color:#8f959e;line-height:1.5;}
    .paper{margin:12px 16px 32px;padding:20px 16px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.04);}
    .toast{display:none;position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:20;}
  </style>
</head>
<body>
  <div class="bar">
    <button class="ghost" type="button" id="btnMd">复制 Markdown</button>
    <button class="primary" type="button" id="btnRich">复制图文文章</button>
  </div>
  <p class="hint">点「复制图文文章」后，到公众号 / 知乎 / 头条等编辑器直接粘贴，一般可保留段落与图片。若目标编辑器不支持，可改用 Markdown。</p>
  <div class="paper" id="article">${articleHtml}</div>
  <div class="toast" id="toast"></div>
  <script>
    var PLAIN = ${JSON.stringify(exportData.plain || '')};
    var MARKDOWN = ${JSON.stringify(exportData.markdown || '')};
    var toastEl = document.getElementById('toast');
    function showToast(msg) {
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      setTimeout(function () { toastEl.style.display = 'none'; }, 2200);
    }
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast('已复制'); }
      catch (e) { showToast('复制失败，请长按正文手动复制'); }
      document.body.removeChild(ta);
    }
    async function copyRich() {
      var article = document.getElementById('article');
      var html = article ? article.innerHTML : '';
      var plain = PLAIN || (article ? article.innerText : '');
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([plain], { type: 'text/plain' })
            })
          ]);
          showToast('已复制图文，可去编辑器粘贴');
          return;
        }
      } catch (e) {}
      fallbackCopy(html);
      showToast('已复制 HTML，请粘贴到支持图文的编辑器');
    }
    function copyMarkdown() {
      fallbackCopy(MARKDOWN || PLAIN);
      showToast('已复制 Markdown');
    }
    document.getElementById('btnRich').addEventListener('click', copyRich);
    document.getElementById('btnMd').addEventListener('click', copyMarkdown);
  </script>
</body>
</html>`
}

module.exports = {
  escapeHtml,
  absoluteUrl,
  buildDraftArticleExport,
  buildDraftArticleClipboardPage,
}
