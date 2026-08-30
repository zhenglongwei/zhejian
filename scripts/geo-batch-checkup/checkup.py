# -*- coding: utf-8 -*-
"""
汽修门店 AI 可见性体检工具（盈简模型 v0.1）
================================================
用法:
  python checkup.py scan  --shops <xlsx路径> --limit 5 --backend so    # 跑体检(360搜索,默认,稳定)
  python checkup.py scan  --shops <xlsx路径> --limit 5 --backend baidu # 百度后端(易触发验证码,慢速用)
  python checkup.py scan  --shops <xlsx路径> --limit 5 --backend bing  # 必应后端(对脚本返回降级结果,慎用)
  python checkup.py scan  --shops <xlsx路径> --limit 5 --backend mock  # 离线演示模式
  python checkup.py report --run-id <id>                                # 生成报告+榜单
  python checkup.py shops  --shops <xlsx路径>                           # 只看门店清单

口径纪律(盈简模型):
  * 10 个固定问题, 不改; 带城市/区域前缀, 模拟真实车主语气
  * 每次全量复测用同样问题、同样后端、同样匹配规则 —— 可比性就是公信力
评分(0-100, 公开发布的规则):
  AI提及率30 / 推荐位次25 / 信息准确度20 / 地基收录15 / 内容资产10
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import os
import random
import re
import sqlite3
import sys
import time

import requests

sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "checkup.db")
REPORT_DIR = os.path.join(BASE_DIR, "reports")

# ---------------------------------------------------------------- 固定问题集
GENERIC_QUESTIONS = [
    "杭州{district}汽修店哪家靠谱",
    "杭州修变速箱哪家店比较好",
    "杭州新能源车维修哪家店好",
    "杭州三电维修哪家店专业",
    "杭州汽车维修哪家店口碑好",
    "杭州事故车维修哪家好 4S店以外",
    "杭州汽车保养哪家店性价比高",
    "杭州{district}修理厂推荐",
    "杭州{district}上门取送车 维修保养",
]
BRAND_QUESTION = '"{shop}" 怎么样'  # 第 10 问: 品牌词(引号精确匹配)

# ---------------------------------------------------------------- 名称处理
SUFFIXES = [
    "汽车服务有限公司", "汽车修理有限公司", "汽车维修有限公司", "汽车服务有限公司",
    "修理有限公司", "维修有限公司", "服务有限公司", "有限公司", "修理厂", "汽修厂",
]
PREFIXES = ["杭州市", "杭州", "浙江"]


def core_name(name: str) -> str:
    """提取门店可识别核心词: 杭州欧漫汽车服务有限公司 -> 欧漫"""
    n = (name or "").strip()
    for p in PREFIXES:
        if n.startswith(p):
            n = n[len(p):]
    changed = True
    while changed:
        changed = False
        for s in SUFFIXES:
            if n.endswith(s) and len(n) > len(s) + 1:
                n = n[: -len(s)]
                changed = True
    return n.strip()


# ---------------------------------------------------------------- 搜索后端
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
    "Accept-Language": "zh-CN,zh;q=0.9",
}


class BingBackend:
    """直接抓必应网页版结果(无需 key)。接入博查/必应官方 API 时替换此类即可。"""
    name = "bing"
    delay = 2.5  # 秒, 对搜索方客气一点

    def search(self, query: str):
        url = "https://cn.bing.com/search"
        try:
            r = requests.get(url, params={"q": query, "mkt": "zh-CN", "count": "10"},
                             headers=HEADERS, timeout=15)
            r.raise_for_status()
        except Exception as e:
            return {"ok": False, "error": str(e), "results": []}
        results = []
        for m in re.finditer(r'<li class="b_algo".*?</li>', r.text, re.S):
            block = m.group(0)
            a = re.search(r'<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
            if not a:
                continue
            href, title = a.group(1), re.sub(r"<[^>]+>", "", a.group(2))
            snip_m = re.search(r'<p[^>]*>(.*?)</p>', block, re.S)
            snippet = re.sub(r"<[^>]+>", "", snip_m.group(1)) if snip_m else ""
            results.append({"url": href, "title": html.unescape(title),
                            "snippet": html.unescape(snippet)[:300]})
        return {"ok": len(results) > 0, "error": "" if results else "no_results",
                "results": results[:10]}


class BaiduBackend:
    """百度网页版搜索。中文 AI(文心等)引用池以百度系为主, 比必应更贴近真实口径。
    注意: 需要先访问首页拿 cookie, 且必须控制频率(建议 >=3s)。"""
    name = "baidu"
    delay = 3.0

    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                           "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"),
            "Accept-Language": "zh-CN,zh;q=0.9",
        })
        self.s.get("https://www.baidu.com/", timeout=15)

    def search(self, query: str):
        try:
            r = self.s.get("https://www.baidu.com/s",
                           params={"wd": query, "rn": "10"}, timeout=15)
            r.raise_for_status()
        except Exception as e:
            return {"ok": False, "error": str(e), "results": []}
        if "百度安全验证" in r.text or "wappass.baidu.com" in r.url:
            return {"ok": False, "error": "captcha", "results": []}
        results = []
        # 结果块按 <div class="result c-container..."> 切分, mu 属性是真实源域名
        parts = re.split(r'(<div[^>]*class="result c-container[^"]*"[^>]*>)', r.text)
        for i in range(1, len(parts) - 1, 2):
            header, body = parts[i], parts[i + 1]
            a = re.search(r'<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', body, re.S)
            if not a:
                continue
            title = html.unescape(re.sub(r"<[^>]+>", "", a.group(2)))
            mu = re.search(r'mu="([^"]+)"', header)
            url = html.unescape(mu.group(1)) if mu else a.group(1)
            snip = ""
            m = re.search(r'<span[^>]*class="[^"]*(?:content-right|c-abstract)[^"]*"'
                          r'[^>]*>(.*?)</span>', body, re.S)
            if m:
                snip = html.unescape(re.sub(r"<[^>]+>", "", m.group(1)))
            results.append({"url": url, "title": title, "snippet": snip.strip()[:300]})
        return {"ok": len(results) > 0, "error": "" if results else "no_results",
                "results": results[:10]}


class MockBackend:
    """离线演示模式: 结果确定可复现(以店名+问题做种子), 用于联调报告链路。"""
    name = "mock"
    delay = 0

    def search(self, query: str):
        seed = int(hashlib.md5(query.encode()).hexdigest()[:8], 16)
        rng = random.Random(seed)
        results = []
        platforms = ["map.baidu.com", "amap.com", "dianping.com", "meituan.com",
                     "zhihu.com", "mp.weixin.qq.com", "toutiao.com", "baijiahao.baidu.com"]
        for i in range(10):
            dom = platforms[rng.randrange(len(platforms))]
            results.append({"url": f"https://{dom}/poi/{seed % 99999}",
                            "title": f"杭州某汽修商家页面-{i}",
                            "snippet": "杭州汽修 保养 维修 服务" * 3})
        return {"ok": True, "error": "", "results": results}


class SoBackend:
    """360搜索(www.so.com)。对脚本访问最宽容, 结果质量好(汽车之家/有驾/虎扑等车主语境)。"""
    name = "so"
    delay = 3.5

    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                           "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"),
            "Accept-Language": "zh-CN,zh;q=0.9",
        })

    def search(self, query: str):
        try:
            r = self.s.get("https://www.so.com/s", params={"q": query}, timeout=15)
            r.raise_for_status()
        except Exception as e:
            return {"ok": False, "error": str(e), "results": []}
        results = []
        blocks = re.split(r'<li[^>]*class="res-list[^"]*"', r.text)[1:]
        for b in blocks:
            a = re.search(r'<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', b, re.S)
            if not a:
                continue
            title = html.unescape(re.sub(r"<[^>]+>", "", a.group(2)))
            mu = re.search(r'data-mdurl="([^"]+)"', b[:2000])
            url = html.unescape(mu.group(1)) if mu else a.group(1)
            snip = ""
            m = re.search(r'<p[^>]*class="[^"]*res-desc[^"]*"[^>]*>(.*?)</p>', b, re.S)
            if m:
                snip = html.unescape(re.sub(r"<[^>]+>", "", m.group(1)))
            results.append({"url": url, "title": title, "snippet": snip.strip()[:300]})
        return {"ok": len(results) > 0, "error": "" if results else "no_results",
                "results": results[:10]}


BACKENDS = {"so": SoBackend, "baidu": BaiduBackend, "bing": BingBackend,
            "mock": MockBackend}


# ---------------------------------------------------------------- 存储
DDL = """
CREATE TABLE IF NOT EXISTS shops(
  id INTEGER PRIMARY KEY, seq INTEGER, name TEXT, core TEXT,
  district TEXT, address TEXT, note TEXT, UNIQUE(name));
CREATE TABLE IF NOT EXISTS runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, backend TEXT,
  n_shops INTEGER, n_queries INTEGER);
CREATE TABLE IF NOT EXISTS query_results(
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER, shop_id INTEGER,
  qtype TEXT, question TEXT, ok INTEGER, error TEXT, payload TEXT);
CREATE TABLE IF NOT EXISTS scores(
  run_id INTEGER, shop_id INTEGER, mention INTEGER, position INTEGER,
  accuracy INTEGER, base INTEGER, content INTEGER, total INTEGER,
  mentioned_queries INTEGER, brand_mentioned INTEGER,
  PRIMARY KEY(run_id, shop_id));
"""


def db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(DDL)
    return conn


def load_shops(conn, xlsx_path):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb.worksheets[0]
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or not row or not row[1]:
            continue
        seq, name, district, address = row[0], str(row[1]).strip(), row[2], row[3]
        note = row[4] if len(row) > 4 else None
        rows.append((seq, name, (district or "").strip(), (address or "").strip(),
                     (note or "").strip() if note else ""))
    conn.executemany(
        "INSERT OR IGNORE INTO shops(seq,name,core,district,address,note) "
        "VALUES(?,?,?,?,?,?)",
        [(s, n, core_name(n), d, a, note) for s, n, d, a, note in rows])
    conn.commit()


# ---------------------------------------------------------------- 扫描
def questions_for(shop):
    d = shop["district"] or "市区"
    qs = []
    for q in GENERIC_QUESTIONS:
        text = q.format(district=d)
        qs.append(("generic", text))
    qs.append(("brand", BRAND_QUESTION.format(shop=shop["name"])))
    return qs


MAP_DOMAINS = ("amap.com", "map.baidu.com", "dianping.com", "meituan.com",
               "meituan.cn", "maps.baidu.com", "lbs.amap.com", "qcc.com")
CONTENT_DOMAINS = ("mp.weixin.qq.com", "zhihu.com", "toutiao.com",
                   "baijiahao.baidu.com", "weibo.com")


def scan(conn, xlsx_path, limit, backend_name):
    load_shops(conn, xlsx_path)
    shops = conn.execute(
        "SELECT * FROM shops ORDER BY seq LIMIT ?", (limit,)).fetchall()
    backend = BACKENDS[backend_name]()
    cur = conn.execute(
        "INSERT INTO runs(ts,backend,n_shops,n_queries) VALUES(?,?,?,?)",
        (dt.datetime.now().isoformat(timespec="seconds"), backend.name, len(shops), 10))
    run_id = cur.lastrowid

    all_cores = [r["core"] for r in conn.execute(
        "SELECT core FROM shops WHERE core<>''").fetchall()]

    fingerprints = []
    for shop in shops:
        for qtype, question in questions_for(shop):
            res = backend.search(question)
            payload = json.dumps(res, ensure_ascii=False)
            conn.execute(
                "INSERT INTO query_results(run_id,shop_id,qtype,question,ok,error,payload) "
                "VALUES(?,?,?,?,?,?,?)",
                (run_id, shop["id"], qtype, question, int(res["ok"]), res["error"], payload))
            conn.commit()
            # 降级检测: 不同问题返回完全相同的一批结果 => 搜索引擎在喂兜底页, 数据不可信
            fp = hashlib.md5("||".join(sorted(
                i["title"] for i in res["results"])).encode()).hexdigest()
            if res["results"]:
                fingerprints.append(fp)
            if backend.delay:
                time.sleep(backend.delay)
        print(f"  [run {run_id}] 完成: {shop['name']}")

    # 降级告警
    if fingerprints:
        most = max(set(fingerprints), key=fingerprints.count)
        dup = fingerprints.count(most)
        if dup > len(fingerprints) * 0.5:
            print(f"  ⚠ 警告: {dup}/{len(fingerprints)} 个问题返回了完全相同的结果集, "
                  f"搜索引擎疑似返回降级兜底页, 本轮数据不可用于对外报告!")
    return run_id


# ---------------------------------------------------------------- 打分
def score_run(conn, run_id):
    shops = conn.execute(
        "SELECT s.* FROM shops s JOIN query_results q ON q.shop_id=s.id "
        "WHERE q.run_id=? GROUP BY s.id", (run_id,)).fetchall()
    for shop in shops:
        rows = conn.execute(
            "SELECT qtype,question,payload FROM query_results "
            "WHERE run_id=? AND shop_id=?", (run_id, shop["id"])).fetchall()
        core = shop["core"]
        mention_hits, positions = [], []
        brand_row, brand_hits = None, []
        for qtype, question, payload in rows:
            data = json.loads(payload)
            for rank, item in enumerate(data.get("results", []), 1):
                blob = item["title"] + " " + item["snippet"]
                if core and core in blob:
                    if qtype == "brand":
                        brand_hits.append((rank, item, blob))
                    else:
                        mention_hits.append((rank, item, blob, question))
                        positions.append(rank)
        # 1) AI 提及率 30 分: 9 个品类问题中被提及比例
        n_generic = sum(1 for r in rows if r[0] == "generic")
        mention = round(30 * len({h[3] for h in mention_hits}) / max(n_generic, 1))
        # 2) 推荐位次 25 分: 平均位次越靠前越高; 未被提及时品牌词命中给 5 分保底
        if positions:
            avg = sum(positions) / len(positions)
            position = round(25 * (11 - avg) / 10)
        elif brand_hits:
            position = 5
        else:
            position = 0
        # 3) 信息准确度 20 分: 品牌词结果里出现区域/地址关键词
        accuracy = 0
        if brand_hits:
            accuracy += 10  # AI 至少"认识"这家店
            blob_all = " ".join(h[2] for h in brand_hits)
            if shop["district"] and shop["district"][:2] in blob_all:
                accuracy += 10
        # 4) 地基收录 15 分: 品牌词结果里地图/点评类平台数量(4个封顶)
        base = 0
        if brand_hits:
            doms = {h[1]["url"].split("/")[2] if "://" in h[1]["url"] else ""
                    for h in brand_hits}
            n_map = sum(1 for d in doms if any(m in d for m in MAP_DOMAINS))
            base = round(15 * min(n_map, 4) / 4)
        # 5) 内容资产 10 分: 全部结果中内容平台出现数量(4个封顶)
        doms_all = set()
        for qtype, question, payload in rows:
            for item in json.loads(payload).get("results", []):
                u = item["url"]
                if "://" in u:
                    doms_all.add(u.split("/")[2])
        n_content = sum(1 for d in doms_all if any(c in d for c in CONTENT_DOMAINS))
        content = round(10 * min(n_content, 4) / 4)
        total = mention + position + accuracy + base + content
        conn.execute(
            "INSERT OR REPLACE INTO scores VALUES(?,?,?,?,?,?,?,?,?,?)",
            (run_id, shop["id"], mention, position, accuracy, base, content, total,
             len({h[3] for h in mention_hits}), int(bool(brand_hits))))
        conn.commit()
        print(f"  评分: {shop['name']} -> {total} (提及{mention} 位次{position} "
              f"准确{accuracy} 地基{base} 内容{content})")


# ---------------------------------------------------------------- 报告
RADAR_DIMS = ["AI提及率", "推荐位次", "信息准确度", "地基收录", "内容资产"]
RADAR_MAX = [30, 25, 20, 15, 10]

REPORT_CSS = """
body{font-family:'Microsoft YaHei',sans-serif;margin:0;background:#f5f7fa;color:#1f2733}
.wrap{max-width:860px;margin:0 auto;padding:24px}
.card{background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:16px;
box-shadow:0 1px 4px rgba(0,0,0,.06)}
h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:0 0 12px}
.muted{color:#6b7486;font-size:13px}
.score-big{font-size:44px;font-weight:700;color:#2b4a8b}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:8px 10px;border-bottom:1px solid #eef1f5;text-align:left}
th{color:#6b7486;font-weight:600}
.tag{display:inline-block;padding:2px 10px;border-radius:10px;font-size:12px;margin:2px}
.t-red{background:#fdecec;color:#c0392b}.t-green{background:#e8f8f0;color:#1c6b4a}
.t-gray{background:#f0f2f5;color:#6b7486}
.evi{background:#f7f8fa;border-left:3px solid #b8ccf5;padding:8px 12px;margin:6px 0;
font-size:13px;border-radius:0 6px 6px 0}
.footer{color:#9aa3b2;font-size:12px;text-align:center;padding:8px}
"""


def radar_svg(values):
    import math
    cx, cy, r = 130, 120, 90
    pts_v, pts_g = [], []
    for i, v in enumerate(values):
        ang = -math.pi / 2 + 2 * math.pi * i / 5
        frac = v / RADAR_MAX[i]
        pts_v.append(f"{cx + r*frac*math.cos(ang):.1f},{cy + r*frac*math.sin(ang):.1f}")
        pts_g.append(f"{cx + r*math.cos(ang):.1f},{cy + r*math.sin(ang):.1f}")
    grid = ""
    for f in (0.25, 0.5, 0.75, 1.0):
        p = " ".join(
            f"{cx + r*f*math.cos(-math.pi/2 + 2*math.pi*i/5):.1f},"
            f"{cy + r*f*math.sin(-math.pi/2 + 2*math.pi*i/5):.1f}" for i in range(5))
        grid += f'<polygon points="{p}" fill="none" stroke="#e3e8f0"/>'
    labels = ""
    for i, name in enumerate(RADAR_DIMS):
        ang = -math.pi / 2 + 2 * math.pi * i / 5
        x = cx + (r + 26) * math.cos(ang)
        y = cy + (r + 26) * math.sin(ang)
        labels += (f'<text x="{x:.0f}" y="{y:.0f}" font-size="12" fill="#6b7486" '
                   f'text-anchor="middle" dominant-baseline="middle">{name}</text>')
    return (f'<svg width="260" height="240" viewBox="0 0 260 240">{grid}'
            f'<polygon points="{" ".join(pts_g)}" fill="none" stroke="#b8ccf5"/>'
            f'<polygon points="{" ".join(pts_v)}" fill="rgba(43,74,139,.25)" '
            f'stroke="#2b4a8b" stroke-width="2"/>{labels}</svg>')


def shop_report(conn, run_id, shop, s):
    rows = conn.execute(
        "SELECT qtype,question,payload FROM query_results "
        "WHERE run_id=? AND shop_id=? ORDER BY id", (run_id, shop["id"])).fetchall()
    core = shop["core"]
    evi_rows, competitor_counts = [], {}
    for qtype, question, payload in rows:
        data = json.loads(payload)
        hits, comps = [], []
        for rank, item in enumerate(data.get("results", []), 1):
            blob = item["title"] + " " + item["snippet"]
            if core and core in blob:
                hits.append((rank, item))
            for c in conn.execute("SELECT name,core FROM shops WHERE core<>''"):
                if c[1] and c[1] in blob and c[1] != core:
                    comps.append((rank, c[0]))
        for _, n in comps:
            competitor_counts[n] = competitor_counts.get(n, 0) + 1
        if qtype == "generic" or hits or comps:
            hit_txt = (f'<span class="tag t-red">本店出现在第{hits[0][0]}位</span>'
                       if hits else '<span class="tag t-gray">本店未出现</span>')
            comp_txt = "".join(f'<span class="tag t-green">{n}</span>'
                               for _, n in comps[:3]) or "—"
            # 无命中时展示榜首结果标题(车主实际看到什么), 而不是无关摘要
            if hits:
                top1 = hits[0][1]["title"]
            elif data.get("results"):
                top1 = "榜首:" + data["results"][0]["title"]
            else:
                top1 = "(无返回)"
            snippet = (hits[0][1]["snippet"] or top1)[:80] if hits else top1[:80]
            evi_rows.append(
                f"<tr><td>{html.escape(question)}</td><td>{hit_txt}</td>"
                f"<td>{comp_txt}</td><td class='muted'>{html.escape(snippet)}</td></tr>")
    top_comps = sorted(competitor_counts.items(), key=lambda x: -x[1])[:5]
    comp_block = "".join(
        f'<div class="evi">竞对 <b>{html.escape(n)}</b> 在 {c}/10 个问题的搜索结果中出现</div>'
        for n, c in top_comps) or '<div class="evi">本轮未检测到同区域竞对上榜</div>'
    dims = [s["mention"], s["position"], s["accuracy"], s["base"], s["content"]]
    path = os.path.join(REPORT_DIR, f"shop_{shop['id']}.html")
    os.makedirs(REPORT_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>AI可见性体检 - {html.escape(shop['name'])}</title>
<style>{REPORT_CSS}</style></head><body><div class="wrap">
<div class="card"><h1>AI 可见性体检报告</h1>
<div class="muted">{html.escape(shop['name'])} · {html.escape(shop['district'])} ·
{html.escape(shop['address'] or '')}</div>
<div class="muted">盈简模型 v0.1 · 10 问固定口径 · 检索层结果</div>
<table style="margin-top:12px"><tr>
<td style="vertical-align:top"><div class="score-big">{s['total']}</div>
<div class="muted">总分 / 100</div></td>
<td>{radar_svg(dims)}</td></tr></table></div>
<div class="card"><h2>五维得分</h2><table>
<tr><th>维度</th><th>满分</th><th>得分</th></tr>
{''.join(f'<tr><td>{d}</td><td>{m}</td><td><b>{v}</b></td></tr>'
         for d, m, v in zip(RADAR_DIMS, RADAR_MAX, dims))}
</table></div>
<div class="card"><h2>竞对动态（最有杀伤力的一页）</h2>{comp_block}</div>
<div class="card"><h2>逐问证据</h2><table>
<tr><th style="width:30%">问题</th><th>本店</th><th>上榜竞对</th><th>摘要</th></tr>
{''.join(evi_rows)}</table></div>
<div class="footer">盈简科技 SimpleWin · 汽修门店 AI 可见性体检（检索层）·
生成层截图（豆包/元宝/DeepSeek App 实测）另附</div></div></body></html>""")
    return path


def summary_report(conn, run_id):
    rows = conn.execute(
        "SELECT s.name,s.district,sc.* FROM scores sc JOIN shops s ON s.id=sc.shop_id "
        "WHERE sc.run_id=? ORDER BY sc.total DESC", (run_id,)).fetchall()
    paths = []
    for r in rows:
        shop = conn.execute("SELECT * FROM shops WHERE id=?", (r["shop_id"],)).fetchone()
        paths.append(shop_report(conn, run_id, shop, r))
    body = "".join(
        f"<tr><td>{i+1}</td><td>{html.escape(r['name'])}</td>"
        f"<td>{html.escape(r['district'] or '')}</td><td><b>{r['total']}</b></td>"
        f"<td>{r['mention']}</td><td>{r['position']}</td><td>{r['accuracy']}</td>"
        f"<td>{r['base']}</td><td>{r['content']}</td>"
        f"<td><a href='shop_{r['shop_id']}.html'>报告</a></td></tr>"
        for i, r in enumerate(rows))
    path = os.path.join(REPORT_DIR, f"summary_{run_id}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>杭州汽修门店 AI 可见性榜 - Run {run_id}</title>
<style>{REPORT_CSS}</style></head><body><div class="wrap">
<div class="card"><h1>杭州汽修门店 AI 可见性榜（本轮体检）</h1>
<div class="muted">盈简模型 v0.1 · {len(rows)} 家门店 · 10 问固定口径 · Run {run_id}</div></div>
<div class="card"><table>
<tr><th>#</th><th>门店</th><th>区域</th><th>总分</th><th>提及/30</th><th>位次/25</th>
<th>准确/20</th><th>地基/15</th><th>内容/10</th><th></th></tr>{body}</table></div>
<div class="footer">盈简科技 SimpleWin · geo.simplewin.cn</div></div></body></html>""")
    return path


# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("scan")
    p1.add_argument("--shops", required=True)
    p1.add_argument("--limit", type=int, default=5)
    p1.add_argument("--backend", choices=["so", "baidu", "bing", "mock"], default="so")
    p2 = sub.add_parser("report")
    p2.add_argument("--run-id", type=int, required=True)
    p3 = sub.add_parser("shops")
    p3.add_argument("--shops", required=True)
    a = ap.parse_args()
    conn = db()
    if a.cmd == "shops":
        load_shops(conn, a.shops)
        for r in conn.execute("SELECT seq,name,core,district FROM shops ORDER BY seq"):
            print(r)
    elif a.cmd == "scan":
        print(f"开始体检: 后端={a.backend} 门店数={a.limit}")
        run_id = scan(conn, a.shops, a.limit, a.backend)
        score_run(conn, run_id)
        print(f"完成, run_id={run_id}")
    elif a.cmd == "report":
        # 补打分: 扫过但还没算分的门店(例如扫描中途被打断)
        missing = conn.execute(
            "SELECT COUNT(*) FROM (SELECT DISTINCT shop_id FROM query_results "
            "WHERE run_id=? AND shop_id NOT IN "
            "(SELECT shop_id FROM scores WHERE run_id=?))", (a.run_id, a.run_id)
        ).fetchone()[0]
        if missing:
            print(f"补打分: {missing} 家门店缺少评分, 重新计算...")
            conn.execute("DELETE FROM scores WHERE run_id=?", (a.run_id,))
            score_run(conn, a.run_id)
        path = summary_report(conn, a.run_id)
        print("报告:", path)


if __name__ == "__main__":
    main()
