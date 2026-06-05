(function (global) {
  var SESSION_KEY = 'zj_track_sid'
  var MAX_BATCH = 10
  var queue = []
  var flushTimer = null

  function randomId(prefix) {
    return (
      prefix +
      '_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 10)
    )
  }

  function getSessionId() {
    try {
      var sid = sessionStorage.getItem(SESSION_KEY)
      if (!sid) {
        sid = randomId('sid')
        sessionStorage.setItem(SESSION_KEY, sid)
      }
      return sid
    } catch (e) {
      return randomId('sid')
    }
  }

  function parseAttribution() {
    var params = new URLSearchParams(location.search)
    var source = params.get('utm_source') || params.get('source') || ''
    var channel = params.get('utm_medium') || params.get('channel') || ''
    if (!channel && source === 'wechat_mp') channel = 'wechat_mp'
    if (!channel && !document.referrer) channel = 'direct'
    return { source: source, channel: channel }
  }

  /** 默认 ingest 路径（勿用 /track/，易被 AdBlock 拦截导致 Network 里看不到 POST） */
  var DEFAULT_INGEST_PATH = '/api/v1/analytics/events'

  function apiBase() {
    if (global.__TRACK_API_BASE__) return String(global.__TRACK_API_BASE__).replace(/\/$/, '')
    return ''
  }

  function ingestUrl() {
    var base = apiBase()
    if (base) return base + DEFAULT_INGEST_PATH
    return DEFAULT_INGEST_PATH
  }

  function buildPayload(events) {
    return {
      events: events.map(function (ev) {
        var attr = parseAttribution()
        return {
          eventId: ev.eventId || randomId('evt'),
          eventName: ev.eventName,
          sessionId: getSessionId(),
          pagePath: ev.pagePath || location.pathname + location.search,
          referrer: ev.referrer != null ? ev.referrer : document.referrer || '',
          source: ev.source || attr.source,
          channel: ev.channel || attr.channel,
          city: ev.city || '',
          eventParams: ev.eventParams || {},
        }
      }),
    }
  }

  function flush() {
    if (!queue.length) return Promise.resolve()
    var batch = queue.splice(0, MAX_BATCH)
    var url = ingestUrl()
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(buildPayload(batch)),
    })
      .then(function (res) {
        return res.json()
      })
      .catch(function () {
        return null
      })
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(function () {
      flushTimer = null
      flush()
    }, 400)
  }

  function track(eventName, eventParams, extra) {
    if (!eventName) return
    queue.push(
      Object.assign(
        {
          eventName: eventName,
          eventParams: eventParams || {},
        },
        extra || {}
      )
    )
    scheduleFlush()
    if (eventName === 'h5_case_view' || eventName === 'h5_page_view') {
      flush()
    }
  }

  function trackPageView(eventName, eventParams) {
    track(eventName || 'h5_page_view', eventParams)
  }

  function trackCaseView(data) {
    track('h5_case_view', {
      caseId: data.id || data.caseId || '',
      storeId: data.storeId || '',
      storeName: data.storeName || '',
      serviceItemId: data.serviceItemId || data.serviceId || '',
    })
  }

  function bindScrollDepth(caseId) {
    var sent = { 25: false, 50: false, 75: false, 100: false }
    function onScroll() {
      var doc = document.documentElement
      var max = Math.max(doc.scrollHeight - window.innerHeight, 1)
      var ratio = Math.min(100, Math.round((window.scrollY / max) * 100))
      var milestones = [25, 50, 75, 100]
      for (var i = 0; i < milestones.length; i += 1) {
        var m = milestones[i]
        if (ratio >= m && !sent[m]) {
          sent[m] = true
          track('h5_scroll_depth', { caseId: caseId || '', depth: m })
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }

  function onPageHide() {
    if (!queue.length) return
    var url = ingestUrl()
    try {
      var body = JSON.stringify(buildPayload(queue.splice(0, MAX_BATCH)))
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: body,
          keepalive: true,
        })
      }
    } catch (e) {
      /* ignore */
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') onPageHide()
    })
  }

  global.zhejianTrack = {
    track: track,
    trackPageView: trackPageView,
    trackCaseView: trackCaseView,
    bindScrollDepth: bindScrollDepth,
    flush: flush,
    ingestUrl: ingestUrl,
  }
})(typeof window !== 'undefined' ? window : global)
