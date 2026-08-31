/**
 * 微信群案例转换 · 公开试用页
 *
 * 【重要】本文件里的 parseChat / maskText 是从
 *   backend/src/services/wechat-archive.service.js（parseChat / MASK_RULES）
 * 搬过来的浏览器版本。真源在服务端，改了服务端就要同步这里。
 * 之所以必须有两份：脱敏要在用户自己的机器上先做一遍，原文（含手机号、车牌）
 * 不许出本机——这是这个工具敢写「不保存任何内容」的前提，不能省。
 * backend/scripts/smoke-wechat-archive.js 里有一条断言会比对两边规则是否漂移。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SECTION_NAMES = ['案例概况', '维修前情况', '检查结果', '维修方案', '维修过程', '完工效果', '价格影响因素', '门店说明', '温馨提示'];

  var state = {
    messages: [], stats: null, facts: null, timeline: [],
    doubts: [], missing: [], caseData: null, maskedText: '',
    quota: null, category: 'chassis_noise',
  };

  /**
   * 线上：页面在 simplewin.cn，接口在 geo.simplewin.cn，所以写死跨域地址。
   * 本地：默认走同源——本地预览服务（backend/scripts/serve-archive-local.js）
   * 同时托管页面和接口，写死 3000 端口反而会打空。
   * 想指向别处（比如单独跑着的 backend）：
   *   页面加 ?api=http://127.0.0.1:3000/api/v1/public/wechat-archive
   */
  function endpoint() {
    var params = new URLSearchParams(location.search);
    if (params.get('api')) return params.get('api');
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return '/api/v1/public/wechat-archive';
    }
    return 'https://geo.simplewin.cn/api/v1/public/wechat-archive';
  }

  async function api(path, body, method) {
    var res = await fetch(endpoint() + path, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  /* ================= 解析 / 脱敏（服务端同源逻辑） ================= */

  var MASK_RULES = [
    { name: '身份证', re: /\b\d{17}[\dXx]\b/g, to: '[身份证]' },
    { name: '手机号', re: /\b1[3-9]\d{9}\b/g, to: '[手机号]' },
    { name: '座机', re: /\b0\d{2,3}-?\d{7,8}\b/g, to: '[电话]' },
    { name: '银行卡', re: /\b\d{16,19}\b/g, to: '[银行卡]' },
    { name: '车牌', re: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z](?=[A-HJ-NP-Z0-9]{4,6}\d)[A-HJ-NP-Z0-9]{4,6}[挂学警港澳领]?/g, to: '[车牌]' },
    { name: 'VIN', re: /\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])(?=[A-HJ-NPR-Z0-9]*\d)[A-HJ-NPR-Z0-9]{17}\b/g, to: '[VIN]' },
    { name: '地址', re: /[\u4e00-\u9fa5]{2,10}(?:路|街|道|巷|弄)\d{1,4}号[\u4e00-\u9fa5\d]{0,8}|[\u4e00-\u9fa5]{2,12}(?:小区|花园|家园|公寓|大厦|苑)\d{0,4}(?:栋|幢|座)?\d{0,4}(?:单元|室|层)?/g, to: '[地址]' },
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
   */
  function maskText(raw, senders) {
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
    MASK_RULES.forEach(function (r) {
      text = text.replace(r.re, function () { bump(r.name); return r.to; });
    });
    return { text: text, hits: hits, senderMapping: mapping };
  }

  function renderMessages(messages) {
    return (messages || []).map(function (m) {
      var out = '';
      if (m.sender) out += m.sender + (m.time ? ' ' + m.time : '') + '\n';
      else if (m.time) out += m.time + '\n';
      if (m.text) out += m.text + '\n';
      var i;
      for (i = 0; i < (m.image || 0); i++) out += '[图片]\n';
      for (i = 0; i < (m.voice || 0); i++) out += '[语音]\n';
      for (i = 0; i < (m.video || 0); i++) out += '[视频]\n';
      for (i = 0; i < (m.file || 0); i++) out += '[文件]\n';
      return out.trimEnd();
    }).filter(Boolean).join('\n');
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
    if (!state.quota || !state.quota.limit) return;
    $('quota').textContent = '今天还剩 ' + state.quota.remaining + ' / ' + state.quota.limit + ' 次';
  }

  /* ================= 第一步 ================= */

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

  function stepParse() {
    var raw = $('input').value;
    if (!raw.trim()) { notice('parseMsg', 'warn', '先粘贴一段群聊，或者点「看个例子」。'); return; }
    var parsed = parseChat(raw);
    var masked = maskText(raw, parsed.senders);
    var after = parseChat(masked.text);
    state.messages = after.messages;
    state.stats = after.stats;
    state.maskedText = masked.text;

    var chips = ['<span class="chip">已在本机脱敏</span>'];
    Object.keys(masked.hits).forEach(function (k) {
      chips.push('<span class="chip chip-hit">' + esc(k) + ' ×' + masked.hits[k] + '</span>');
    });
    if (!Object.keys(masked.hits).length) chips.push('<span class="chip">没发现隐私字段</span>');
    $('maskChips').innerHTML = chips.join('');

    var warn = '';
    if (after.stats.voiceCount) {
      warn += '<div class="notice notice-warn"><b>有 ' + after.stats.voiceCount + ' 条语音</b>：粘贴拿不到语音内容，只留下 [语音] 占位。请在手机微信里长按语音 → 转文字 → 把文字补进对应消息，否则这段信息就丢了。</div>';
    }
    if (after.stats.imageCount) {
      warn += '<div class="notice notice-info"><b>有 ' + after.stats.imageCount + ' 张图片</b>：粘贴只留下 [图片] 占位。案例要配图的话，图片得单独导出再手动挂上去。</div>';
    }
    $('parseMsg').innerHTML = warn;

    renderMsgs();
    show('cardStep2', true);
    $('cardStep2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderMsgs() {
    var box = $('msgList');
    if (!state.messages.length) { box.innerHTML = '<div class="empty">解析结果会显示在这里</div>'; return; }
    box.innerHTML = state.messages.map(function (m, i) {
      return '<div class="msg"><div class="msg-head">'
        + '<input value="' + esc(m.sender) + '" data-msg="' + i + '" data-part="sender" placeholder="发言人" />'
        + '<span class="time">' + esc(m.time || '') + '</span>'
        + (m.image ? '<span class="badge badge-img">图片 ×' + m.image + '</span>' : '')
        + (m.voice ? '<span class="badge badge-voice">语音 ×' + m.voice + '</span>' : '')
        + (m.video ? '<span class="badge badge-img">视频 ×' + m.video + '</span>' : '')
        + '<button class="btn btn-ghost msg-del" type="button" data-del="' + i + '">删除</button>'
        + '</div><textarea data-msg="' + i + '" data-part="text" placeholder="消息内容">' + esc(m.text) + '</textarea></div>';
    }).join('');

    box.querySelectorAll('[data-msg]').forEach(function (el) {
      el.addEventListener('input', function () {
        state.messages[Number(el.dataset.msg)][el.dataset.part] = el.value;
      });
    });
    box.querySelectorAll('[data-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.messages.splice(Number(el.dataset.del), 1);
        renderMsgs();
      });
    });
  }

  /* ================= 第三步 ================= */

  async function stepExtract() {
    var btn = $('btnExtract');
    busy(btn, true, '理解中…');
    $('extractMsg').innerHTML = '';
    try {
      var data = await api('/extract', { messages: state.messages, category: state.category });
      state.facts = data.facts;
      state.timeline = data.timeline || [];
      state.doubts = data.doubts || [];
      state.missing = data.missing || [];
      state.maskedText = data.maskedText || state.maskedText;
      renderFacts(data);
      show('cardStep3', true);
      $('cardStep3').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      notice('extractMsg', e.code === 42901 ? 'warn' : 'err', esc(e.message));
    } finally {
      busy(btn, false);
      renderQuota();
    }
  }

  function manualFacts() {
    state.facts = { vehicle: '', odo: '', symptom: '', checkFindings: [], excluded: [], plan: '', planReason: '', process: [], parts: [], finish: '', duration: '', handover: '', amount: '', photoHints: [] };
    state.timeline = []; state.doubts = []; state.missing = [];
    renderFacts({ facts: state.facts, timeline: [], doubts: [], missing: [], confidence: 0, note: '手工填写' });
    show('cardStep3', true);
    $('cardStep3').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var LIST_KEY = { f_checkFindings: 'checkFindings', f_excluded: 'excluded', f_process: 'process', f_parts: 'parts' };

  function renderFacts(data) {
    var f = data.facts || {};
    ['vehicle', 'odo', 'symptom', 'plan', 'planReason', 'finish', 'duration', 'handover', 'amount'].forEach(function (k) {
      $('f_' + k).value = f[k] || '';
    });
    Object.keys(LIST_KEY).forEach(function (id) { renderList(id, f[LIST_KEY[id]]); });

    $('doubtBox').innerHTML = (state.doubts || []).length
      ? state.doubts.map(function (d) {
          return '<div class="doubt"><b>存疑 · ' + esc(d.field) + '</b>：' + esc(d.value) + '　—　' + esc(d.why) + '</div>';
        }).join('')
      : '';
    $('missingLine').textContent = (state.missing || []).length
      ? '群里没提到：' + state.missing.join('、') + '（不硬补，允许留白）'
      : '';
    $('timelineBox').innerHTML = (state.timeline || []).length
      ? state.timeline.map(function (t, i) {
          return '<div class="tl"><span class="who">' + esc(t.who || '') + '</span>'
            + '<input value="' + esc(t.what) + '" data-tl="' + i + '" />'
            + '<button class="btn btn-ghost" type="button" data-tldel="' + i + '" style="font-size:12px;padding:5px 10px;">删</button></div>';
        }).join('')
      : '<div class="muted">过程层为空——这段群聊里没看出明显节点</div>';

    $('timelineBox').querySelectorAll('[data-tl]').forEach(function (el) {
      el.addEventListener('input', function () { state.timeline[Number(el.dataset.tl)].what = el.value; });
    });
    $('timelineBox').querySelectorAll('[data-tldel]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.timeline.splice(Number(el.dataset.tldel), 1);
        renderFacts({ facts: state.facts });
      });
    });
  }

  function renderList(id, arr) {
    var key = LIST_KEY[id];
    var list = arr || [];
    var box = $(id);
    box.innerHTML = list.map(function (v, i) {
      return '<div class="list-row"><input value="' + esc(v) + '" data-list="' + id + '" data-idx="' + i + '" />'
        + '<button class="btn btn-ghost" type="button" data-listdel="' + id + ':' + i + '">删</button></div>';
    }).join('') + '<button class="btn btn-ghost" type="button" data-listadd="' + id + '" style="font-size:12px;padding:5px 11px;">+ 加一条</button>';

    box.querySelectorAll('[data-list]').forEach(function (el) {
      el.addEventListener('input', function () {
        state.facts[key][Number(el.dataset.idx)] = el.value;
      });
    });
    box.querySelectorAll('[data-listdel]').forEach(function (el) {
      el.addEventListener('click', function () {
        var p = el.dataset.listdel.split(':');
        state.facts[LIST_KEY[p[0]]].splice(Number(p[1]), 1);
        renderList(p[0], state.facts[LIST_KEY[p[0]]]);
      });
    });
    box.querySelectorAll('[data-listadd]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id2 = el.dataset.listadd;
        state.facts[LIST_KEY[id2]].push('');
        renderList(id2, state.facts[LIST_KEY[id2]]);
      });
    });
  }

  function collectFacts() {
    var f = state.facts;
    if (!f) return null;
    return {
      vehicle: $('f_vehicle').value.trim(), odo: $('f_odo').value.trim(),
      symptom: $('f_symptom').value.trim(), plan: $('f_plan').value.trim(),
      planReason: $('f_planReason').value.trim(), finish: $('f_finish').value.trim(),
      duration: $('f_duration').value.trim(), handover: $('f_handover').value.trim(),
      amount: $('f_amount').value.trim(),
      checkFindings: f.checkFindings || [], excluded: f.excluded || [],
      process: f.process || [], parts: f.parts || [], photoHints: f.photoHints || [],
    };
  }

  /* ================= 第四步 ================= */

  async function stepCompose() {
    var facts = collectFacts();
    if (!facts) return;
    var btn = $('btnCompose');
    busy(btn, true, '生成中…');
    $('composeMsg').innerHTML = '';
    try {
      var data = await api('/compose', {
        facts: facts,
        city: $('f_city').value.trim() || '杭州',
        category: state.category,
      });
      state.caseData = data;
      renderCase(data);
      show('cardStep4', true);
      show('cardCta', true);
      $('cardStep4').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      notice('composeMsg', e.code === 42901 ? 'warn' : 'err', esc(e.message));
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
    L.push('> ' + (c.sourceLabel || '门店发布 · 已脱敏 · 已审核'), '');
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
    L.push('---', '', '**留档信息（不公开）**', '');
    L.push('- 车型：' + $('f_vehicle').value + ($('f_odo').value ? '　里程：' + $('f_odo').value : ''));
    if ($('f_amount').value) L.push('- 本单金额（仅供留档，禁止公开）：' + $('f_amount').value);
    if ((state.doubts || []).length) {
      L.push('- 存疑项（发布前必须确认）：');
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

  function clearAll() {
    $('input').value = '';
    state.messages = []; state.facts = null; state.caseData = null;
    state.timeline = []; state.doubts = []; state.missing = [];
    ['cardStep2', 'cardStep3', 'cardStep4', 'cardCta'].forEach(function (id) { show(id, false); });
    $('parseMsg').innerHTML = ''; $('extractMsg').innerHTML = ''; $('composeMsg').innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ================= 启动 ================= */

  $('btnParse').addEventListener('click', stepParse);
  $('btnSample').addEventListener('click', function () { $('input').value = SAMPLE; stepParse(); });
  $('btnClear').addEventListener('click', clearAll);
  $('btnExtract').addEventListener('click', stepExtract);
  $('btnManual').addEventListener('click', manualFacts);
  $('btnCompose').addEventListener('click', stepCompose);
  $('btnCopy').addEventListener('click', copyAll);
  $('btnDownload').addEventListener('click', downloadAll);

  api('/status', null, 'GET').then(function (s) {
    state.quota = s;
    $('maxChars').textContent = s.maxChars || 20000;
    renderQuota();
    if (!s.enabled || !s.ready) {
      notice('parseMsg', 'err', '公开试用暂时关闭了（' + (s.remaining <= 0 ? '今天名额用完，明天再来' : '服务未就绪') + '）。想不限次使用，请 <a href="mailto:business@simplewin.cn">联系我们</a>。');
      // 光提示不够——按钮还亮着，用户点到底只会撞见一句报错。
      // 名额用完或服务没起来时，直接把入口按掉。
      ['btnParse', 'btnSample', 'btnExtract', 'btnCompose'].forEach(function (id) {
        if ($(id)) $(id).disabled = true;
      });
    }
  }).catch(function () {
    notice('parseMsg', 'err', '连不上服务，请稍后再试。');
  });
})();
