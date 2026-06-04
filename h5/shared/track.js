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

  function apiBase() {
    if (global.__TRACK_API_BASE__) return String(global.__TRACK_API_BASE__).replace(/\/$/, '')
    return ''
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
    var url = apiBase() + '/api/v1/track/events'
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

  global.zhejianTrack = {
    track: track,
    trackPageView: trackPageView,
    trackCaseView: trackCaseView,
    bindScrollDepth: bindScrollDepth,
    flush: flush,
  }
})(typeof window !== 'undefined' ? window : global)
