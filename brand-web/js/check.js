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

  function showStatus(type, text) {
    statusEl.hidden = false
    statusEl.className = type === 'error' ? 'error-box err' : 'empty muted'
    statusEl.textContent = text
  }

  function hideStatus() {
    statusEl.hidden = true
    statusEl.textContent = ''
  }

  function toneLabel(tone) {
    if (tone === 'ok') return '自动项大体能对上'
    if (tone === 'mixed') return '有缺口'
    if (tone === 'weak') return '缺口较多'
    return '这次没查全'
  }

  function statusLabel(status) {
    if (status === 'ok') return '已查'
    if (status === 'unconfigured') return '未配置，没查'
    if (status === 'skipped') return '未做'
    if (status === 'manual') return '需截图或现场看'
    if (status === 'error') return '出错'
    return status || '未知'
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderHits(hits) {
    if (!hits || !hits.length) return '<p class="muted">没有名称对得上的网页。</p>'
    return hits
      .slice(0, 8)
      .map(function (hit) {
        return (
          '<div class="hit"><span class="tag">' +
          escapeHtml(hit.sourceLabel) +
          '</span><a href="' +
          escapeHtml(hit.url) +
          '" target="_blank" rel="noopener">' +
          escapeHtml(hit.title || hit.url) +
          '</a></div>'
        )
      })
      .join('')
  }

  function renderChannel(title, part, extraHits) {
    if (!part) return ''
    let html =
      '<p><strong>' +
      escapeHtml(title) +
      '</strong>：' +
      escapeHtml(statusLabel(part.status))
    if (part.status === 'ok' && typeof part.ecosystemFound === 'boolean') {
      html += part.ecosystemFound ? '（摸到该生态链接）' : '（这次没摸到该生态链接）'
    }
    html += '</p>'
    if (part.note) html += '<p class="muted">' + escapeHtml(part.note) + '</p>'
    if (part.reason && part.status !== 'ok') html += '<p class="muted">' + escapeHtml(part.reason) + '</p>'
    const hits = extraHits || part.ecosystemHits || part.sources || part.hits
    if (hits && hits.length) html += renderHits(hits)
    return html
  }

  function renderOfficial(official) {
    if (!official) return ''
    let html = '<h3>官网结构化抽查</h3>'
    html += '<p>' + escapeHtml(statusLabel(official.status)) + '</p>'
    if (official.note) html += '<p class="muted">' + escapeHtml(official.note) + '</p>'
    if (official.chosen) {
      html +=
        '<p>认定网址：<a href="' +
        escapeHtml(official.chosen.url) +
        '" target="_blank" rel="noopener">' +
        escapeHtml(official.chosen.title || official.chosen.url) +
        '</a></p>'
    }
    const audit = official.audit
    if (audit && audit.checks) {
      html += '<ul class="check-list">'
      audit.checks.forEach(function (item) {
        html +=
          '<li class="' +
          (item.ok ? 'ok' : 'gap') +
          '">' +
          escapeHtml(item.label) +
          (item.ok ? ' · 有' : ' · 缺') +
          '</li>'
      })
      html += '</ul>'
    }
    if (official.otherCandidates && official.otherCandidates.length) {
      html += '<p class="muted">其他候选（未测）：</p>'
      html += renderHits(official.otherCandidates)
    }
    return html
  }

  /**
   * 第二步：浏览器自动巡检，一次提交同时出两个分。
   *
   * 原来这一步是让人手动把 10 道题粘进 5 个 App、每个再截 2 张图，落地不了。
   * 现在程序自己开浏览器：搜索型平台用带店名的查询（出地基分），
   * 对话型平台用不带店名的业务问题（出可见性分），两条路各算各的。
   */
  function renderAutoProbe(prompts) {
    const questions = (prompts && prompts.questions) || []
    let html = '<div class="card" id="step2">'
    html += '<p class="step-kicker">浏览器自动巡检</p>'
    html += '<h2 style="margin-top:0">真机跑一遍，看车主实际看得到什么</h2>'
    html += '<p>程序会自己打开浏览器，分两路去查，各出一个分：</p>'
    html += '<ul class="how-to">'
    html +=
      '<li><strong>带店名的查询</strong>去搜百度、360、必应 —— 搜名字第一页到底出现什么？' +
      '企查查天眼查算不算数？出<strong>网页实测地基分</strong>。</li>'
    html +=
      '<li><strong>不带店名的业务问题</strong>去问豆包、通义、元宝 —— ' +
      '车主不问店名的时候，AI 想不想得到你？出<strong>AI 可见性分</strong>。</li>'
    html += '</ul>'
    html +=
      '<p class="muted">题库、平台地址和访问顺序都在服务端配置。' +
      '（搜索平台的强项是「拿名字搜」，拿推荐类问题去问它等于让鱼爬树，所以两路分开。）</p>'

    if (prompts && prompts.note) html += '<p class="muted">' + escapeHtml(prompts.note) + '</p>'

    if (questions.length) {
      html += '<p class="muted" style="margin-bottom:4px">对话平台会问这些问题（不带店名）：</p>'
      html += '<ul class="question-list">'
      questions.forEach(function (q) {
        html +=
          '<li><span>' +
          escapeHtml(q) +
          '</span><button type="button" class="btn btn-ghost btn-copy" data-copy="' +
          escapeHtml(q) +
          '">复制</button></li>'
      })
      html += '</ul>'
      html +=
        '<p class="muted">这些题也可以自己复制到 App 里验证。' +
        '但我们只把<strong>程序自动抓回来的答案</strong>计入分数 —— ' +
        '人工看到的结果不上传、不入库，避免看图猜词造成误判。</p>'
    }

    html += '<div id="probe-status" class="muted"></div>'
    html += '<p style="margin-top:12px"><button class="btn" type="button" id="probeBtn">开始自动巡检</button></p>'
    html += '<div id="probe-result"></div>'
    html += '</div>'
    return html
  }

  function probeEndpoint() {
    return endpoint().replace(/\/?$/, '') + '/browser'
  }

  function runEndpoint(runId) {
    return endpoint().replace(/\/?$/, '') + '/run/' + encodeURIComponent(runId)
  }

  function browserStatusEndpoint() {
    return probeEndpoint() + '/status'
  }

  /**
   * 搜索结果证据。
   *
   * 这段是整份体检报告里门店最该看的地方：搜你的名字，第一页到底出现了什么。
   * 「你在第 7 条，前 6 条是企查查、天眼查、招聘网」——比任何分数都有说服力。
   */
  function searchEvidenceHtml(item) {
    if (item.status !== 'ok' || !isSearchItem(item)) return ''
    const rows = (item.citedUrls || []).filter(function (row) {
      return row && (row.title || row.snippet)
    })
    if (!rows.length) {
      return '<br /><span class="muted">搜索无结果：这个查询在页面上一条都没返回。</span>'
    }
    const shown = rows.slice(0, 3)
    let html = '<div style="margin:8px 0 0;padding-left:10px;border-left:2px solid var(--color-border)">'
    shown.forEach(function (row) {
      const source = row.domain || row.source || '未知来源'
      const directory = isDirectorySource(source)
      html +=
        '<div style="margin:4px 0"><span class="muted">' +
        escapeHtml('#' + (row.rank || '-')) +
        '</span> ' +
        '<span class="' +
        (directory ? 'err' : 'muted') +
        '">[' +
        escapeHtml(source) +
        ']</span> ' +
        escapeHtml(String(row.title || '').slice(0, 46)) +
        '</div>'
    })
    if (rows.length > 3) {
      html += '<div class="muted">…共 ' + rows.length + ' 条</div>'
    }
    html += '</div>'
    return html
  }

  /** 企查查、天眼查这类工商黄页，车主修车不会去那儿找店——标红提醒 */
  function isDirectorySource(source) {
    return /qcc|qichacha|aiqicha|tianyancha|11467|likuso|cnpp|企查查|天眼查|爱企查|boss|zhaopin|liepin|58\.com/i.test(
      String(source || ''),
    )
  }

  function isSearchItem(item) {
    return /baidu_web|so_web|bing_web|_web$|search/.test(String(item.platform || ''))
  }

  /**
   * 维度键是英文的（mention / hitRate …），直接打到中文页面上很扎眼。
   * 键名由服务端决定，这里只做展示翻译；遇到没见过的键原样输出，不猜。
   */
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

  function setProbeStatus(text) {
    const el = document.getElementById('probe-status')
    if (el) el.innerHTML = text
  }

  function pollTimer(runId, attempt) {
    if (attempt > 120) {
      setProbeStatus('等太久了，可能卡住了。刷新页面后用 runId <code>' + escapeHtml(runId) + '</code> 再查。')
      const btn = document.getElementById('probeBtn')
      if (btn) btn.disabled = false
      return
    }
    setTimeout(async function () {
      try {
        const res = await fetch(runEndpoint(runId))
        const body = await res.json()
        const job = body.data || {}
        const done = job.progress ? job.progress.done : 0
        const total = job.progress ? job.progress.total : 0
        setProbeStatus('巡检中… ' + done + '/' + total + (job.progress && job.progress.current ? '（' + escapeHtml(job.progress.current) + '）' : ''))
        if (job.status === 'running' || job.status === 'pending') {
          pollTimer(runId, attempt + 1)
          return
        }
        renderProbeResult(job)
      } catch (error) {
        pollTimer(runId, attempt + 1)
      }
    }, 3000)
  }

  function renderProbeResult(job) {
    const host = document.getElementById('probe-result')
    const btn = document.getElementById('probeBtn')
    if (btn) btn.disabled = false
    if (!host) return

    if (job.status === 'failed') {
      setProbeStatus('')
      host.innerHTML = '<div class="error-box">巡检失败：' + escapeHtml(job.error || '未知原因') + '</div>'
      return
    }

    setProbeStatus('')
    const score = job.score
    const result = job.result || {}
    let html = ''

    if (score) {
      const scope = score.measuredScope || 'none'
      const vis = score.visibilityScore
      const found = score.foundationScore
      const scopeLabel =
        scope === 'both'
          ? '综合分'
          : scope === 'visibility'
            ? 'AI 可见性分'
            : scope === 'foundation'
              ? '网页实测地基分'
              : '未测出分数'

      html += '<div class="card" style="margin-top:16px">'
      html += '<p class="step-kicker">' + scopeLabel + '</p>'
      html += '<h2 style="margin-top:0">' + score.score + ' / 100</h2>'

      // 两个分数并排，测了哪个显示哪个，没测就写「未测」。
      // 用 0 或未测互相冒充是这套系统最致命的错，宁可空着。
      html += '<div class="contrast" style="margin:12px 0">'
      html +=
        '<div class="contrast-side"><div class="contrast-num">' +
        (vis == null ? '未测' : vis) +
        '</div><div class="contrast-label">AI 可见性<br />不问店名时被提到</div></div>'
      html += '<div class="contrast-arrow">·</div>'
      html +=
        '<div class="contrast-side"><div class="contrast-num">' +
        (found == null ? '未测' : found) +
        '</div><div class="contrast-label">网页实测地基<br />真机搜店名搜出什么</div></div>'
      html += '</div>'

      html +=
        '<p class="muted">AI 收录覆盖率 ' +
        score.coverageRate +
        '% ｜ 置信度 ' +
        score.confidence +
        '% ｜ 有效回执平台 ' +
        score.validPlatforms +
        '/' +
        score.plannedPlatforms +
        '</p>'

      if (score.visibilityScore == null) {
        html +=
          '<p class="muted" style="margin-bottom:0">AI 可见性一栏需要大模型网页版登录态，' +
          '本轮没有跑通，因此不做任何估算——没测就是没测，不会拿地基分顶替。</p>'
      }

      const dims = score.dimensions || {}
      if (dims.foundation && dims.foundation.hitRate) {
        html += '<h3 style="font-size:15px;margin-bottom:6px">网页实测地基（搜索引擎 · 带店名的查询）</h3>'
        html += dimGridHtml(dims.foundation)
      }
      if (dims.visibility && dims.visibility.mention) {
        html += '<h3 style="font-size:15px;margin-bottom:6px">AI 可见性（大模型 · 不带店名的业务提问）</h3>'
        html += dimGridHtml(dims.visibility)
      }
      if ((!dims.foundation || !dims.foundation.hitRate) && (!dims.visibility || !dims.visibility.mention)) {
        html += '<p class="muted" style="margin-bottom:0">' + escapeHtml(dims.foundation?.note || dims.visibility?.note || '') + '</p>'
      }
      html += '</div>'
    }

    const items = job.items || []
    if (items.length) {
      html += '<div class="card" style="margin-top:16px"><h3 style="margin-top:0">逐条回执</h3>'
      items.forEach(function (item) {
        const ok = item.status === 'ok'
        // 抓失败的回执 mentioned 是 null，只能写「未判定」，不能写成「没被提到」
        const verdict =
          item.mentioned === true
            ? '<span class="ok">被提到</span>'
            : item.mentioned === false
              ? '<span class="err">没被提到</span>'
              : '<span class="muted">未判定</span>'
        html +=
          '<div class="hit"><strong>' +
          escapeHtml(item.platformLabel || item.platform) +
          '</strong> · <span class="' +
          (ok ? 'ok' : 'err') +
          '">' +
          escapeHtml(item.status) +
          '</span> · ' +
          verdict +
          '<br /><span class="muted">问：' +
          escapeHtml(item.question || '') +
          '</span>' +
          (item.errorMessage ? '<br /><span class="muted">' + escapeHtml(item.errorMessage) + '</span>' : '') +
          searchEvidenceHtml(item) +
          (ok && item.answerText && !isSearchItem(item)
            ? '<br /><span class="muted">' + escapeHtml(item.answerText.slice(0, 160)) + '…</span>'
            : '') +
          '</div>'
      })
      html += '</div>'
    }

    // 归一化后 terminatedPlatforms 在 job 顶层，不再嵌套在 result 里
    const terminated = job.terminatedPlatforms || []
    if (terminated.length) {
      html += '<div class="card" style="margin-top:16px"><h3 style="margin-top:0">这一轮没跑完的平台</h3>'
      terminated.forEach(function (item) {
        html +=
          '<p class="gap" style="margin:4px 0">' +
          escapeHtml(item.label) +
          '：<strong>' +
          escapeHtml(item.status) +
          '</strong> — ' +
          escapeHtml(item.message) +
          '</p>'
      })
      html += '<p class="muted" style="margin-bottom:0">没跑完的不会当成「没被提到」，只拉低置信度。</p></div>'
    }

    html +=
      '<p class="muted" style="margin-top:12px">runId <code>' +
      escapeHtml(job.runId || '') +
      '</code> ｜ <a href="/rank.html">去榜单看排名 →</a></p>'
    host.innerHTML = html
  }

  function bindAutoProbe(data) {
    const btn = document.getElementById('probeBtn')
    if (!btn) return

    // 先看浏览器通道能不能用，不能用就把按钮废掉并说明原因
    fetch(browserStatusEndpoint())
      .then(function (res) {
        return res.json()
      })
      .then(function (body) {
        const env = body.data || {}
        if (!env.ready) {
          btn.disabled = true
          // 浏览器通道跑不了就直说跑不了。原来这里引导用户去手动截图，
          // 那条路既落地不了，又是「看图猜词」进数据的唯一入口，已经撤掉。
          setProbeStatus(
            '真机巡检暂不可用：' +
              escapeHtml(env.reason || '环境未就绪') +
              '。本次只能看到接口联网分，网页实测地基分和 AI 可见性分要等这条通道恢复后再测。',
          )
          return
        }
        const needLogin = (env.platforms || []).filter(function (p) {
          return p.needsLogin
        })
        if (!needLogin.length) {
          setProbeStatus('可用平台：' + (env.platforms || []).map(function (p) { return escapeHtml(p.label) }).join('、'))
        } else if (env.profile && !env.profile.hasCookieDb) {
          setProbeStatus(
            '可用平台：' +
              (env.platforms || []).map(function (p) { return escapeHtml(p.label) }).join('、') +
              '。<strong>需要登录的平台尚未登录</strong>，本轮只会跑免登录的那些。',
          )
        }
      })
      .catch(function () {
        setProbeStatus('无法确认浏览器通道状态。')
      })

    btn.addEventListener('click', async function () {
      const companyName = document.getElementById('companyName').value.trim()
      const city = document.getElementById('city').value.trim()
      const industry = document.getElementById('industry').value.trim()
      btn.disabled = true
      setProbeStatus('正在提交巡检任务…')
      try {
        const res = await fetch(probeEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName, city, industry }),
        })
        const parsed = await parseBody(res)
        if (!parsed.ok) {
          setProbeStatus('')
          btn.disabled = false
          const host = document.getElementById('probe-result')
          if (host) host.innerHTML = '<div class="error-box">' + escapeHtml(parsed.message) + '</div>'
          return
        }
        const runId = parsed.data.runId
        setProbeStatus('任务已提交，浏览器正在逐个平台提问…')
        pollTimer(runId, 0)
      } catch (error) {
        setProbeStatus('网络不通，提交失败。')
        btn.disabled = false
      }
    })
  }

  function renderReport(data) {
    const l1 = data.layer1 || {}
    const web = l1.web || {}
    const map = l1.map || {}
    const gaps = l1.gaps || []

    let html = '<div class="card"><p><strong>' + escapeHtml(toneLabel(data.overall)) + '</strong></p>'
    html += '<p class="muted">' + escapeHtml(data.disclaimer || '') + '</p></div>'

    html += '<div class="card"><p class="step-kicker">接口通道</p><h2 style="margin-top:0">大模型联网后怎么说这家</h2>'
    html += renderChannel('百度网页', web, web.hits)
    html += '<p>地图：' + escapeHtml(statusLabel(map.status))
    if (map.found) html += map.matchedName ? '（有点，名称对得上）' : '（有点，名称对不上）'
    html += '</p>'
    if (map.note) html += '<p class="muted">' + escapeHtml(map.note) + '</p>'
    if (map.items && map.items[0]) {
      html += '<p class="muted">' + escapeHtml(map.items[0].name + ' · ' + (map.items[0].address || '')) + '</p>'
    }
    html += renderChannel('通义联网 · 测阿里系', l1.qwen)
    html += renderChannel('混元联网 · 测腾讯系', l1.hunyuan, (l1.hunyuan && l1.hunyuan.ecosystemHits && l1.hunyuan.ecosystemHits.length) ? l1.hunyuan.ecosystemHits : (l1.hunyuan && l1.hunyuan.sources))
    html += renderChannel('豆包联网 · 测字节系', l1.doubao)
    html += renderOfficial(l1.official)
    html += '</div>'

    if (gaps.length) {
      html += '<div class="card"><h2 style="margin-top:0">接口通道查到的缺口</h2><ul>'
      gaps.forEach(function (gap) {
        html += '<li class="gap">' + escapeHtml(gap) + '</li>'
      })
      html += '</ul></div>'
    }

    html += apiNetworkScoreHtml(data.ranking)
    html += renderAutoProbe(data.step2 && data.step2.prompts)

    resultEl.hidden = false
    resultEl.innerHTML = html
    bindAutoProbe(data)
  }

  /**
   * 第一步（接口通道）落库后返回的分数。
   *
   * 这个分数必须叫「接口联网分」，不能叫「地基分」——地基分是浏览器真机搜店名那一路的
   * 专属名字。两条通道的测法完全不同：接口是问大模型「你知道这家吗」，网页实测是真的
   * 打开搜索引擎把店名敲进去看第一页出现什么。混着叫，榜单上的口径就废了。
   */
  function apiNetworkScoreHtml(ranking) {
    if (!ranking) return ''
    const dims = ranking.dimensions || {}
    let html = '<div class="card"><p class="step-kicker">接口联网分（这一路不用浏览器）</p>'
    html += '<h2 style="margin-top:0">' + ranking.score + ' / 100</h2>'
    html +=
      '<p class="muted">问的是「大模型联网后知不知道这家」。它和下面浏览器真机搜店名测出来的' +
      '<strong>网页实测地基分</strong>不是一回事：接口查得到，不等于车主搜得到。' +
      '这两者之间的落差，往往就是这家店真实的网络呈现。</p>'

    // dimensions 是 { visibility: {...}, foundation: {...} } 两层，
    // 直接按一层遍历会渲染出「visibility undefined/undefined」。
    // 接口通道的回执按 chat 型处理，分数落在 visibility 块；地基块只会带一句 note。
    const block =
      (dims.visibility && (dims.visibility.mention || dims.visibility.hitRate) && dims.visibility) ||
      (dims.foundation && dims.foundation.hitRate && dims.foundation) ||
      null
    if (block) {
      html += dimGridHtml(block)
    } else {
      html +=
        '<p class="muted" style="margin-bottom:0">' +
        escapeHtml((dims.visibility && dims.visibility.note) || (dims.foundation && dims.foundation.note) || '这一路没有有效回执，未出分。') +
        '</p>'
    }
    html +=
      '<p class="muted" style="margin-bottom:0">置信度 ' +
      ranking.confidence +
      '%（有效回执通道数 ÷ 计划通道数）。<a href="/rank.html">看看榜单上其他店 →</a></p>'
    html += '</div>'
    return html
  }

  resultEl.addEventListener('click', function (event) {
    const copyBtn = event.target.closest('.btn-copy')
    if (copyBtn) {
      const text = copyBtn.getAttribute('data-copy') || ''
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = '已复制'
        })
      } else {
        window.prompt('复制这条题', text)
      }
      return
    }
  })

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
      showStatus('error', '请填写行业，第二步要靠它生成业务题')
      return
    }
    submitBtn.disabled = true
    showStatus('loading', '正在用百度和三系检索搜企业名，并抽查官网。可能要几十秒…')
    try {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, city, industry }),
      })
      const parsed = await parseBody(res)
      if (!parsed.ok) {
        showStatus('error', parsed.message)
        return
      }
      hideStatus()
      renderReport(parsed.data)
    } catch (error) {
      showStatus('error', '网络不通。本地预览请确认 API 已启动，或在地址后加 ?api=接口地址')
    } finally {
      submitBtn.disabled = false
    }
  })

  function statusEndpoint() {
    return endpoint().replace(/\/?$/, '') + '/status'
  }

  fetch(statusEndpoint())
    .then(function (res) {
      return res.json()
    })
    .then(function (body) {
      const data = body.data
      if (!data || !data.channels) return
      if (data.canRunPartial) return
      showStatus(
        'error',
        '后端还没配检索密钥，查了也只会显示「未查」。把生产服务器 backend/.env 里的百炼、火山、高德密钥拷到本机后再重启后端。',
      )
    })
    .catch(function () {})
})()
