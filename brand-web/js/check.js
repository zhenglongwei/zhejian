/**
 * GEO 体检 · 大模型 API 轮询通道（2026-08-30 新架构）
 *
 * 提交一次 → 后台逐一询问各家大模型的联网接口 → 出两块分数：
 *   生态存在分  拿企业全名去问，各家生态里查不查得到这家企业
 *   AI 可见性分 拿不带店名的行业问题去问，AI 会不会主动提到这家
 *
 * 页面纪律（都是老板定的）：
 *   - 没配 key 的引擎整条不显示，页面上不出现「未配置，没查」这种字样
 *   - 没有浏览器巡检入口，没有「暂不可用」——这条路就是设计好的体检方式
 *   - 来源只展示和企业全名对得上的，名字相近的一律剔除并说明剔了多少
 */
(function () {
  const form = document.getElementById('form')
  const statusEl = document.getElementById('status')
  const resultEl = document.getElementById('result')
  const submitBtn = document.getElementById('submitBtn')

  function endpoint() {
    const params = new URLSearchParams(location.search)
    if (params.get('api')) return params.get('api')
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:3000/api/v1/public/geo-check'
    }
    return 'https://geo.simplewin.cn/api/v1/public/geo-check'
  }

  function runEndpoint(runId) {
    return endpoint().replace(/\/?$/, '') + '/run/' + encodeURIComponent(runId)
  }

  function statusEndpoint() {
    return endpoint().replace(/\/?$/, '') + '/status'
  }

  function showStatus(type, text) {
    statusEl.hidden = false
    statusEl.className = type === 'error' ? 'error-box err' : 'empty muted'
    statusEl.textContent = text
  }

  function hideStatus() {
    statusEl.hidden = true
    statusEl.textContent = ''
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderHits(sources) {
    if (!sources || !sources.length) return ''
    return sources
      .slice(0, 6)
      .map(function (hit) {
        return (
          '<div class="hit"><span class="tag">' +
          escapeHtml(hit.sourceLabel || '网页') +
          '</span><a href="' +
          escapeHtml(hit.url) +
          '" target="_blank" rel="noopener">' +
          escapeHtml(hit.title || hit.url) +
          '</a></div>'
        )
      })
      .join('')
  }

  /** 维度键英文 → 中文，键名由服务端决定，没见过的原样输出 */
  const DIM_LABEL = {
    mention: '被提到',
    position: '位次',
    accuracy: '准确度',
    hitRate: '命中率',
    firstRank: '首条位次',
    sourceQuality: '来源质量',
    sourceBreadth: '来源广度',
  }

  function dimGridHtml(group) {
    let html = '<div class="dim-grid">'
    Object.keys(group || {}).forEach(function (key) {
      const item = group[key]
      if (!item || item.raw == null) return
      html +=
        '<div class="dim-item"><b>' +
        escapeHtml(DIM_LABEL[key] || key) +
        '</b> ' +
        item.raw +
        '/' +
        item.max +
        '<br /><span class="muted">' +
        escapeHtml(item.note || '') +
        '</span></div>'
    })
    return html + '</div>'
  }

  function existenceVerdict(row) {
    if (row.status !== 'ok') return '<span class="muted">没查成</span>'
    if (row.found === true) return '<span class="ok">查到</span>'
    return '<span class="err">未查到</span>'
  }

  function renderExistence(existence) {
    const rows = existence.rows || []
    let html = '<div class="card">'
    html += '<p class="step-kicker">第一部分 · 生态存在</p>'
    html +=
      '<h2 style="margin-top:0">拿企业全名去问：' +
      (existence.score == null ? '未测出分数' : existence.score + ' / 100') +
      '</h2>'
    html +=
      '<p class="muted">问的是「网上是否存在『' +
      escapeHtml(document.getElementById('companyName').value.trim()) +
      '』」。' +
      existence.validEngines +
      ' 家大模型联网回答，' +
      existence.foundEngines +
      ' 家查得到这家企业的信息。名字相近的其他公司一律不算数。</p>'

    rows.forEach(function (row) {
      html += '<div class="hit">'
      html += '<strong>' + escapeHtml(row.label) + '</strong> · ' + existenceVerdict(row)
      if (row.ecoLabel) html += ' <span class="muted">（' + escapeHtml(row.ecoLabel) + '）</span>'
      if (row.note) html += '<br /><span class="muted">' + escapeHtml(row.note) + '</span>'
      if (row.droppedUnrelated > 0) {
        html +=
          '<br /><span class="muted">已剔除 ' + row.droppedUnrelated + ' 条只是名字相近的来源</span>'
      }
      html += renderHits(row.sources)
      html += '</div>'
    })
    html += '</div>'
    return html
  }

  function renderVisibility(visibility, engineResults) {
    let html = '<div class="card">'
    html += '<p class="step-kicker">第二部分 · AI 可见性</p>'
    html +=
      '<h2 style="margin-top:0">拿行业问题去问：' +
      (visibility.score == null ? '未测出分数' : visibility.score + ' / 100') +
      '</h2>'
    if (visibility.note) {
      html += '<p class="muted">' + escapeHtml(visibility.note) + '</p>'
    } else {
      html +=
        '<p class="muted">每家大模型都被问了一组不带店名的行业问题。' +
        visibility.validReceipts +
        ' 次有效回答里，' +
        visibility.mentionedReceipts +
        ' 次主动提到了这家企业（提及率 ' +
        visibility.mentionRate +
        '%）。</p>'
      if (visibility.dimensions) html += dimGridHtml(visibility.dimensions)
    }

    ;(engineResults || []).forEach(function (engine) {
      if (!engine.answers || !engine.answers.length) return
      html += '<h3 style="font-size:15px;margin:16px 0 4px">' + escapeHtml(engine.label) + '</h3>'
      engine.answers.forEach(function (answer) {
        const verdict =
          answer.mentioned === true
            ? '<span class="ok">被提到</span>'
            : answer.mentioned === false
              ? '<span class="err">没被提到</span>'
              : '<span class="muted">没查成</span>'
        html +=
          '<div class="hit"><span class="muted">问：' +
          escapeHtml(answer.question) +
          '</span><br />' +
          verdict +
          (answer.answerSnippet
            ? ' <span class="muted">' + escapeHtml(answer.answerSnippet) + '…</span>'
            : '') +
          (answer.errorMessage
            ? ' <span class="muted">' + escapeHtml(answer.errorMessage) + '</span>'
            : '') +
          '</div>'
      })
    })
    html += '</div>'
    return html
  }

  function renderGaps(gaps) {
    if (!gaps || !gaps.length) return ''
    let html = '<div class="card"><p class="step-kicker">这一轮查到的缺口</p><ul style="margin:8px 0 0">'
    gaps.forEach(function (gap) {
      html += '<li class="gap">' + escapeHtml(gap) + '</li>'
    })
    html += '</ul></div>'
    return html
  }

  function renderRanking(ranking) {
    if (!ranking) return ''
    let html = '<div class="card"><p class="step-kicker">已计入榜单</p>'
    html += '<h2 style="margin-top:0">接口联网分 ' + ranking.score + ' / 100</h2>'
    html +=
      '<p class="muted" style="margin-bottom:0">置信度 ' +
      ranking.confidence +
      '%（有效回执 ÷ 计划回执）。这个分数由企业名核对和行业提问两路合成，' +
      '口径公开，<a href="/rank.html">去榜单看排名 →</a></p>'
    html += '</div>'
    return html
  }

  function renderReport(job) {
    const report = job.report || {}
    let html = ''

    html += '<div class="card">'
    html += '<p class="step-kicker">体检完成 · 大模型联网接口轮询</p>'
    html +=
      '<p style="margin:0">问了一遍各家大模型的联网接口。下面是两本账：<strong>各家生态里查不查得到这家企业</strong>，' +
      '以及<strong>车主不问店名时 AI 想不想得到它</strong>。两块分开算，谁也不冒充谁。</p>'
    html += '</div>'

    if (report.existence) html += renderExistence(report.existence)
    if (report.visibility) html += renderVisibility(report.visibility, report.engineResults)
    html += renderGaps(report.gaps)
    html += renderRanking(job.ranking)

    html +=
      '<p class="muted" style="margin-top:12px">' +
      escapeHtml(report.disclaimer || '') +
      '</p>'

    resultEl.hidden = false
    resultEl.innerHTML = html
  }

  function pollTimer(runId, attempt) {
    if (attempt > 120) {
      showStatus('error', '等太久了，可能卡住了。刷新页面后用 runId ' + runId + ' 再查。')
      submitBtn.disabled = false
      return
    }
    setTimeout(async function () {
      try {
        const res = await fetch(runEndpoint(runId))
        const body = await res.json()
        const job = body.data || {}
        const done = job.progress ? job.progress.done : 0
        const total = job.progress ? job.progress.total : 0
        showStatus(
          'loading',
          '正在逐家询问大模型… ' + done + '/' + total + (job.progress && job.progress.current ? '（' + job.progress.current + '）' : ''),
        )
        if (job.status === 'running' || job.status === 'pending') {
          pollTimer(runId, attempt + 1)
          return
        }
        hideStatus()
        submitBtn.disabled = false
        if (job.status === 'failed' || !job.report) {
          showStatus('error', '体检失败：' + (job.error || '未知原因'))
          return
        }
        renderReport(job)
      } catch (error) {
        pollTimer(runId, attempt + 1)
      }
    }, 3000)
  }

  async function parseBody(res) {
    const body = await res.json().catch(function () {
      return {}
    })
    if (body && body.code === 0) return { ok: true, data: body.data || {} }
    if (!res.ok || body.code) return { ok: false, message: body.message || '请求失败' }
    return { ok: true, data: body.data || body }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    resultEl.hidden = true
    resultEl.innerHTML = ''
    const companyName = document.getElementById('companyName').value.trim()
    const city = document.getElementById('city').value.trim()
    const industry = document.getElementById('industry').value.trim()
    if (companyName.length < 2) {
      showStatus('error', '请填写企业名称')
      return
    }
    if (!industry) {
      showStatus('error', '请填写行业，行业问题要靠它生成')
      return
    }
    submitBtn.disabled = true
    showStatus('loading', '正在提交体检任务…')
    try {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, city, industry }),
      })
      const parsed = await parseBody(res)
      if (!parsed.ok) {
        showStatus('error', parsed.message)
        submitBtn.disabled = false
        return
      }
      pollTimer(parsed.data.runId, 0)
    } catch (error) {
      showStatus('error', '网络不通。本地预览请确认 API 已启动，或在地址后加 ?api=接口地址')
      submitBtn.disabled = false
    }
  })

  // 预检：确认服务端到底配了几家大模型接口。一家都没配才提示；
  // 配了几家就明说本轮会问到哪几家——配一半也是正常状态，不是「没准备好」。
  fetch(statusEndpoint())
    .then(function (res) {
      return res.json()
    })
    .then(function (body) {
      const data = body.data || {}
      if (!data.ready) {
        showStatus('error', '体检通道暂未开放，请稍后再试。')
        submitBtn.disabled = true
        return
      }
      const names = (data.engines || []).map(function (item) {
        return item.label
      })
      if (names.length) {
        showStatus('loading', '本轮将询问 ' + names.length + ' 家大模型的联网接口：' + names.join('、'))
      }
    })
    .catch(function () {})
})()
