/**
 * GEO 体检 · 大模型 API 轮询通道（2026-08-30 新架构 + 老板 4 点优化）
 *
 * 页面流程（两步）：
 *   第一步  填企业名/城市/行业 → 预生成 5~10 道行业问题
 *   第二步  用户在页面上换一批 / 换一题 / 直接改 / 增删，确认后才提交轮询
 *
 * 轮询出两块分数：
 *   生态存在分  拿企业全名去问，各家生态里查不查得到这家企业
 *   AI 可见性分 拿不带店名的行业问题去问，AI 会不会主动提到这家
 *
 * 报告组织：先整体结论，再分块展开（老板定的）。
 * 报告落库可回看：完成后地址栏变成 ?run=xxx，刷新或分享都能再打开；
 * 同名同城的历次体检会列在「历史对比」里。
 *
 * 页面纪律（都是老板定的）：
 *   - 没配 key 的引擎整条不显示，页面上不出现「未配置，没查」这种字样
 *   - 没有浏览器巡检入口，没有「暂不可用」——这条路就是设计好的体检方式
 *   - 来源只展示和企业全名对得上的，名字相近的一律剔除并说明剔了多少
 */
(function () {
  const form = document.getElementById('form')
  const statusEl = document.getElementById('status')
  const progressEl = document.getElementById('progress')
  const questionsEl = document.getElementById('questions')
  const resultEl = document.getElementById('result')
  const submitBtn = document.getElementById('submitBtn')

  // 当前两步流程的状态：第一步入库后，第二步的题单和身份都存在这里
  const state = {
    identity: null, // { companyName, city, industry }
    questions: [], // 用户编辑中的题单
    busy: false,
  }

  function endpoint() {
    const params = new URLSearchParams(location.search)
    if (params.get('api')) return params.get('api')
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:3000/api/v1/public/geo-check'
    }
    return 'https://geo.simplewin.cn/api/v1/public/geo-check'
  }

  function apiPath(suffix) {
    return endpoint().replace(/\/?$/, '') + suffix
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

  async function parseBody(res) {
    const body = await res.json().catch(function () {
      return {}
    })
    if (body && body.code === 0) return { ok: true, data: body.data || {} }
    if (!res.ok || body.code) return { ok: false, message: body.message || '请求失败' }
    return { ok: true, data: body.data || body }
  }

  /* ---------------- 第一步：预生成问题 + 题单编辑 ---------------- */

  function readIdentity() {
    return {
      companyName: document.getElementById('companyName').value.trim(),
      city: document.getElementById('city').value.trim(),
      industry: document.getElementById('industry').value.trim(),
    }
  }

  function validateIdentity(identity) {
    if (identity.companyName.length < 2) return '请填写企业名称'
    if (!identity.industry) return '请填写行业，行业问题要靠它生成'
    return ''
  }

  /** 请求问题生成。exclude：要避开的题（换一批=整批；换一题=要保留的其余题） */
  async function fetchQuestions(identity, exclude) {
    const res = await fetch(apiPath('/questions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: identity.companyName,
        city: identity.city,
        industry: identity.industry,
        exclude: exclude || [],
      }),
    })
    const parsed = await parseBody(res)
    if (!parsed.ok) throw new Error(parsed.message)
    return (parsed.data.questions || []).map(function (q) {
      return String(q || '').trim()
    }).filter(Boolean)
  }

  /** 渲染题单编辑器：每题一个可直接改的输入框 + 换一题 + 删除 */
  function renderQuestionEditor() {
    let html = '<div class="card">'
    html += '<p class="step-kicker">第二步 · 确认要问的问题</p>'
    html +=
      '<p class="muted" style="margin-top:0">这些是接下来要拿去问各家大模型的行业问题（不带店名）。' +
      '可以直接改，也可以换一批、换其中一题、增删。确认后才开始体检。</p>'
    html += '<div class="question-list">'
    state.questions.forEach(function (q, index) {
      html +=
        '<div class="question-item" data-index="' +
        index +
        '">' +
        '<input type="text" maxlength="120" value="' +
        escapeHtml(q) +
        '" data-role="q-input" />' +
        '<button type="button" class="btn-ghost" data-role="q-swap">换一题</button>' +
        '<button type="button" class="btn-ghost" data-role="q-del">删除</button>' +
        '</div>'
    })
    html += '</div>'
    html += '<p style="margin:12px 0 0">'
    html += '<button type="button" class="btn-ghost" data-role="q-add">+ 加一题</button> '
    html += '<button type="button" class="btn-ghost" data-role="q-swap-all">换一批</button> '
    html += '<button type="button" class="btn" data-role="q-confirm">确认问题，开始体检</button>'
    html += '</p>'
    html += '<p class="muted" style="margin:8px 0 0">共 <b data-role="q-count">' + state.questions.length + '</b> 题，每家大模型都会被问到这些题（外加 1 道企业名核对）。</p>'
    html += '</div>'
    questionsEl.hidden = false
    questionsEl.innerHTML = html
  }

  /** 把页面上输入框里的最新值同步回 state（用户可能手改过） */
  function syncQuestionsFromDom() {
    const inputs = questionsEl.querySelectorAll('[data-role="q-input"]')
    const next = []
    inputs.forEach(function (input) {
      const q = input.value.trim()
      if (q.length >= 4) next.push(q)
    })
    state.questions = next
  }

  async function handleSwapOne(index, btn) {
    syncQuestionsFromDom()
    const keep = state.questions.filter(function (_, i) {
      return i !== index
    })
    btn.disabled = true
    btn.textContent = '换题中…'
    try {
      const fresh = await fetchQuestions(state.identity, keep)
      const replacement = fresh.find(function (q) {
        return keep.indexOf(q) === -1
      })
      if (replacement) {
        state.questions[index] = replacement
      } else if (fresh.length) {
        state.questions[index] = fresh[0]
      }
      renderQuestionEditor()
    } catch (error) {
      showStatus('error', '换题失败：' + error.message)
      renderQuestionEditor()
    }
  }

  async function handleSwapAll(btn) {
    syncQuestionsFromDom()
    btn.disabled = true
    btn.textContent = '生成中…'
    try {
      const fresh = await fetchQuestions(state.identity, state.questions)
      if (fresh.length) state.questions = fresh
      renderQuestionEditor()
    } catch (error) {
      showStatus('error', '换一批失败：' + error.message)
      renderQuestionEditor()
    }
  }

  questionsEl.addEventListener('click', function (event) {
    const role = event.target && event.target.getAttribute('data-role')
    if (!role || state.busy) return
    const item = event.target.closest('.question-item')
    const index = item ? Number(item.getAttribute('data-index')) : -1

    if (role === 'q-swap' && index >= 0) {
      handleSwapOne(index, event.target)
    } else if (role === 'q-del' && index >= 0) {
      syncQuestionsFromDom()
      state.questions.splice(index, 1)
      renderQuestionEditor()
    } else if (role === 'q-add') {
      syncQuestionsFromDom()
      if (state.questions.length >= 10) {
        showStatus('error', '最多 10 题，再多一轮体检就太贵了')
        return
      }
      state.questions.push('')
      renderQuestionEditor()
      const inputs = questionsEl.querySelectorAll('[data-role="q-input"]')
      const last = inputs[inputs.length - 1]
      if (last) last.focus()
    } else if (role === 'q-swap-all') {
      handleSwapAll(event.target)
    } else if (role === 'q-confirm') {
      syncQuestionsFromDom()
      if (!state.questions.length) {
        showStatus('error', '至少保留 1 道题，不然行业提问这一路没得测')
        return
      }
      submitCheck()
    }
  })

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    resultEl.hidden = true
    resultEl.innerHTML = ''
    questionsEl.hidden = true
    questionsEl.innerHTML = ''
    const identity = readIdentity()
    const invalidMsg = validateIdentity(identity)
    if (invalidMsg) {
      showStatus('error', invalidMsg)
      return
    }
    state.identity = identity
    state.questions = []
    submitBtn.disabled = true
    showStatus('loading', '正在根据行业生成问题…')
    try {
      state.questions = await fetchQuestions(identity, [])
      if (!state.questions.length) throw new Error('一道题都没生成出来，请换个行业写法再试')
      hideStatus()
      renderQuestionEditor()
      questionsEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      showStatus('error', error.message || '网络不通。本地预览请确认 API 已启动，或在地址后加 ?api=接口地址')
    }
    submitBtn.disabled = false
  })

  /* ---------------- 第二步：提交轮询 + 分引擎进度 ---------------- */

  function renderEngineProgress(engines) {
    const ids = Object.keys(engines || {})
    if (!ids.length) {
      progressEl.hidden = true
      progressEl.innerHTML = ''
      return
    }
    let html = '<div class="card"><p class="step-kicker" style="margin-top:0">正在逐家询问大模型</p><div class="dim-grid">'
    ids.forEach(function (id) {
      const item = engines[id]
      const done = item.done || 0
      const total = item.total || 0
      const finished = total > 0 && done >= total
      html +=
        '<div class="dim-item"><b>' +
        escapeHtml(item.label || id) +
        '</b> ' +
        (finished ? '<span class="ok">已完成</span>' : done + '/' + total) +
        '</div>'
    })
    html += '</div></div>'
    progressEl.hidden = false
    progressEl.innerHTML = html
  }

  async function submitCheck() {
    state.busy = true
    questionsEl.hidden = true
    resultEl.hidden = true
    resultEl.innerHTML = ''
    showStatus('loading', '体检任务已提交，正在逐家询问大模型…')
    try {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: state.identity.companyName,
          city: state.identity.city,
          industry: state.identity.industry,
          questions: state.questions,
        }),
      })
      const parsed = await parseBody(res)
      if (!parsed.ok) {
        showStatus('error', parsed.message)
        questionsEl.hidden = false
        state.busy = false
        return
      }
      pollTimer(parsed.data.runId, 0)
    } catch (error) {
      showStatus('error', '网络不通。本地预览请确认 API 已启动，或在地址后加 ?api=接口地址')
      questionsEl.hidden = false
      state.busy = false
    }
  }

  function pollTimer(runId, attempt) {
    if (attempt > 120) {
      showStatus('error', '等太久了，可能卡住了。刷新页面后用 runId ' + runId + ' 再查。')
      state.busy = false
      return
    }
    setTimeout(async function () {
      try {
        const res = await fetch(apiPath('/run/' + encodeURIComponent(runId)))
        const body = await res.json()
        const job = body.data || {}
        const done = job.progress ? job.progress.done : 0
        const total = job.progress ? job.progress.total : 0
        showStatus('loading', '正在逐家询问大模型… 总进度 ' + done + '/' + total)
        if (job.progress && job.progress.engines) renderEngineProgress(job.progress.engines)
        if (job.status === 'running' || job.status === 'pending') {
          pollTimer(runId, attempt + 1)
          return
        }
        hideStatus()
        progressEl.hidden = true
        progressEl.innerHTML = ''
        state.busy = false
        if (job.status === 'failed' || !job.report) {
          showStatus('error', '体检失败：' + (job.error || '未知原因'))
          questionsEl.hidden = false
          return
        }
        // 报告已落库：地址栏换成可回看的链接，刷新/分享都能再打开
        const storedRunId = (job.ranking && job.ranking.runId) || job.report.persistRunId || ''
        if (storedRunId && history.replaceState) {
          history.replaceState(null, '', '?run=' + encodeURIComponent(storedRunId))
        }
        renderReport(job.report, job.ranking, {
          companyName: job.report.companyName,
          city: job.report.city,
        })
        loadHistory(job.report.companyName, job.report.city, storedRunId)
      } catch (error) {
        pollTimer(runId, attempt + 1)
      }
    }, 3000)
  }

  /* ---------------- 报告渲染：先整体结论，再分块展开 ---------------- */

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

  function scoreText(score) {
    return score == null ? '未测出' : score + ' / 100'
  }

  /** 整体结论卡：一页只读这一张也能知道结果（老板定的「先结论后展开」） */
  function renderConclusion(report) {
    const conclusion = report.conclusion || {}
    let html = '<div class="card">'
    html += '<p class="step-kicker">整体结论</p>'
    html += '<div class="stat-grid">'
    html +=
      '<div class="stat"><div class="stat-num">' +
      scoreText(conclusion.existenceScore != null ? conclusion.existenceScore : report.existence && report.existence.score) +
      '</div><div class="stat-label">生态存在分</div></div>'
    html +=
      '<div class="stat"><div class="stat-num">' +
      scoreText(conclusion.visibilityScore != null ? conclusion.visibilityScore : report.visibility && report.visibility.score) +
      '</div><div class="stat-label">AI 可见性分</div></div>'
    html +=
      '<div class="stat"><div class="stat-num">' +
      (conclusion.queriedEngines || (report.enginesConfigured || []).length || '—') +
      '</div><div class="stat-label">家大模型被询问</div></div>'
    html += '</div>'
    if (conclusion.verdict) {
      html += '<p style="margin:12px 0 0"><strong>' + escapeHtml(conclusion.verdict) + '</strong></p>'
    }
    if (report.gaps && report.gaps.length) {
      html += '<ul style="margin:8px 0 0">'
      report.gaps.forEach(function (gap) {
        html += '<li class="gap">' + escapeHtml(gap) + '</li>'
      })
      html += '</ul>'
    }
    html += '<p class="muted" style="margin:12px 0 0">两本账分开算，谁也不冒充谁：生态存在是「查不查得到你」，AI 可见性是「不问名字时想不想得到你」。下面是详细回执。</p>'
    html += '</div>'
    return html
  }

  function existenceVerdict(row) {
    if (row.status !== 'ok') return '<span class="muted">没查成</span>'
    if (row.found === true) return '<span class="ok">查到</span>'
    return '<span class="err">未查到</span>'
  }

  function renderExistence(existence, companyName) {
    const rows = existence.rows || []
    let html = '<div class="card">'
    html += '<p class="step-kicker">详细 · 生态存在</p>'
    html += '<h2 style="margin-top:0">拿企业全名去问：' + scoreText(existence.score) + '</h2>'
    html +=
      '<p class="muted">问的是「网上是否存在『' +
      escapeHtml(companyName) +
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
        html += '<br /><span class="muted">已剔除 ' + row.droppedUnrelated + ' 条只是名字相近的来源</span>'
      }
      html += renderHits(row.sources)
      html += '</div>'
    })
    html += '</div>'
    return html
  }

  function renderVisibility(visibility, engineResults) {
    let html = '<div class="card">'
    html += '<p class="step-kicker">详细 · AI 可见性</p>'
    html += '<h2 style="margin-top:0">拿行业问题去问：' + scoreText(visibility.score) + '</h2>'
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
          (answer.errorMessage ? ' <span class="muted">' + escapeHtml(answer.errorMessage) + '</span>' : '') +
          '</div>'
      })
    })
    html += '</div>'
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

  /** 历史对比卡：同名同城的历次体检，看分数是涨了还是跌了 */
  function renderHistory(items, currentRunId) {
    if (!items || !items.length) return ''
    let html = '<div class="card"><p class="step-kicker">历史对比 · 这家企业的历次体检</p>'
    html += '<table class="rank"><thead><tr><th>时间</th><th>生态存在</th><th>AI 可见性</th><th>接口联网分</th><th></th></tr></thead><tbody>'
    items.forEach(function (item) {
      const isCurrent = item.runId === currentRunId
      const date = item.createdAt ? new Date(item.createdAt) : null
      const dateText = date
        ? date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
        : '—'
      html += '<tr>'
      html += '<td>' + dateText + (isCurrent ? ' <span class="badge self">本次</span>' : '') + '</td>'
      html += '<td>' + (item.existenceScore == null ? '—' : item.existenceScore) + '</td>'
      html += '<td>' + (item.visibilityScore == null ? '—' : item.visibilityScore) + '</td>'
      html += '<td>' + (item.rankingScore == null ? '—' : item.rankingScore) + '</td>'
      html += '<td><a href="?run=' + encodeURIComponent(item.runId) + '">回看</a></td>'
      html += '</tr>'
    })
    html += '</tbody></table></div>'
    return html
  }

  function renderReport(report, ranking, meta, historyHtml) {
    let html = ''
    html += renderConclusion(report)
    if (report.existence) html += renderExistence(report.existence, (meta && meta.companyName) || report.companyName || '')
    if (report.visibility) html += renderVisibility(report.visibility, report.engineResults)
    html += renderRanking(ranking)
    if (historyHtml) html += historyHtml
    html += '<p class="muted" style="margin-top:12px">' + escapeHtml(report.disclaimer || '') + '</p>'

    resultEl.hidden = false
    resultEl.innerHTML = html
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** 拉历史记录并补一张对比卡到报告尾部 */
  async function loadHistory(companyName, city, currentRunId) {
    try {
      const res = await fetch(
        apiPath('/history?companyName=' + encodeURIComponent(companyName) + '&city=' + encodeURIComponent(city || '')),
      )
      const parsed = await parseBody(res)
      if (!parsed.ok) return
      const html = renderHistory(parsed.data.items, currentRunId)
      if (!html) return
      // 追加到 disclaimer 之前：直接插在 resultEl 末尾的 muted 说明前
      const container = document.createElement('div')
      container.innerHTML = html
      const disclaimer = resultEl.lastElementChild
      resultEl.insertBefore(container.firstChild, disclaimer)
    } catch (error) {
      // 历史拉不到不影响报告本身
    }
  }

  /* ---------------- 回看模式：?run=xxx 直接打开历史报告 ---------------- */

  async function loadStoredReport(runId) {
    showStatus('loading', '正在打开历史体检报告…')
    try {
      const res = await fetch(apiPath('/report/' + encodeURIComponent(runId)))
      const parsed = await parseBody(res)
      if (!parsed.ok) {
        hideStatus()
        showStatus('error', parsed.message || '报告不存在')
        return
      }
      const data = parsed.data
      hideStatus()
      const target = data.target || {}
      // 把这家企业的信息回填到表单里，方便直接再测一次
      if (target.name) document.getElementById('companyName').value = target.name
      if (target.city) document.getElementById('city').value = target.city
      if (target.industry) document.getElementById('industry').value = target.industry
      renderReport(data.report, data.ranking, { companyName: target.name, city: target.city })
      loadHistory(target.name, target.city, runId)
    } catch (error) {
      showStatus('error', '网络不通，打不开这份报告。')
    }
  }

  /* ---------------- 页面初始化 ---------------- */

  const params = new URLSearchParams(location.search)
  const runParam = params.get('run')

  // 预检：确认服务端到底配了几家大模型接口。一家都没配才提示；
  // 配了几家就明说本轮会问到哪几家——配一半也是正常状态，不是「没准备好」。
  fetch(apiPath('/status'))
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
      if (names.length && !runParam) {
        showStatus('loading', '本轮将询问 ' + names.length + ' 家大模型的联网接口：' + names.join('、'))
      }
    })
    .catch(function () {})
    .finally(function () {
      if (runParam) loadStoredReport(runParam)
    })
})()
