(function () {
  var ROTATE_MS = 5000
  var WATCH_TABS_KEY = 'fund_tracker_watchlist_tabs'
  var LEGACY_WATCHLIST_KEY = 'fund_tracker_watchlist'
  var QUOTE_CACHE_KEY = 'fund_tracker_watch_quote_cache'
  var SETTINGS_KEY = 'fund_tracker_settings'

  var slot = document.getElementById('quote-slot')
  var shell = document.getElementById('widget-shell')
  var index = 0
  var timer = null

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch (e) {
      return fallback
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function sanitizeCodes(codes) {
    return Array.isArray(codes)
      ? codes.filter(function (code, itemIndex, arr) {
        return /^\d{6}$/.test(code) && arr.indexOf(code) === itemIndex
      })
      : []
  }

  function getHoldingCodes() {
    var tabs = readJson(WATCH_TABS_KEY, null)
    if (Array.isArray(tabs)) {
      var holding = tabs.find(function (tab) { return tab && tab.id === 'default' }) || tabs[0]
      return sanitizeCodes(holding && holding.codes)
    }
    return sanitizeCodes(readJson(LEGACY_WATCHLIST_KEY, []))
  }

  function formatPct(value) {
    var number = Number(value)
    if (!Number.isFinite(number)) number = 0
    return (number > 0 ? '+' : '') + number.toFixed(2) + '%'
  }

  function quoteClass(value) {
    var number = Number(value)
    if (number > 0) return 'positive'
    if (number < 0) return 'negative'
    return 'neutral'
  }

  function readSettings() {
    var settings = readJson(SETTINGS_KEY, {})
    var opacity = Number(settings.holdingOpacity)
    if (!Number.isFinite(opacity)) opacity = 100
    return {
      colorMode: settings.holdingColorMode === 'white' ? 'white' : 'market',
      opacity: Math.max(0, Math.min(100, Math.round(opacity))),
    }
  }

  function applySettings() {
    var settings = readSettings()
    shell.classList.toggle('white-mode', settings.colorMode === 'white')
    shell.style.setProperty('--holding-opacity', String(settings.opacity / 100))
  }

  function render() {
    applySettings()
    var codes = getHoldingCodes()
    var cache = readJson(QUOTE_CACHE_KEY, {})

    if (!codes.length) {
      slot.innerHTML = '<div class="quote-empty">暂无持仓股</div>'
      index = 0
      return
    }

    if (index >= codes.length) index = 0
    var code = codes[index]
    var quote = cache && cache[code] ? cache[code] : null
    var pct = quote && typeof quote.changePercent === 'number' ? quote.changePercent : 0
    var cls = quoteClass(pct)
    var name = quote && quote.name ? quote.name : code + '（待刷新）'
    var price = quote && quote.price ? quote.price : '--'

    slot.innerHTML = [
      '<div class="quote-main">',
      '<div class="quote-name">', escapeHtml(name), '</div>',
      '<div class="quote-code">', escapeHtml(code), '</div>',
      '</div>',
      '<div class="quote-price ', cls, '">', escapeHtml(price), '</div>',
      '<div class="quote-change ', cls, '">', escapeHtml(formatPct(pct)), '</div>',
    ].join('')

    index = (index + 1) % codes.length
  }

  function schedule() {
    if (timer) clearInterval(timer)
    timer = setInterval(render, ROTATE_MS)
  }

  function bindControls() {
    document.getElementById('minimize-btn').addEventListener('click', function () {
      if (window.shell && window.shell.minimizeHoldingWindow) window.shell.minimizeHoldingWindow()
    })
    document.getElementById('maximize-btn').addEventListener('click', function () {
      if (window.shell && window.shell.maximizeHoldingWindow) window.shell.maximizeHoldingWindow()
    })
    document.getElementById('close-btn').addEventListener('click', function () {
      if (window.shell && window.shell.closeHoldingWindow) window.shell.closeHoldingWindow()
    })
  }

  window.addEventListener('storage', render)
  bindControls()
  render()
  schedule()

  if (window.shell && window.shell.onHoldingWidgetRefresh) {
    window.shell.onHoldingWidgetRefresh(function () {
      render()
      schedule()
    })
  }
})()
