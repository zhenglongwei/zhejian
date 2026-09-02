/**
 * 微信群案例转换 · 公开页（2026-09-02 改版：一步生成）
 *
 * 流程：粘贴（框内直接改原文 / 补打码词）→ 生成案例 → 直接改案例。
 * 不再展示中间的事实层表单——但脱敏这一步没有省：
 *
 * 【重要】本文件里的 parseChat / maskText / MASK_RULES 是从
 *   backend/src/services/wechat-archive.service.js（parseChat / maskChatText / MASK_RULES）
 *   搬过来的浏览器版本。真源在服务端，改了服务端就要同步这里。
 *   之所以必须有两份：打码要在用户自己的机器上先做一遍，原文（含手机号、车牌）
 *   不许出本机——这是这个工具敢写「不保存任何内容」的前提，不能省。
 *   backend/scripts/smoke-wechat-archive.js 里有一条断言会比对两边规则是否漂移。
 *
 * 配额按账户等级（2026-09-02 老板定）：游客每天 1 次，手机号登录后每天 3 次。
 * 登录走 /api/v1/public/web-auth（验证码登录即注册，复用辙见账号体系），
 * 登录态（token + 脱敏手机号）和草稿箱都存 localStorage，只在本机浏览器里。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var DRAFTS_KEY = 'archiveDraftsV1';
  var SESSION_KEY = 'archiveSessionV1';

  var state = {
    quota: null,
    category: 'chassis_noise',
    caseData: null,
    facts: null,
    doubts: [],
    missing: [],
    maskedText: '',
  };

  /* ================= 接口与登录态 ================= */

  function loadSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return s && s.token ? s : null;
    } catch (e) { return null; }
  }
  function saveSession(s) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* 隐私模式就算了 */ }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 同上 */ }
  }
  var session = loadSession();

  /**
   * 线上：页面在 simplewin.cn，接口在 geo.simplewin.cn，所以写死跨域地址。
   * 本地：默认走同源——本地预览服务（backend/scripts/serve-archive-local.js）
   * 同时托管页面和接口，写死 3000 端口反而会打空。
   * 想指向别处：页面加 ?api=...（调试用，访客看不到）。
   */
  function endpoint() {
    var params = new URLSearchParams(location.search);
    if (params.get('api')) return params.get('api');
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return '/api/v1/public/wechat-archive';
    }
    return 'https://geo.simplewin.cn/api/v1/public/wechat-archive';
  }

  /** 登录接口跟归档接口同一个 base，只是路径不同 */
  function authEndpoint(path) {
    return endpoint().replace(/\/wechat-archive$/, '') + path;
  }

  async function api(path, body, method) {
    var headers = { 'Content-Type': 'application/json' };
    if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token;
    var res = await fetch(endpoint() + path, {
      method: method || 'POST',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    var json = await res.json().catch(function () {
      return { code: -1, message: '连不上服务，请稍后再试' };
    });
    if (json.code !== 0) {
      var err = new Error(json.message || ('HTTP ' + res.status));
      err.code = json.code;
      throw err;
    }
    if (json.data && json.data.quota) state.quota = json.data.quota;
    return json.data;
  }

  /** 登录相关接口（不带归档路径，也无需登录态） */
  async function authApi(path, body) {
    var res = await fetch(authEndpoint(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var json = await res.json().catch(function () {
      return { code: -1, message: '连不上服务，请稍后再试' };
    });
    if (json.code !== 0) {
      var err = new Error(json.message || ('HTTP ' + res.status));
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  /* ================= 登录 UI ================= */

  var codeTimer = null;

  function startCountdown(sec) {
    stopCountdown();
    var btn = $('btnSendCode');
    var left = sec || 60;
    btn.disabled = true;
    btn.textContent = left + ' 秒后重发';
    codeTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) { stopCountdown(); return; }
      btn.textContent = left + ' 秒后重发';
    }, 1000);
  }
  function stopCountdown() {
    if (codeTimer) { clearInterval(codeTimer); codeTimer = null; }
    var btn = $('btnSendCode');
    if (btn) { btn.disabled = false; btn.textContent = '获取验证码'; }
  }

  function renderAuth() {
    if (session) {
      show('loginForm', false);
      show('loggedInBar', true);
      $('whoami').textContent = session.phoneDisplay || '已登录';
    } else {
      show('loginForm', true);
      show('loggedInBar', false);
    }
  }

  async function sendCode() {
    var phone = $('loginPhone').value.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { notice('loginMsg', 'warn', '手机号先填对（11 位）。'); return; }
    var btn = $('btnSendCode');
    busy(btn, true, '发送中…');
    try {
      var r = await authApi('/web-auth/send-code', { phone: phone });
      notice('loginMsg', 'ok', '验证码已发送，5 分钟内有效。');
      startCountdown(r.resendAfterSec || 60);
    } catch (e) {
      notice('loginMsg', 'err', esc(e.message));
      busy(btn, false);
    }
  }

  async function doLogin() {
    var phone = $('loginPhone').value.trim();
    var code = $('loginCode').value.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { notice('loginMsg', 'warn', '手机号先填对（11 位）。'); return; }
    if (!/^\d{6}$/.test(code)) { notice('loginMsg', 'warn', '验证码是 6 位数字。'); return; }
    var btn = $('btnLogin');
    busy(btn, true, '登录中…');
    try {
      var data = await authApi('/web-auth/login', { phone: phone, code: code });
      session = { token: data.token, phoneDisplay: data.phoneDisplay || '' };
      saveSession(session);
      stopCountdown();
      notice('loginMsg', 'ok', '登录成功' + (data.isNewUser ? '，账号已注册。' : '。'));
      await refreshStatus();
    } catch (e) {
      notice('loginMsg', 'err', esc(e.message));
    } finally {
      busy(btn, false);
    }
  }

  async function doLogout() {
    session = null;
    clearSession();
    notice('loginMsg', 'ok', '已退出，按游客次数算。');
    await refreshStatus();
  }

  /* ================= 解析 / 脱敏（服务端同源逻辑） ================= */

  var MASK_RULES = [
    { name: '身份证', re: /\b\d{17}[\dXx]\b/g, to: '[身份证]' },
    { name: '手机号', re: /\b1[3-9]\d{9}\b/g, to: '[手机号]' },
    { name: '座机', re: /\b0\d{2,3}-?\d{7,8}\b/g, to: '[电话]' },
    { name: '银行卡', re: /\b\d{16,19}\b/g, to: '[银行卡]' },
    { name: '车牌', re: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z](?=[A-HJ-NP-Z0-9]{4,6}\d)[A-HJ-NP-Z0-9]{4,6}[挂学警港澳领]?/g, to: '[车牌]' },
    { name: 'VIN', re: /\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])(?=[A-HJ-NPR-Z0-9]*\d)[A-HJ-NPR-Z0-9]{17}\b/g, to: '[VIN]' },
    { name: '发动机号', re: /\b(?=[A-HJ-NPR-Z0-9]{7,9}\b)(?=(?:[A-Z]*\d){2})(?=[A-Z0-9]*[A-Z])[A-HJ-NPR-Z0-9]{7,9}\b/g, to: '[发动机号]' },
    { name: '地址', re: /[\u4e00-\u9fa5]{2,10}(?:路|街|道|巷|弄)\d{1,4}号[\u4e00-\u9fa5\d]{0,8}|[\u4e00-\u9fa5]{2,12}(?:小区|花园|家园|公寓|大厦|苑)\d{0,4}(?:栋|幢|座)?\d{0,4}(?:单元|室|层)?|\d{1,3}栋\d{0,2}单元\d{0,4}(?:室|号)?|[\u4e00-\u9fa5]{2,8}(?:村|组)\d{0,3}号/g, to: '[地址]' },
    { name: '称呼', re: /[\u4e00-\u9fa5]{1,2}(?:师傅|老板|总|哥|姐|先生|女士|小姐|阿姨|大叔|经理|店长)/g, to: '[称呼]' },
  ];

  var PLACEHOLDER_RE = /^\[(图片|照片|视频|小视频|语音|动画表情|表情|文件|链接|聊天记录|位置|名片)\]$/;
  var NOISE_LINE_RE = /^(以下(为|是)?(聊天记录|新消息|历史消息)|以上(为|是)?(聊天记录|是新消息|为历史消息)|-{2,}|—{2,}|聊天记录截图|\[聊天记录\])/;
  var TIME_ONLY_RE = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}:\d{2}(?::\d{2})?|昨天\s?\d{1,2}:\d{2}|前天\s?\d{1,2}:\d{2}|星期[一二三四五六日天]\s?\d{1,2}:\d{2})$/;
  var SENDER_THEN_TIME_RE = /^(.{1,20}?)[\s\u00A0]+((?:\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s?)?\d{1,2}:\d{2}(?::\d{2})?)$/;
  var TIME_THEN_SENDER_RE = /^((?:\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s?)?\d{1,2}:\d{2}(?::\d{2})?|昨天\s?\d{1,2}:\d{2}|前天\s?\d{1,2}:\d{2})[\s\u00A0]+(.{1,20})$/;

  function parseChat(raw) {
    var lines = String(raw || '').split(/\r?\n/).map(function (l) { return l.replace(/\u00A0/g, ' ').trimEnd(); });
    var messages = [], cur = null, pendingTime = '';
    function flush() { if (cur && (cur.text || cur.image || cur.voice || cur.video || cur.file)) messages.push(cur); cur = null; }
    function ensure() { if (!cur) cur = { sender: '', time: pendingTime || '', text: '', image: 0, voice: 0, video: 0, file: 0 }; return cur; }
    function isSender(l) { return l.length > 0 && l.length <= 20 && !/[。！？；，,.?!;]/.test(l) && !/^[\d[\]]/.test(l); }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || NOISE_LINE_RE.test(line)) continue;
      var ph = line.match(PLACEHOLDER_RE);
      if (ph) {
        var m = ensure();
        if (ph[1] === '图片' || ph[1] === '照片') m.image++;
        else if (ph[1] === '语音') m.voice++;
        else if (ph[1] === '视频' || ph[1] === '小视频') m.video++;
        else if (ph[1] === '文件') m.file++;
        else m.text += (m.text ? '\n' : '') + line;
        continue;
      }
      if (TIME_ONLY_RE.test(line)) { pendingTime = line; flush(); continue; }
      var m2 = line.match(SENDER_THEN_TIME_RE);
      if (m2 && m2[1].trim()) { flush(); pendingTime = m2[2]; ensure().sender = m2[1].trim(); continue; }
      m2 = line.match(TIME_THEN_SENDER_RE);
      if (m2 && m2[2].trim()) { flush(); pendingTime = m2[1]; ensure().sender = m2[2].trim(); continue; }
      m2 = line.match(/^(.{1,20}?)\s?[：:]\s?(.*)$/);
      if (m2 && m2[1].trim() && isSender(m2[1].trim())) {
        flush(); ensure().sender = m2[1].trim();
        if (m2[2].trim()) ensure().text = m2[2].trim();
        continue;
      }
      if (!cur || (cur.text && isSender(line))) { flush(); ensure().sender = line; continue; }
      if (cur && !cur.sender && !cur.text && isSender(line)) { cur.sender = line; continue; }
      var msg = ensure();
      msg.text += (msg.text ? '\n' : '') + line;
    }
    flush();
    var senders = messages.map(function (m) { return m.sender; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    return {
      messages: messages,
      senders: senders,
      stats: {
        messageCount: messages.length,
        senderCount: senders.length,
        imageCount: messages.reduce(function (a, m) { return a + m.image; }, 0),
        voiceCount: messages.reduce(function (a, m) { return a + m.voice; }, 0),
        videoCount: messages.reduce(function (a, m) { return a + m.video; }, 0),
      },
    };
  }

  /**
   * 昵称换成「发言人A/B/C」而不是直接抹掉：模型要靠同一个发言人前后说了什么
   * 来推断谁是技师、谁是车主。全抹成 [称呼] 就把对话结构毁了。
   * extraWords：用户手动补充的打码词（逗号分隔），在本机一并替换掉。
   */
  function maskText(raw, senders, extraWords) {
    var text = String(raw || ''), hits = {}, mapping = {};
    function bump(n) { hits[n] = (hits[n] || 0) + 1; }
    (senders || []).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; })
      .sort(function (a, b) { return b.length - a.length; })
      .forEach(function (sender, i) {
        var label = '发言人' + String.fromCharCode(65 + i);
        mapping[sender] = label;
        var re = new RegExp(sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        text = text.replace(re, function () { bump('发言人'); return label; });
      });
    (extraWords || []).filter(Boolean).forEach(function (word) {
      var re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      text = text.replace(re, function () { bump('手动打码'); return '[手动打码]'; });
    });
    MASK_RULES.forEach(function (r) {
      text = text.replace(r.re, function () { bump(r.name); return r.to; });
    });
    return { text: text, hits: hits, senderMapping: mapping };
  }

  function manualWords() {
    return $('manualMask').value.split(/[,，、\s]+/).map(function (w) { return w.trim(); }).filter(Boolean);
  }

  /* ================= 渲染小工具 ================= */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function show(id, on) { $(id).classList[on ? 'remove' : 'add']('hidden'); }
  function notice(id, kind, html) {
    $(id).innerHTML = '<div class="notice notice-' + kind + '">' + html + '</div>';
  }
  function busy(btn, on, text) {
    btn.disabled = on;
    if (on) { btn.dataset.text = btn.textContent; btn.textContent = text; }
    else if (btn.dataset.text) btn.textContent = btn.dataset.text;
  }
  function renderQuota() {
    if (!state.quota) return;
    var el = $('quota');
    if (state.quota.identity === 'unlimited') { el.textContent = '不限次'; return; }
    if (state.quota.limit == null) return;
    el.textContent = (state.quota.identity === 'guest' ? '游客 · ' : '')
      + '今天还剩 ' + state.quota.remaining + ' / ' + state.quota.limit + ' 次';
  }

  /* ================= 第一步：粘贴 + 打码预览 ================= */

  var SAMPLE = [
    '张师傅', '李哥，你那个浙A12345的途观过减速带响的问题，今天举起来看了', '[图片]', '[图片]',
    '张师傅', '右边的小吊杆球头松了，胶套也裂了',
    '李老板', '严重吗？要不要紧',
    '张师傅', '暂时不影响安全，但是过坑会响，时间长了会磨摆臂',
    '李老板', '那要换什么',
    '张师傅', '两个方案：单换小吊杆，一百多一根；换摆臂总成连胶套一起，六百多',
    '张师傅', '你这个摆臂还能用，建议先换小吊杆',
    '李老板', '行，那就换小吊杆，两边都换。我电话13812345678', '[语音]',
    '张师傅', '好，两边都换，顺便把定位做了', '[图片]',
    '张师傅', '旧的拆下来了，你看这胶套裂的', '[图片]',
    '张师傅', '新的装好了，力矩打到标准', '[图片]',
    '张师傅', '路试了一下，过减速带不响了',
    '李老板', '好的，一共多少',
    '张师傅', '小吊杆两根加四轮定位，一共八百六',
  ].join('\n');

  var previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 300);
  }

  function renderPreview() {
    var raw = $('input').value;
    if (!raw.trim()) { $('maskChips').innerHTML = ''; return; }
    var parsed = parseChat(raw);
    var masked = maskText(raw, parsed.senders, manualWords());
    state.maskedText = masked.text;

    var chips = ['<span class="chip">已在本机打码</span>'];
    Object.keys(masked.hits).forEach(function (k) {
      chips.push('<span class="chip chip-hit">' + esc(k) + ' ×' + masked.hits[k] + '</span>');
    });
    if (!Object.keys(masked.hits).length) chips.push('<span class="chip">没发现隐私字段</span>');
    if (parsed.stats.voiceCount) chips.push('<span class="chip">语音 ×' + parsed.stats.voiceCount + '（内容拿不到）</span>');
    $('maskChips').innerHTML = chips.join('');
  }

  /* ================= 生成案例（一步） ================= */

  async function stepGenerate() {
    var raw = $('input').value;
    if (!raw.trim()) { notice('generateMsg', 'warn', '先粘贴一段群聊，或者点「看个例子」。'); return; }
    var parsed = parseChat(raw);
    var masked = maskText(raw, parsed.senders, manualWords());
    state.maskedText = masked.text;

    var btn = $('btnGenerate');
    busy(btn, true, '生成中…（两次大模型调用，约半分钟）');
    $('generateMsg').innerHTML = '';
    try {
      var data = await api('/generate', {
        text: masked.text,
        city: $('f_city').value.trim() || '杭州',
        category: state.category,
      });
      state.caseData = data;
      state.facts = data.facts || null;
      state.doubts = data.doubts || [];
      state.missing = data.missing || [];
      renderCase(data);
      show('cardResult', true);
      show('cardCta', true);
      $('cardResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      notice('generateMsg', e.code === 42901 ? 'warn' : 'err', esc(e.message));
    } finally {
      busy(btn, false);
      renderQuota();
    }
  }

  function renderCase(data) {
    $('c_title').value = data.title || '';
    $('c_summary').value = data.summary || '';
    $('c_aiAbstract').value = data.aiAbstract || '';
    $('sectionsBox').innerHTML = (data.sections || []).map(function (s, i) {
      return '<div class="sect"><div class="name">' + esc(s.name)
        + (s.text ? '' : '　<span style="color:var(--warn);font-weight:400;">（群里没提到，待补或留空）</span>')
        + '</div><textarea data-sect="' + i + '" placeholder="' + (s.text ? '' : '这段留空就不会生成，可以手动补') + '">' + esc(s.text) + '</textarea></div>';
    }).join('');
    $('sectionsBox').querySelectorAll('[data-sect]').forEach(function (el) {
      el.addEventListener('input', function () { state.caseData.sections[Number(el.dataset.sect)].text = el.value; });
    });
    renderPairs('captionsBox', 'captions', data.captions, '节点', '图说，例：右前小吊杆球头 松旷');
    renderPairs('faqBox', 'faq', data.faq, '问', '答');

    $('riskBox').innerHTML = (data.risk || []).length
      ? data.risk.map(function (r) {
          return '<div class="risk">⚠ <b>' + esc(r.field) + '</b> 命中「' + esc(r.type) + '」：' + esc(r.sample) + '　—　发布前请人工改掉。</div>';
        }).join('') + '<div class="notice notice-ok">其余段落未命中隐私与金额检查。</div>'
      : '<div class="notice notice-ok">检查通过：未发现手机号、车牌、身份证、金额。</div>';

    // 存疑 + 留白：折叠轻提示，只有作者自己会点开，不进导出正文
    var doubtHtml = '';
    (state.doubts || []).forEach(function (d) {
      doubtHtml += '<div class="doubt"><b>存疑 · ' + esc(d.field) + '</b>：' + esc(d.value) + '　—　' + esc(d.why) + '</div>';
    });
    var miss = (state.missing || []).filter(Boolean);
    if (miss.length) {
      doubtHtml += '<div class="notice notice-info">群里没提到：' + esc(miss.slice(0, 8).join('、'))
        + (miss.length > 8 ? ' 等 ' + miss.length + ' 项' : '') + '（对应段落已留白，不硬补）</div>';
    }
    $('doubtBox').innerHTML = doubtHtml || '<div class="notice notice-ok">没有存疑项。</div>';
    $('doubtDetails').open = (state.doubts || []).length > 0;
  }

  function renderPairs(boxId, key, arr, labelA, labelB) {
    var isFaq = key === 'faq';
    var box = $(boxId);
    box.innerHTML = (arr || []).map(function (item, i) {
      var a = isFaq ? item.q : item.node;
      var b = isFaq ? item.a : item.text;
      return '<div class="list-row">'
        + '<input value="' + esc(a) + '" data-pair="' + key + ':' + i + ':a" placeholder="' + esc(labelA) + '" style="max-width:180px;flex:none;" />'
        + '<input value="' + esc(b) + '" data-pair="' + key + ':' + i + ':b" placeholder="' + esc(labelB) + '" />'
        + '<button class="btn btn-ghost" type="button" data-pairdel="' + key + ':' + i + '">删</button></div>';
    }).join('') + '<button class="btn btn-ghost" type="button" data-pairadd="' + key + '" style="font-size:12px;padding:5px 11px;">+ 加一条</button>';

    box.querySelectorAll('[data-pair]').forEach(function (el) {
      el.addEventListener('input', function () {
        var p = el.dataset.pair.split(':');
        var item = state.caseData[p[0]][Number(p[1])];
        if (p[0] === 'faq') { if (p[2] === 'a') item.q = el.value; else item.a = el.value; }
        else { if (p[2] === 'a') item.node = el.value; else item.text = el.value; }
      });
    });
    box.querySelectorAll('[data-pairdel]').forEach(function (el) {
      el.addEventListener('click', function () {
        var p = el.dataset.pairdel.split(':');
        state.caseData[p[0]].splice(Number(p[1]), 1);
        renderPairs(boxId, p[0], state.caseData[p[0]], labelA, labelB);
      });
    });
    box.querySelectorAll('[data-pairadd]').forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.dataset.pairadd;
        state.caseData[k].push(k === 'faq' ? { q: '', a: '' } : { node: '', text: '' });
        renderPairs(boxId, k, state.caseData[k], labelA, labelB);
      });
    });
  }

  /* ================= 导出 ================= */

  function syncFromUI() {
    if (!state.caseData) return;
    state.caseData.title = $('c_title').value;
    state.caseData.summary = $('c_summary').value;
    state.caseData.aiAbstract = $('c_aiAbstract').value;
  }

  function toMarkdown() {
    syncFromUI();
    var c = state.caseData;
    if (!c) return '';
    var L = [];
    L.push('# ' + c.title, '');
    L.push('> ' + (c.sourceLabel || '微信群沟通记录转化 · 已自动脱敏'), '');
    L.push('**摘要**：' + c.summary, '');
    (c.sections || []).forEach(function (s) {
      if (!s.text) return;
      L.push('## ' + s.name, '', s.text, '');
    });
    if ((c.captions || []).length) {
      L.push('## 图片说明', '');
      c.captions.forEach(function (x) { L.push('- ' + (x.node ? x.node + '：' : '') + x.text); });
      L.push('');
    }
    if ((c.faq || []).length) {
      L.push('## 本单问答', '');
      c.faq.forEach(function (x) { L.push('**Q：' + x.q + '**', '', 'A：' + x.a, ''); });
    }
    if (c.aiAbstract) L.push('## AI 可引用摘要', '', c.aiAbstract, '');
    var f = state.facts || {};
    L.push('---', '', '**留档信息（不公开）**', '');
    L.push('- 车型：' + (f.vehicle || '（未识别）') + (f.odo ? '　里程：' + f.odo : ''));
    if (f.amount) L.push('- 本单金额（仅供留档，禁止公开）：' + f.amount);
    if ((state.doubts || []).length) {
      L.push('- 存疑项（发布前建议确认）：');
      state.doubts.forEach(function (d) { L.push('  - ' + d.field + '：' + d.value + '（' + d.why + '）'); });
    }
    return L.join('\n');
  }

  function copyAll() {
    var md = toMarkdown();
    if (!md) return;
    navigator.clipboard.writeText(md).then(function () {
      notice('copyMsg', 'ok', '已复制全文。我们这边不留底，请自己存好。');
    }).catch(function () {
      notice('copyMsg', 'err', '复制失败，请手动选中复制。');
    });
  }

  function downloadAll() {
    var md = toMarkdown();
    if (!md) return;
    var name = (($('c_title').value || '案例').replace(/[\\/:*?"<>|]/g, '') + '.md');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    notice('copyMsg', 'ok', '已下载 ' + esc(name));
  }

  /* ================= 草稿箱（localStorage，只在本机） ================= */

  function loadDrafts() {
    try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]') || []; }
    catch (e) { return []; }
  }
  function storeDrafts(list) {
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, 10))); } catch (e) { /* 存不进就算了 */ }
  }

  function renderDrafts() {
    var list = loadDrafts();
    var box = $('draftList');
    if (!list.length) { box.innerHTML = '<div class="muted" style="font-size:13px;">还没有草稿。生成案例后点「存草稿」，只存在这台浏览器里。</div>'; return; }
    box.innerHTML = list.map(function (d) {
      return '<div class="draft-item">'
        + '<span class="t">' + esc(d.title || '未命名') + '</span>'
        + '<span class="time">' + esc(d.savedAt || '') + '</span>'
        + '<button class="btn btn-ghost" type="button" data-draft-open="' + d.id + '" style="font-size:12px;padding:5px 10px;">打开</button>'
        + '<button class="btn btn-ghost" type="button" data-draft-del="' + d.id + '" style="font-size:12px;padding:5px 10px;">删</button>'
        + '</div>';
    }).join('');
    box.querySelectorAll('[data-draft-open]').forEach(function (el) {
      el.addEventListener('click', function () { openDraft(el.dataset.draftOpen); });
    });
    box.querySelectorAll('[data-draft-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        storeDrafts(loadDrafts().filter(function (d) { return String(d.id) !== el.dataset.draftDel; }));
        renderDrafts();
      });
    });
  }

  function saveDraft() {
    syncFromUI();
    if (!state.caseData) return;
    var now = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var savedAt = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var list = loadDrafts().filter(function (d) { return d.savedAt !== savedAt || d.title !== state.caseData.title; });
    list.unshift({
      id: Date.now(),
      savedAt: savedAt,
      title: state.caseData.title || '未命名',
      input: $('input').value,
      manualMask: $('manualMask').value,
      city: $('f_city').value,
      caseData: state.caseData,
      facts: state.facts,
      doubts: state.doubts,
      missing: state.missing,
    });
    storeDrafts(list);
    renderDrafts();
    notice('copyMsg', 'ok', '已存草稿（只在这台浏览器里，换电脑/清缓存就没了）。');
  }

  function openDraft(id) {
    var d = loadDrafts().filter(function (x) { return String(x.id) === String(id); })[0];
    if (!d) return;
    $('input').value = d.input || '';
    $('manualMask').value = d.manualMask || '';
    if (d.city) $('f_city').value = d.city;
    state.caseData = d.caseData;
    state.facts = d.facts || null;
    state.doubts = d.doubts || [];
    state.missing = d.missing || [];
    if (state.caseData) {
      renderCase(state.caseData);
      show('cardResult', true);
      show('cardCta', true);
      $('cardResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    renderPreview();
  }

  /* ================= 状态与启动 ================= */

  function applyStatus(s) {
    state.quota = s;
    if (session && s.identity === 'guest') {
      // 存过登录态但服务端认不出来了（token 过期/被顶掉）——清掉，界面回到游客口径
      session = null;
      clearSession();
      notice('loginMsg', 'warn', '登录已失效，重新登录一下。');
    }
    renderAuth();
    renderQuota();
  }

  function refreshStatus() {
    return api('/status', null, 'GET').then(function (s) {
      applyStatus(s);
      $('maxChars').textContent = s.maxChars || 20000;
      if (!s.enabled || !s.ready) {
        notice('generateMsg', 'err', '公开试用暂时关闭了（' + ((s.remaining != null && s.remaining <= 0) ? '今天名额用完，明天再来' : '服务未就绪') + '）。想多用的，登录后每天 3 次；想不限次，请 <a href="mailto:business@simplewin.cn">联系我们</a>。');
        // 光提示不够——按钮还亮着，用户点到底只会撞见一句报错。
        // 名额用完或服务没起来时，直接把入口按掉。
        ['btnGenerate', 'btnSample'].forEach(function (id) {
          if ($(id)) $(id).disabled = true;
        });
      }
    }).catch(function () {
      notice('generateMsg', 'err', '连不上服务，请稍后再试。');
    });
  }

  function clearAll() {
    $('input').value = '';
    $('manualMask').value = '';
    state.caseData = null; state.facts = null;
    state.doubts = []; state.missing = [];
    ['cardResult', 'cardCta'].forEach(function (id) { show(id, false); });
    $('maskChips').innerHTML = '';
    $('generateMsg').innerHTML = ''; $('copyMsg').innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('btnGenerate').addEventListener('click', stepGenerate);
  $('btnSample').addEventListener('click', function () { $('input').value = SAMPLE; renderPreview(); });
  $('btnClear').addEventListener('click', clearAll);
  $('btnCopy').addEventListener('click', copyAll);
  $('btnDownload').addEventListener('click', downloadAll);
  $('btnSaveDraft').addEventListener('click', saveDraft);
  $('btnSendCode').addEventListener('click', sendCode);
  $('btnLogin').addEventListener('click', doLogin);
  $('btnLogout').addEventListener('click', doLogout);
  $('input').addEventListener('input', schedulePreview);
  $('manualMask').addEventListener('input', schedulePreview);

  renderDrafts();
  renderAuth();
  refreshStatus();
})();
