;(function () {
  var GEO = 'https://geo.simplewin.cn/'
  var API = GEO + 'api/v1/public/h5/case-shelf'
  var EMPTY = {
    nav: '了解公开案例站 ↗',
    ownerText: '了解公开案例站怎么运作',
    ownerHref: '/zhejian.html',
    shelf: '了解公开案例站 ↗',
  }
  var READY = {
    nav: '公开案例 ↗',
    ownerText: '我是车主，看公开维修档案',
    ownerHref: GEO,
    shelf: '看公开维修档案 ↗',
  }

  function setTextHref(el, text, href) {
    if (!el) return
    el.hidden = false
    el.removeAttribute('aria-hidden')
    el.textContent = text
    if (href) el.setAttribute('href', href)
  }

  function apply(hasCases) {
    var copy = hasCases ? READY : EMPTY
    document.querySelectorAll('[data-case-nav]').forEach(function (el) {
      setTextHref(el, copy.nav, GEO)
    })
    document.querySelectorAll('[data-hero-owner]').forEach(function (el) {
      setTextHref(el, copy.ownerText, copy.ownerHref)
    })
    document.querySelectorAll('[data-shelf-link]').forEach(function (el) {
      setTextHref(el, copy.shelf, GEO)
    })
  }

  function run() {
    apply(false)
    fetch(API, { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('shelf')
        return res.json()
      })
      .then(function (body) {
        var data = body && body.data
        apply(Boolean(data && data.hasPublicCases))
      })
      .catch(function () {
        apply(false)
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
