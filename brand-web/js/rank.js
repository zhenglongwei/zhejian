(function () {
  const API = (function () {
    const params = new URLSearchParams(location.search)
    if (params.get('api')) return params.get('api')
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:3000/api/v1/public'
    }
    return 'https://geo.simplewin.cn/api/v1/public'
  })()

  const box = document.getElementById('rank-box')
  const statsEl = document.getElementById('stats')
  const contrastEl = document.getElementById('contrast')
  const updatedEl = document.getElementById('f-updated')
  const filters = {
    city: document.getElementById('f-city'),
    source: document.getElementById('f-source'),
    channel: document.getElementById('f-channel'),
    apply: document.getElementById('f-apply'),
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function barClass(score) {
    if (score >= 60) return 'high'
    if (score >= 30) return 'mid'
    return 'low'
  }

  function buildUrl() {
    const q = new URLSearchParams()
    const city = (filters.city.value || '').trim()
    if (city) q.set('city', city)
    if (filters.source.value) q.set('source', filters.source.value)
    if (filters.channel.value) q.set('channel', filters.channel.value)
    const suffix = q.toString()
    return `${API}/geo-ranking${suffix ? `?${suffix}` : ''}`
  }

  /**
   * 三分数对照。
   *
   * 接口说你被收录了 → 真机搜你的名字，搜出来的是什么 → AI 会不会主动推荐你。
   * 三个数一个比一个难看，落差本身就是我们要讲给门店听的事。
   * 可见性没测就明说没测，绝不留空让人以为很低或很高。
   */
  function renderContrast(summary) {
    const measured = Number(summary.visibilityMeasured || 0)
    const hasFoundation = Number(summary.avgBrowserFoundation || 0) > 0 || Number(summary.avgApiNetwork || 0) > 0
    if (!hasFoundation && !measured) {
      contrastEl.hidden = true
      return
    }

    const visibilityText = measured ? String(summary.avgVisibility) : '未测'
    const visibilityClass = measured ? '' : ' style="color:var(--color-muted)"'
    const apiCount = Number(summary.apiMeasured || 0)
    const foundCount = Number(summary.foundationMeasured || 0)
    const bothCount = Number(summary.bothMeasured || 0)
    const dirCount = Number(summary.directoryOnly || 0)

    // 落差只能在「同一批门店两条路都走过」时才讲。
    // 接口通道目前只有 1 家跑过（还是我们自己），拿它的平均分去比 13 家的真机分数，
    // 说成「这 13 家平均 78 分」——门店随手一查就能戳穿，这种话一句都不能有。
    const gap = Math.max(Number(summary.avgApiNetwork || 0) - Number(summary.avgBrowserFoundation || 0), 0)

    let note = ''
    if (bothCount >= 3 && gap > 0) {
      note = `这 ${bothCount} 家门店两条路都走过：接口联网平均 ${summary.avgApiNetwork} 分，` +
        `真机在百度/360/必应上搜店名只剩 ${summary.avgBrowserFoundation} 分——` +
        `掉的 ${gap} 分，是工商档案与真实呈现之间的距离。`
    } else if (foundCount) {
      note = `真机在百度/360/必应上搜店名，这 ${foundCount} 家平均 ${summary.avgBrowserFoundation} 分。`
    }

    const apiFootnote = apiCount
      ? `接口联网分目前只有 ${apiCount} 家跑过，样本太少，不拿来跟真机分数做对比。`
      : '接口联网分本轮没有样本。'

    contrastEl.hidden = false
    contrastEl.innerHTML = `
      <div class="contrast">
        <div class="contrast-side">
          <div class="contrast-num ok">${summary.avgApiNetwork || '—'}</div>
          <div class="contrast-label">接口联网分<br />大模型联网查得到吗</div>
        </div>
        <div class="contrast-arrow">→</div>
        <div class="contrast-side">
          <div class="contrast-num">${summary.avgBrowserFoundation || '—'}</div>
          <div class="contrast-label">网页实测地基分<br />真机搜名字搜出什么</div>
        </div>
        <div class="contrast-arrow">→</div>
        <div class="contrast-side">
          <div class="contrast-num"${visibilityClass}>${visibilityText}</div>
          <div class="contrast-label">AI 可见性分<br />车主不问店名时被提到</div>
        </div>
      </div>
      <p class="card" style="margin-top:-4px">
        ${
          note
            ? `<span class="contrast-note">${esc(note)}</span>`
            : '<span class="contrast-note">分数由程序自动巡检得出，口径公开可复算。</span>'
        }
        ${
          dirCount
            ? `<br /><span class="muted">其中 <strong>${dirCount} 家</strong>门店，搜出来的结果里六成以上是企查查、天眼查这类工商黄页——车主修车不会去那儿查，那是档案，不是资产。</span>`
            : ''
        }
        ${
          measured
            ? `<br /><span class="muted">已完成可见性实测的 ${measured} 家门店里，<strong>${summary.zeroMention} 家</strong>在业务提问中一次都没被提到。</span>`
            : '<br /><span class="muted">AI 可见性一栏需要大模型网页版登录态，本轮尚未开测，因此不做任何估算。</span>'
        }
        <br /><span class="muted">${esc(apiFootnote)}</span>
      </p>`
  }

  function renderStats(summary) {
    if (!summary.total) {
      statsEl.hidden = true
      return
    }
    statsEl.hidden = false
    const items = [
      { num: summary.total, label: '上榜门店' },
      { num: summary.avg, label: '平均分' },
      { num: summary.median, label: '中位数' },
      { num: summary.max, label: '最高分' },
      { num: summary.min, label: '最低分' },
      { num: summary.directoryOnly || 0, label: '只有工商档案' },
      { num: summary.visibilityMeasured || 0, label: '已测可见性' },
      { num: summary.insufficient, label: '样本不足' },
    ]
    statsEl.innerHTML = items
      .map(
        (item) =>
          `<div class="stat"><div class="stat-num">${item.num}</div><div class="stat-label">${item.label}</div></div>`,
      )
      .join('')
  }

  function ecoDots(list) {
    return (list || [])
      .map(
        (eco) =>
          `<span class="eco-dot${eco.hit ? ' hit' : ''}" title="${esc(eco.label)}${eco.hit ? '：命中' : '：未命中'}">${esc(
            eco.label.slice(0, 1),
          )}</span>`,
      )
      .join('')
  }

  function badges(row) {
    const out = []
    out.push(
      row.source === 'SELF'
        ? '<span class="badge self">主动体检</span>'
        : '<span class="badge batch">公开抽样</span>',
    )
    if (!row.visibilityMeasured) out.push('<span class="badge dim">未做可见性实测</span>')
    // 搜出来六成以上是工商黄页的，单独标一行。这是门店最该看的一眼。
    if (row.directoryOnly) out.push('<span class="badge warn">只有工商档案</span>')
    if (row.insufficient) out.push('<span class="badge warn">样本不足</span>')
    return out.join(' ')
  }

  function numOrDash(value) {
    return Number.isFinite(value) ? String(value) : '—'
  }

  /** 维度明细现在分两组嵌套，展开时也按组呈现，别混成一排 */
  function renderDimensions(row) {
    const dims = row.dimensions || {}
    const groups = [
      { key: 'visibility', title: 'AI 可见性（大模型网页版 · 不带店名的业务提问）' },
      { key: 'foundation', title: '网页实测地基（搜索引擎 · 带店名的查询）' },
    ]
    return groups
      .map((group) => {
        const value = dims[group.key]
        if (!value) return ''
        if (typeof value === 'string' || value.note) {
          return `<div class="dim-group"><b>${esc(group.title)}</b><div class="muted">${esc(
            value.note || value,
          )}</div></div>`
        }
        const items = Object.entries(value)
          .map(
            ([key, item]) =>
              `<div class="dim-item"><b>${esc(key)}</b> ${item.raw}/${item.max}<br /><span class="muted">${esc(
                item.note,
              )}</span></div>`,
          )
          .join('')
        return `<div class="dim-group"><b>${esc(group.title)}</b><div class="dim-grid">${items}</div></div>`
      })
      .filter(Boolean)
      .join('')
  }

  function renderTable(rows) {
    if (!rows.length) {
      box.innerHTML = '<div class="empty" style="padding:24px">还没有门店上榜。去 <a href="/check.html">GEO 体检</a> 测一家。</div>'
      return
    }

    const head = `
      <thead><tr>
        <th class="rank-no">#</th>
        <th>门店</th>
        <th class="rank-score">得分</th>
        <th>AI 可见性</th>
        <th>地基实测</th>
        <th class="mobile-hide">接口联网</th>
        <th class="mobile-hide">生态命中</th>
        <th></th>
      </tr></thead>`

    const body = rows
      .map((row, index) => {
        const noClass = row.rank === 1 ? 'top1' : row.rank <= 3 ? 'top3' : ''
        const visibility = row.visibilityMeasured ? String(row.visibilityScore) : '未测'
        const detail = `
          <tr class="rank-detail" id="d-${index}" hidden>
            <td></td>
            <td colspan="7">
              ${badges(row)}
              ${renderDimensions(row)}
              <div class="muted" style="margin-top:8px">
                通道 ${esc((row.channels || []).join('/'))} ｜ 有效回执 ${row.validPlatforms}/${row.plannedPlatforms} ｜
                置信度 ${row.confidence}% ｜ 批次 ${esc(row.runId || '')} ｜
                更新于 ${new Date(row.updatedAt).toLocaleString('zh-CN')}
              </div>
            </td>
          </tr>`
        return `
          <tr>
            <td class="rank-no ${noClass}">${row.rank}</td>
            <td>
              <div><strong>${esc(row.name)}</strong></div>
              <div class="muted" style="font-size:12px">${esc(row.city)}${
                row.industry ? ' · ' + esc(row.industry) : ''
              }${row.directoryOnly ? ' · <span style="color:var(--color-danger)">只有工商档案</span>' : ''}</div>
            </td>
            <td class="rank-score">
              <div class="score-num">${row.score}</div>
              <div class="score-bar ${barClass(row.score)}"><i style="width:${row.score}%"></i></div>
              <div class="score-sub">${esc(row.scoreLabel)}</div>
            </td>
            <td>
              <div class="${row.visibilityMeasured ? '' : 'muted'}">${visibility}</div>
              <div class="score-sub">${row.visibilityMeasured ? '被提到 ' + row.coverageRate + '%' : '需登录态'}</div>
            </td>
            <td>
              <div>${numOrDash(row.browserFoundationScore)}</div>
              <div class="score-sub">真机搜索</div>
            </td>
            <td class="mobile-hide">
              <div>${numOrDash(row.apiNetworkScore)}</div>
              <div class="score-sub">${esc(row.apiNetworkLabel || '接口联网')}</div>
            </td>
            <td class="mobile-hide"><div class="eco-dots">${ecoDots(row.ecosystems)}</div></td>
            <td><button class="rank-toggle" data-row="${index}" type="button">明细 ▾</button></td>
          </tr>
          ${detail}`
      })
      .join('')

    box.innerHTML = `<table class="rank">${head}<tbody>${body}</tbody></table>`

    box.querySelectorAll('.rank-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = box.querySelector(`#d-${btn.dataset.row}`)
        if (!row) return
        row.hidden = !row.hidden
        btn.textContent = row.hidden ? '明细 ▾' : '收起 ▴'
      })
    })
  }

  async function load() {
    box.innerHTML = '<div class="empty" style="padding:24px">正在加载榜单…</div>'
    try {
      const res = await fetch(buildUrl(), { headers: { Accept: 'application/json' } })
      const payload = await res.json()
      if (!res.ok || payload.code !== 0) {
        throw new Error(payload.message || `HTTP ${res.status}`)
      }
      const data = payload.data || {}
      renderContrast(data.summary || {})
      renderStats(data.summary || {})
      renderTable(data.rows || [])
      if (data.summary && data.summary.updatedAt) {
        updatedEl.textContent = `更新于 ${new Date(data.summary.updatedAt).toLocaleString('zh-CN')}`
      }
    } catch (error) {
      box.innerHTML = `<div class="error-box">榜单加载失败：${esc(error.message)}</div>`
    }
  }

  filters.apply.addEventListener('click', load)
  filters.city.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      load()
    }
  })
  load()
})()
