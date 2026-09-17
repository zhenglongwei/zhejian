/**
 * 专题页 / 商品页共用筛选排序条（一行；排序用按钮展开）
 */
;(function (global) {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function yearFromText(text) {
    var match = String(text || '').match(/\b(19|20)\d{2}\b/)
    return match ? Number(match[0]) : 0
  }

  function vehicleKey(text) {
    return String(text || '')
      .replace(/[（(].*$/, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(' ')
  }

  function ageBucket(year) {
    if (!year) return ''
    var age = new Date().getFullYear() - year
    if (age <= 3) return '0-3'
    if (age <= 8) return '3-8'
    return '8+'
  }

  function uniqueOptions(items, pickValue, pickLabel) {
    var seen = {}
    var out = []
    ;(items || []).forEach(function (item) {
      var value = pickValue(item)
      if (!value || seen[value]) return
      seen[value] = true
      out.push({ value: value, label: pickLabel ? pickLabel(item, value) : value })
    })
    return out.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label), 'zh')
    })
  }

  function itemVehicleTexts(item) {
    if (item && item.vehicleTexts && item.vehicleTexts.length) return item.vehicleTexts
    var text = (item && (item.vehicleText || item.title)) || ''
    return text ? [text] : []
  }

  function uniqueVehicleOptions(items) {
    var seen = {}
    var out = []
    ;(items || []).forEach(function (item) {
      itemVehicleTexts(item).forEach(function (text) {
        var value = vehicleKey(text)
        if (!value || seen[value]) return
        seen[value] = true
        out.push({ value: value, label: value })
      })
    })
    return out.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label), 'zh')
    })
  }

  function defaultFiltersFromCases(items) {
    return [
      {
        key: 'city',
        label: '城市',
        allLabel: '全部城市',
        options: uniqueOptions(items, function (row) {
          return String(row.city || '').trim()
        }),
      },
      {
        key: 'vehicle',
        label: '车型',
        allLabel: '全部车型',
        options: uniqueVehicleOptions(items),
      },
      {
        key: 'age',
        label: '车龄',
        allLabel: '全部车龄',
        options: [
          { value: '0-3', label: '3 年内' },
          { value: '3-8', label: '3–8 年' },
          { value: '8+', label: '8 年以上' },
        ],
      },
      {
        key: 'distance',
        label: '距离',
        allLabel: '不限距离',
        options: [
          { value: '5', label: '5 公里内' },
          { value: '10', label: '10 公里内' },
          { value: '20', label: '20 公里内' },
        ],
      },
    ]
  }

  function defaultFiltersFromOffers(items) {
    return [
      {
        key: 'city',
        label: '城市',
        allLabel: '全部城市',
        options: uniqueOptions(items, function (row) {
          return String(row.city || '').trim()
        }),
      },
      {
        key: 'vehicle',
        label: '车型',
        allLabel: '全部车型',
        options: uniqueVehicleOptions(items),
      },
      {
        key: 'age',
        label: '车龄',
        allLabel: '全部车龄',
        options: [
          { value: '0-3', label: '3 年内' },
          { value: '3-8', label: '3–8 年' },
          { value: '8+', label: '8 年以上' },
        ],
      },
      {
        key: 'distance',
        label: '距离',
        allLabel: '不限距离',
        options: [
          { value: '5', label: '5 公里内' },
          { value: '10', label: '10 公里内' },
          { value: '20', label: '20 公里内' },
        ],
      },
    ]
  }

  function matchFilters(item, selected) {
    if (selected.city && String(item.city || '') !== selected.city) return false
    if (selected.vehicle) {
      var keys = itemVehicleTexts(item).map(vehicleKey).filter(Boolean)
      if (keys.indexOf(selected.vehicle) === -1) return false
    }
    if (selected.age) {
      var ages = itemVehicleTexts(item)
        .map(function (text) {
          return ageBucket(yearFromText(text))
        })
        .filter(Boolean)
      if (ages.indexOf(selected.age) === -1) return false
    }
    if (selected.distance) {
      if (item.distanceKm == null) return false
      if (Number(item.distanceKm) > Number(selected.distance)) return false
    }
    return true
  }

  function renderMenu(filter, selectedValue) {
    var current = selectedValue || ''
    var rows = [{ value: '', label: filter.allLabel || '不限' }].concat(filter.options || [])
    return (
      '<div class="h5-toolbar__menu" hidden role="listbox">' +
      rows
        .map(function (opt) {
          var on = String(opt.value) === String(current)
          return (
            '<button type="button" class="h5-toolbar__option' +
            (on ? ' is-active' : '') +
            '" data-filter-key="' +
            escapeHtml(filter.key) +
            '" data-filter-value="' +
            escapeHtml(opt.value) +
            '" role="option" aria-selected="' +
            (on ? 'true' : 'false') +
            '">' +
            escapeHtml(opt.label) +
            '</button>'
          )
        })
        .join('') +
      '</div>'
    )
  }

  function chipLabel(filter, selectedValue) {
    if (!selectedValue) return filter.label
    var hit = (filter.options || []).find(function (opt) {
      return String(opt.value) === String(selectedValue)
    })
    return hit ? hit.label : filter.label
  }

  function render(options) {
    options = options || {}
    var filters = options.filters || []
    var sorts = options.sorts || []
    var selected = options.selected || {}
    var sortValue = options.sortValue || (sorts[0] && sorts[0].value) || ''
    var sortHit = sorts.find(function (row) {
      return row.value === sortValue
    })
    var id = options.id || 'h5-toolbar'
    var filterHtml = filters
      .map(function (filter) {
        return (
          '<div class="h5-toolbar__item" data-toolbar-item="' +
          escapeHtml(filter.key) +
          '">' +
          '<button type="button" class="h5-toolbar__chip' +
          (selected[filter.key] ? ' is-active' : '') +
          '" data-toolbar-open="' +
          escapeHtml(filter.key) +
          '" aria-expanded="false">' +
          escapeHtml(chipLabel(filter, selected[filter.key])) +
          '</button>' +
          renderMenu(filter, selected[filter.key]) +
          '</div>'
        )
      })
      .join('')
    var sortHtml = ''
    if (sorts.length) {
      sortHtml =
        '<div class="h5-toolbar__item h5-toolbar__item--sort" data-toolbar-item="sort">' +
        '<button type="button" class="h5-toolbar__chip h5-toolbar__chip--sort" data-toolbar-open="sort" aria-expanded="false">' +
        escapeHtml(sortHit ? sortHit.label : '排序') +
        '</button>' +
        '<div class="h5-toolbar__menu" hidden role="listbox">' +
        sorts
          .map(function (opt) {
            var on = opt.value === sortValue
            return (
              '<button type="button" class="h5-toolbar__option' +
              (on ? ' is-active' : '') +
              '" data-sort-value="' +
              escapeHtml(opt.value) +
              '" role="option" aria-selected="' +
              (on ? 'true' : 'false') +
              '">' +
              escapeHtml(opt.label) +
              '</button>'
            )
          })
          .join('') +
        '</div></div>'
    }
    return (
      '<div class="h5-toolbar" id="' +
      escapeHtml(id) +
      '">' +
      '<div class="h5-toolbar__filters">' +
      filterHtml +
      '</div>' +
      sortHtml +
      '</div>'
    )
  }

  function closeAll(root) {
    if (!root) return
    root.querySelectorAll('.h5-toolbar__menu').forEach(function (menu) {
      menu.hidden = true
    })
    root.querySelectorAll('[data-toolbar-open]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false')
    })
  }

  function bind(root, handlers) {
    if (!root) return
    handlers = handlers || {}
    root.addEventListener('click', function (event) {
      var openBtn = event.target.closest('[data-toolbar-open]')
      if (openBtn && root.contains(openBtn)) {
        var item = openBtn.closest('[data-toolbar-item]')
        var menu = item && item.querySelector('.h5-toolbar__menu')
        var willOpen = menu && menu.hidden
        closeAll(root)
        if (willOpen) {
          menu.hidden = false
          openBtn.setAttribute('aria-expanded', 'true')
        }
        return
      }
      var filterOpt = event.target.closest('[data-filter-key]')
      if (filterOpt && root.contains(filterOpt)) {
        closeAll(root)
        if (handlers.onFilter) {
          handlers.onFilter(
            filterOpt.getAttribute('data-filter-key'),
            filterOpt.getAttribute('data-filter-value') || ''
          )
        }
        return
      }
      var sortOpt = event.target.closest('[data-sort-value]')
      if (sortOpt && root.contains(sortOpt)) {
        closeAll(root)
        if (handlers.onSort) handlers.onSort(sortOpt.getAttribute('data-sort-value') || '')
      }
    })
    document.addEventListener('click', function (event) {
      if (!root.contains(event.target)) closeAll(root)
    })
  }

  global.zhejianFilterSort = {
    render: render,
    bind: bind,
    matchFilters: matchFilters,
    defaultFiltersFromCases: defaultFiltersFromCases,
    defaultFiltersFromOffers: defaultFiltersFromOffers,
    vehicleKey: vehicleKey,
    yearFromText: yearFromText,
    ageBucket: ageBucket,
  }
})(typeof window !== 'undefined' ? window : globalThis)
