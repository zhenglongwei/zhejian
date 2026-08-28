(function () {
  const form = document.getElementById('form')
  const statusEl = document.getElementById('status')
  const resultEl = document.getElementById('result')
  const submitBtn = document.getElementById('submitBtn')
  const shotInput = document.getElementById('shots')
  const shotHint = document.getElementById('shotHint')
  let screenshots = []

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

  function compressFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = function () {
        const max = 1280
        let w = img.width
        let h = img.height
        if (w > max || h > max) {
          const scale = Math.min(max / w, max / h)
          w = Math.round(w * scale)
          h = Math.round(h * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.onerror = function () {
        URL.revokeObjectURL(url)
        reject(new Error('图片无法读取'))
      }
      img.src = url
    })
  }

  shotInput.addEventListener('change', async function () {
    const files = Array.from(shotInput.files || []).slice(0, 4)
    shotHint.textContent = files.length ? '正在压缩截图…' : ''
    screenshots = []
    try {
      for (const file of files) {
        screenshots.push(await compressFile(file))
      }
      shotHint.textContent = screenshots.length ? `已选 ${screenshots.length} 张` : ''
    } catch (error) {
      shotHint.textContent = error.message
      screenshots = []
    }
  })

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
    if (!hits || !hits.length) return '<p class="muted">没有列出条目。</p>'
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

  function renderReport(data) {
    const l1 = data.layer1 || {}
    const l2 = data.layer2 || {}
    const web = l1.web || {}
    const map = l1.map || {}
    const doubao = l2.doubao || {}
    const shots = l2.screenshots || {}
    const gaps = [].concat(l1.gaps || [], l2.gaps || [])

    let html = '<div class="card"><p><strong>' + escapeHtml(toneLabel(data.overall)) + '</strong></p>'
    html += '<p class="muted">' + escapeHtml(data.disclaimer || '') + '</p></div>'

    html += '<div class="card"><h2 style="margin-top:0">第一层 · 信息在不在</h2>'
    html +=
      '<p>公开网页：' +
      escapeHtml(statusLabel(web.status)) +
      (web.provider === 'qwen' ? '（通义联网兜底）' : web.provider === 'baidu' ? '（百度）' : '') +
      '</p>'
    if (web.reason) html += '<p class="muted">' + escapeHtml(web.reason) + '</p>'
    html += renderHits(web.hits)
    html += '<p>地图：' + escapeHtml(statusLabel(map.status))
    if (map.found) html += map.matchedName ? '（有点，名称大致对得上）' : '（有点，名称对不太上）'
    html += '</p>'
    if (map.items && map.items[0]) {
      html += '<p class="muted">' + escapeHtml(map.items[0].name + ' · ' + (map.items[0].address || '')) + '</p>'
    }
    html += '<p class="muted">' + escapeHtml((l1.wechat && l1.wechat.note) || '') + '</p>'
    const hunyuan = l1.hunyuan || {}
    html +=
      '<p>' +
      escapeHtml(hunyuan.label || '腾讯混元联网') +
      '：' +
      escapeHtml(statusLabel(hunyuan.status))
    if (hunyuan.status === 'ok') {
      html += hunyuan.weixinFound ? '（来源里有微信/公众号链接）' : '（这次没有公众号链接）'
    }
    html += '</p>'
    if (hunyuan.note) html += '<p class="muted">' + escapeHtml(hunyuan.note) + '</p>'
    html += renderHits(hunyuan.weixinHits && hunyuan.weixinHits.length ? hunyuan.weixinHits : hunyuan.sources)
    if (hunyuan.answer) html += '<p>' + escapeHtml(hunyuan.answer.slice(0, 400)) + '</p>'
    html += '</div>'

    html += '<div class="card"><h2 style="margin-top:0">第二层 · 有没有被提到</h2>'
    html += '<p>' + escapeHtml(doubao.label || '豆包联网') + '：' + escapeHtml(statusLabel(doubao.status))
    if (doubao.status === 'ok') html += doubao.mentioned ? '（回答里点到了这家）' : '（回答里没点名）'
    html += '</p>'
    if (doubao.answer) html += '<p>' + escapeHtml(doubao.answer.slice(0, 600)) + '</p>'
    if (doubao.reason) html += '<p class="muted">' + escapeHtml(doubao.reason) + '</p>'
    html += '<p>截图：' + escapeHtml(statusLabel(shots.status)) + '</p>'
    if (shots.items && shots.items[0]) {
      const shot = shots.items[0]
      html += '<p>' + escapeHtml(shot.summary || '') + '</p>'
      if (shot.platformGuess && shot.platformGuess !== 'unknown') {
        html += '<p class="muted">看起来像：' + escapeHtml(shot.platformGuess) + '</p>'
      }
    }
    html += '</div>'

    if (gaps.length) {
      html += '<div class="card"><h2 style="margin-top:0">缺口</h2><ul>'
      gaps.forEach(function (gap) {
        html += '<li class="gap">' + escapeHtml(gap) + '</li>'
      })
      html += '</ul></div>'
    }

    resultEl.hidden = false
    resultEl.innerHTML = html
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    resultEl.hidden = true
    resultEl.innerHTML = ''
    const companyName = document.getElementById('companyName').value.trim()
    const city = document.getElementById('city').value.trim()
    if (companyName.length < 2) {
      showStatus('error', '请填写企业名称')
      return
    }
    submitBtn.disabled = true
    showStatus('loading', '正在查网页、地图和联网回答，可能要几十秒…')
    try {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, city, screenshots }),
      })
      const body = await res.json().catch(function () {
        return {}
      })
      if (!res.ok || body.code) {
        if (body.code === 0) {
          hideStatus()
          renderReport(body.data || {})
          return
        }
        showStatus('error', body.message || '检查失败')
        return
      }
      hideStatus()
      renderReport(body.data || body)
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
