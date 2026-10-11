import { useState, type ReactNode } from "react";

type IconName =
  | "home"
  | "album"
  | "spark"
  | "store"
  | "bell"
  | "plus"
  | "car"
  | "scan"
  | "arrow"
  | "clock"
  | "check"
  | "chevron"
  | "back"
  | "camera"
  | "file"
  | "share"
  | "shield"
  | "edit"
  | "phone"
  | "location";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    album: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m5 18 5-5 3 3 2-2 4 4" /></>,
    spark: <><path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8L12 3Z" /><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7L5 15ZM19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6L19 3Z" /></>,
    store: <><path d="M4 10v10h16V10M3 10l2-6h14l2 6" /><path d="M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 20v-5h6v5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    car: <><path d="m5 11 2-5h10l2 5" /><path d="M3 13c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v5H3v-5ZM5 18v2M19 18v2" /><circle cx="7" cy="14.5" r=".7" fill="currentColor" /><circle cx="17" cy="14.5" r=".7" fill="currentColor" /></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M8 12h8M12 8v8" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    back: <><path d="m15 18-6-6 6-6" /></>,
    camera: <><path d="M4 8h4l2-3h4l2 3h4v11H4V8Z" /><circle cx="12" cy="13" r="3" /></>,
    file: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>,
    share: <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 8.5 7 10 4.2-1.5 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" /><path d="m13.5 7 3.5 3.5" /></>,
    phone: <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-1-1.5 2a15 15 0 0 1-9.5-9.5L8 7 7 3Z" />,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function StatusPill({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "gray" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function PrimaryButton({ children, onClick, icon }: { children: ReactNode; onClick?: () => void; icon?: IconName }) {
  return <button className="primary-button" onClick={onClick}>{icon && <Icon name={icon} size={18} />}{children}</button>;
}

const navItems: { id: string; label: string; icon: IconName }[] = [
  { id: "home", label: "工作台", icon: "home" },
  { id: "albums", label: "维修相册", icon: "album" },
  { id: "ai", label: "AI 助手", icon: "spark" },
  { id: "profile", label: "门店", icon: "store" },
];

function BottomNav({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <button key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => onChange(item.id)}>
          <span className="nav-icon"><Icon name={item.icon} size={21} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Header({ title = "驰援汽车服务", subtitle, back, onBack }: { title?: string; subtitle?: string; back?: boolean; onBack?: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        {back && <button className="icon-button back-button" onClick={onBack}><Icon name="back" /></button>}
        <div>
          <div className="eyebrow">{subtitle || "维修相册 · 商家端"}</div>
          <div className="brand-title">{title}</div>
        </div>
      </div>
      {!back && <button className="icon-button notification"><Icon name="bell" /><i /></button>}
    </header>
  );
}

function Home({ onCreate, onOpen }: { onCreate: () => void; onOpen: () => void }) {
  return (
    <>
      <Header />
      <main className="page home-page">
        <section className="hero-card">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-content">
            <div className="hero-kicker"><Icon name="spark" size={15} /> AI 全流程协作</div>
            <div className="hero-title">今天，有 <strong>3 台车</strong><br />等待继续服务</div>
            <p>记录过程，沉淀信任，让每一次维修都成为门店的数字口碑。</p>
            <PrimaryButton onClick={onCreate} icon="plus">新建维修相册</PrimaryButton>
          </div>
          <div className="hero-art">
            <div className="car-glow" />
            <Icon name="car" size={70} />
            <span className="ai-badge"><Icon name="spark" size={13} /> AI</span>
          </div>
        </section>

        <section className="metrics">
          <div className="metric"><span>进行中</span><strong>03</strong><small>较昨日 +1</small></div>
          <div className="metric"><span>待确认</span><strong>02</strong><small>需要跟进</small></div>
          <div className="metric"><span>本月案例</span><strong>28</strong><small>已公开 19</small></div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div><span className="section-kicker">今日进度</span><h2>正在服务</h2></div>
            <button className="text-button">查看全部 <Icon name="chevron" size={15} /></button>
          </div>
          <button className="order-card" onClick={onOpen}>
            <div className="order-top">
              <div className="vehicle-avatar"><Icon name="car" size={26} /></div>
              <div className="vehicle-info"><strong>粤 B·7K52M</strong><span>宝马 3系 · 2021款 325Li</span></div>
              <StatusPill tone="blue">施工中</StatusPill>
            </div>
            <div className="progress-track"><i style={{ width: "68%" }} /></div>
            <div className="step-row">
              {["接车", "检测", "报价", "施工", "完工"].map((step, i) => (
                <span key={step} className={i < 4 ? "done" : ""}>{i < 3 ? <Icon name="check" size={11} /> : <b />}{step}</span>
              ))}
            </div>
            <div className="order-alert"><Icon name="spark" size={16} /><span><strong>AI 建议已更新</strong> · 施工中发现冷却液渗漏，建议补充检测并重新报价</span><Icon name="chevron" size={16} /></div>
          </button>

          <div className="compact-orders">
            <button className="compact-order">
              <div className="compact-icon amber"><Icon name="clock" /></div>
              <div><strong>粤 A·2D81Q</strong><span>丰田 凯美瑞 · 等待车主确认报价</span></div>
              <StatusPill tone="amber">待确认</StatusPill>
            </button>
            <button className="compact-order">
              <div className="compact-icon green"><Icon name="check" /></div>
              <div><strong>粤 B·93J6P</strong><span>奥迪 A4L · 待发布案例</span></div>
              <StatusPill tone="green">已交车</StatusPill>
            </button>
          </div>
        </section>
      </main>
    </>
  );
}

const timeline = [
  { name: "接车建档", time: "09:18", desc: "车辆外观、里程与随车物品已拍照留证", done: true },
  { name: "全面检测", time: "10:06", desc: "完成 18 项检查，发现 2 项异常", done: true, ai: "根据车型与里程，建议重点检查气门室盖及冷却系统。" },
  { name: "首次报价", time: "10:32", desc: "¥ 2,860 · 车主已确认", done: true },
  { name: "维修施工", time: "进行中", desc: "更换气门室盖垫 · 4 张现场照片", active: true, ai: "发现节温器座轻微渗漏。建议拍照说明，并发起补充报价 ¥680。" },
  { name: "完工交车", time: "待开始", desc: "完工检测、交车报告与车主确认" },
];

function AlbumDetail({ onBack, onDocument, onStage }: { onBack: () => void; onDocument: (name: string) => void; onStage: (stage: string) => void }) {
  return (
    <>
      <Header title="粤 B·7K52M" subtitle="维修相册详情" back onBack={onBack} />
      <main className="page detail-page">
        <section className="vehicle-summary">
          <div className="vehicle-summary-top">
            <div><StatusPill tone="blue">施工中</StatusPill><h2>宝马 3系 325Li</h2><p>2021款 · 里程 68,420 km</p></div>
            <div className="health-score"><span>AI 健康分</span><strong>82</strong></div>
          </div>
          <div className="summary-meta"><span>车主 王先生</span><i /><span>137 **** 2821</span><i /><span>进店 3.5h</span></div>
        </section>

        <section className="document-strip">
          {[
            ["检测报告", "已完成", "check"],
            ["报价单", "已确认", "check"],
            ["维修工单", "施工中", "file"],
            ["交车报告", "待生成", "clock"],
          ].map(([name, status, icon], i) => (
            <button key={name} className={i === 2 ? "doc-card active" : "doc-card"} onClick={() => onDocument(name)}>
              <span className="doc-icon"><Icon name={icon as IconName} size={18} /></span>
              <strong>{name}</strong><small>{status}</small>
            </button>
          ))}
        </section>

        <section className="section-block timeline-section">
          <div className="section-heading">
            <div><span className="section-kicker">全过程留证</span><h2>服务时间线</h2></div>
            <span className="photo-count"><Icon name="camera" size={15} /> 12 份记录</span>
          </div>
          <div className="timeline">
            {timeline.map((item, i) => (
              <div className={`timeline-item ${item.done ? "done" : ""} ${item.active ? "active" : ""}`} key={item.name}>
                <div className="timeline-rail"><span>{item.done ? <Icon name="check" size={12} /> : i + 1}</span>{i < timeline.length - 1 && <i />}</div>
                <div className="timeline-content">
                  <button className="timeline-title" onClick={() => onStage(item.name)}><strong>{item.name}</strong><span>{item.time}　查看 <Icon name="chevron" size={12} /></span></button>
                  <p>{item.desc}</p>
                  {item.ai && <div className="ai-note"><span><Icon name="spark" size={15} /></span><p><strong>AI 技师意见</strong>{item.ai}</p>{item.active && <button>采纳并补充报价 <Icon name="arrow" size={14} /></button>}</div>}
                  {item.active && (
                    <div className="evidence-row">
                      <div className="evidence-photo photo-one"><span>施工前</span></div>
                      <div className="evidence-photo photo-two"><span>渗漏点</span></div>
                      <button className="add-photo"><Icon name="camera" /><span>添加留证</span></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <div className="detail-action"><button className="secondary-button"><Icon name="phone" size={18} />联系车主</button><PrimaryButton icon="plus">补充施工记录</PrimaryButton></div>
    </>
  );
}

const stageNames = ["接车建档", "全面检测", "首次报价", "维修施工", "完工交车"];

function StageTabs({ current, onChange }: { current: string; onChange: (stage: string) => void }) {
  return <div className="stage-tabs">
    {stageNames.map((name, index) => <button key={name} className={name === current ? "active" : ""} onClick={() => onChange(name)}>
      <i>{index < stageNames.indexOf(current) ? <Icon name="check" size={10} /> : index + 1}</i><span>{name.replace("建档", "").replace("全面", "").replace("首次", "").replace("维修", "").replace("完工", "")}</span>
    </button>)}
  </div>;
}

function VehicleBar() {
  return <div className="stage-vehicle"><div className="vehicle-avatar"><Icon name="car" size={23} /></div><div><strong>粤 B·7K52M</strong><span>宝马 3系 325Li · 68,420 km</span></div><StatusPill tone="blue">服务中</StatusPill></div>;
}

function IntakeContent() {
  return <>
    <section className="stage-card">
      <div className="card-title"><div><span className="section-kicker">VEHICLE CONDITION</span><h2>车辆入店留证</h2></div><span className="record-count"><Icon name="camera" size={14} /> 6 张</span></div>
      <div className="intake-photos">
        <div className="intake-photo exterior"><span>左前 45°</span><b><Icon name="check" size={11} />已留证</b></div>
        <div className="intake-photo dashboard"><span>仪表里程</span><b><Icon name="check" size={11} />已留证</b></div>
        <button className="photo-add-large"><Icon name="camera" /><span>继续拍摄</span></button>
      </div>
      <div className="condition-note"><Icon name="shield" size={17} /><div><strong>AI 影像检查</strong><span>识别到左前保险杠有轻微划痕，已自动标记并写入接车单。</span></div></div>
    </section>
    <section className="stage-card">
      <div className="card-title"><div><span className="section-kicker">CUSTOMER REQUEST</span><h2>车主诉求</h2></div><button className="edit-link"><Icon name="edit" size={14} />编辑</button></div>
      <blockquote>“车辆停放一晚后地面偶尔有油迹，最近行驶时能闻到轻微焦糊味，希望全面检查一下。”</blockquote>
      <div className="info-grid"><div><span>送修人</span><strong>王先生</strong></div><div><span>联系电话</span><strong>137 **** 2821</strong></div><div><span>随车物品</span><strong>钥匙 1 把</strong></div><div><span>油量</span><strong>约 45%</strong></div></div>
    </section>
    <div className="confirmed-bar"><Icon name="check" /><div><strong>接车信息已与车主确认</strong><span>2025-05-28 09:21 · 王先生</span></div></div>
  </>;
}

function InspectionContent() {
  return <>
    <section className="inspection-hero">
      <div className="score-dial"><strong>82</strong><span>车辆健康分</span></div>
      <div><span className="section-kicker">AI ASSISTED INSPECTION</span><h2>发现 2 项异常</h2><p>已完成发动机、底盘、电气等 18 项检查</p><div><StatusPill tone="amber">1 项建议立即处理</StatusPill><StatusPill tone="blue">1 项建议观察</StatusPill></div></div>
    </section>
    <section className="stage-card">
      <div className="card-title"><div><span className="section-kicker">ABNORMAL ITEMS</span><h2>异常项目</h2></div><span className="report-link">检测报告 <Icon name="chevron" size={14} /></span></div>
      <article className="fault-item critical"><div className="fault-index">01</div><div className="fault-main"><div><strong>气门室盖垫渗油</strong><StatusPill tone="amber">需处理</StatusPill></div><p>密封垫老化，机油已渗至排气侧，可能产生焦糊味。</p><div className="fault-evidence"><span>近景留证</span><span>渗漏位置</span><button>查看 4 张照片</button></div></div></article>
      <article className="fault-item"><div className="fault-index">02</div><div className="fault-main"><div><strong>前制动片余量偏低</strong><StatusPill tone="blue">建议观察</StatusPill></div><p>当前厚度约 4.5mm，预计仍可行驶 3,000–5,000km。</p></div></article>
    </section>
    <div className="stage-ai-panel"><span><Icon name="spark" size={18} /></span><div><strong>AI 检测意见</strong><p>该车型在此里程段还需重点检查节温器座及机油滤清器底座。建议在报价前补充冷却系统压力测试。</p><button>加入检查项目 <Icon name="plus" size={13} /></button></div></div>
  </>;
}

function QuoteContent() {
  return <>
    <section className="quote-total">
      <span>本次维修报价</span><strong><small>¥</small>2,860</strong><p>包含配件、辅料与施工服务费</p>
      <div><StatusPill tone="green"><Icon name="check" size={10} />车主已确认</StatusPill><span>10:38 确认</span></div>
    </section>
    <section className="stage-card quote-card">
      <div className="card-title"><div><span className="section-kicker">QUOTE DETAILS</span><h2>报价明细</h2></div><button className="edit-link"><Icon name="edit" size={14} />调整</button></div>
      <div className="quote-line"><div><i>配</i><span><strong>气门室盖垫</strong><small>原厂品质 · 质保 12 个月</small></span></div><b>¥1,680</b></div>
      <div className="quote-line"><div><i>料</i><span><strong>清洗剂及密封辅料</strong><small>1 套</small></span></div><b>¥580</b></div>
      <div className="quote-line"><div><i>工</i><span><strong>拆装及清洁工时</strong><small>预计 2.5 小时</small></span></div><b>¥600</b></div>
      <div className="quote-summary"><span>优惠 ¥0</span><strong>合计 ¥2,860</strong></div>
    </section>
    <div className="stage-ai-panel compact"><span><Icon name="spark" size={18} /></span><div><strong>AI 报价校验</strong><p>报价处于深圳同车型同项目合理区间，项目与检测结果匹配，未发现重复收费。</p></div></div>
    <section className="owner-confirm"><div className="signature">王先生</div><div><span>车主确认</span><strong>维修方案及报价已在线确认</strong><small>确认凭证已保存，可随时追溯</small></div><Icon name="shield" /></section>
  </>;
}

function ConstructionContent() {
  return <>
    <section className="work-progress">
      <div><span className="section-kicker">WORK IN PROGRESS</span><h2>施工进度 68%</h2><p>主修技师：陈海峰 · 已施工 1 小时 42 分</p></div><div className="work-ring"><strong>68</strong><span>%</span></div>
      <div className="wide-progress"><i /></div>
    </section>
    <section className="stage-card">
      <div className="card-title"><div><span className="section-kicker">WORK ORDER</span><h2>工序记录</h2></div><span className="record-count">工单 #052801</span></div>
      {[
        ["拆卸发动机饰板及附件", "09:52 – 10:18", "完成"],
        ["拆卸气门室盖并清洁", "10:18 – 11:06", "完成"],
        ["更换密封垫并按标准扭矩装复", "11:06 – 进行中", "施工中"],
        ["清洁测试及复检", "预计 12:10", "待开始"],
      ].map(([task, time, status], index) => <div className={`task-row ${status === "完成" ? "done" : status === "施工中" ? "active" : ""}`} key={task}><i>{status === "完成" ? <Icon name="check" size={11} /> : index + 1}</i><div><strong>{task}</strong><span>{time}</span></div><StatusPill tone={status === "完成" ? "green" : status === "施工中" ? "blue" : "gray"}>{status}</StatusPill></div>)}
    </section>
    <section className="new-fault"><div className="fault-alert-head"><span><Icon name="spark" />施工中新发现</span><small>11:24</small></div><h3>节温器座轻微渗漏</h3><p>拆卸后视野更清晰，确认冷却液痕迹来自节温器座。建议趁当前拆装工序一并处理，可节省重复工时。</p><div className="new-fault-bottom"><span>补充报价 <strong>¥680</strong></span><button>发起补充报价 <Icon name="arrow" size={14} /></button></div></section>
  </>;
}

function HandoffContent() {
  return <>
    <section className="handoff-hero">
      <div className="handoff-check"><Icon name="check" size={27} /></div><div><span className="section-kicker">READY FOR DELIVERY</span><h2>维修已完成，等待车主确认</h2><p>完工复检通过 · 试车 8.6 km 无异常</p></div>
    </section>
    <section className="stage-card">
      <div className="card-title"><div><span className="section-kicker">DELIVERY REPORT</span><h2>交车报告</h2></div><StatusPill tone="amber">待车主确认</StatusPill></div>
      <div className="result-comparison"><div className="result-photo before"><span>维修前</span><b>渗油明显</b></div><div className="compare-arrow"><Icon name="arrow" /></div><div className="result-photo after"><span>维修后</span><b>清洁无渗漏</b></div></div>
      <div className="handoff-checks"><div><Icon name="check" /><span><strong>静态复检</strong><small>怠速 20 分钟无渗漏</small></span></div><div><Icon name="check" /><span><strong>道路试车</strong><small>8.6 km，运行正常</small></span></div><div><Icon name="check" /><span><strong>故障码检测</strong><small>无相关故障码</small></span></div></div>
    </section>
    <section className="warranty-card"><Icon name="shield" /><div><span>本次服务保障</span><strong>配件及施工质保 12 个月 / 20,000km</strong><small>以先到者为准，电子质保凭证已生成</small></div></section>
    <section className="confirm-flow"><div className="confirm-step done"><i><Icon name="check" size={12} /></i><span><strong>商家提交交车报告</strong><small>今天 14:36</small></span></div><div className="confirm-line" /><div className="confirm-step"><i>2</i><span><strong>等待车主在线确认</strong><small>确认后订单将自动完成</small></span></div><div className="confirm-line muted" /><div className="confirm-step muted"><i>3</i><span><strong>邀请评价并公开案例</strong><small>自动脱敏后生成分享文案</small></span></div></section>
  </>;
}

function ProcessPage({ initialStage, onBack }: { initialStage: string; onBack: () => void }) {
  const [stage, setStage] = useState(initialStage);
  const content: Record<string, ReactNode> = {
    "接车建档": <IntakeContent />,
    "全面检测": <InspectionContent />,
    "首次报价": <QuoteContent />,
    "维修施工": <ConstructionContent />,
    "完工交车": <HandoffContent />,
  };
  const actions: Record<string, string> = {
    "接车建档": "保存并开始检测",
    "全面检测": "生成检测报告",
    "首次报价": "发送报价单给车主",
    "维修施工": "添加施工记录",
    "完工交车": "提醒车主确认报告",
  };
  return <>
    <Header title={stage} subtitle="服务节点详情" back onBack={onBack} />
    <main className="page process-page">
      <StageTabs current={stage} onChange={setStage} />
      <VehicleBar />
      {content[stage]}
    </main>
    <div className="process-action"><button className="secondary-button"><Icon name="file" size={17} />预览记录</button><PrimaryButton>{actions[stage]}</PrimaryButton></div>
  </>;
}

function Albums({ onOpen }: { onOpen: () => void }) {
  return (
    <><Header title="维修相册" subtitle="真实记录 · 长期沉淀" /><main className="page generic-page">
      <div className="filter-row"><button className="filter active">全部 28</button><button className="filter">进行中 3</button><button className="filter">待确认 2</button><button className="filter">已完成 23</button></div>
      <div className="search-box"><Icon name="scan" size={18} /><span>搜索车牌、车型或车主手机号</span></div>
      <button className="album-list-card featured" onClick={onOpen}>
        <div className="case-cover blue-cover"><Icon name="car" size={40} /><span>12 条留证</span></div>
        <div className="case-info"><div><strong>粤 B·7K52M</strong><StatusPill tone="blue">施工中</StatusPill></div><h3>宝马 3系 · 发动机渗油维修</h3><p>今天 09:18 · 已进行 3.5 小时</p><div className="mini-progress"><i style={{ width: "68%" }} /></div></div>
      </button>
      <button className="album-list-card">
        <div className="case-cover warm-cover"><Icon name="car" size={40} /><span>18 条留证</span></div>
        <div className="case-info"><div><strong>粤 B·93J6P</strong><StatusPill tone="green">已交车</StatusPill></div><h3>奥迪 A4L · 制动系统保养</h3><p>昨天 · 车主评价 5.0</p><div className="case-tags"><span>已确认报告</span><span>可公开</span></div></div>
      </button>
      <button className="album-list-card">
        <div className="case-cover gray-cover"><Icon name="car" size={40} /><span>6 条留证</span></div>
        <div className="case-info"><div><strong>粤 A·2D81Q</strong><StatusPill tone="amber">待确认</StatusPill></div><h3>丰田 凯美瑞 · 空调异响检测</h3><p>今天 11:26 · 报价 ¥1,240</p><div className="case-tags"><span>等待车主确认</span></div></div>
      </button>
    </main></>
  );
}

function AiAssistant() {
  return (
    <><Header title="AI 维修助手" subtitle="基于案例与车型数据研判" /><main className="page generic-page ai-page">
      <section className="ai-overview">
        <div className="ai-orb"><Icon name="spark" size={30} /></div>
        <span>今日 AI 已参与</span><strong>8 个服务节点</strong><p>提前识别 2 项风险，生成 5 条沟通建议</p>
      </section>
      <div className="section-heading"><div><span className="section-kicker">需要关注</span><h2>实时意见</h2></div><StatusPill tone="blue">2 条新建议</StatusPill></div>
      <article className="insight-card urgent">
        <div className="insight-head"><span><Icon name="spark" size={17} />施工风险提示</span><small>刚刚</small></div>
        <h3>建议补充检查冷却系统</h3><p>粤 B·7K52M 的车型在当前里程段，节温器座渗漏发生率较高。当前施工照片中存在疑似冷却液痕迹。</p>
        <div className="insight-actions"><button>暂不处理</button><button>查看并采纳 <Icon name="arrow" size={15} /></button></div>
      </article>
      <article className="insight-card">
        <div className="insight-head"><span><Icon name="shield" size={17} />报价沟通建议</span><small>26 分钟前</small></div>
        <h3>解释配件价差，减少车主疑虑</h3><p>同款制动片网络报价差异较大，建议在报价单中增加品牌、质保时长及适配说明。</p>
        <div className="insight-actions"><button>忽略</button><button>添加到报价单 <Icon name="arrow" size={15} /></button></div>
      </article>
      <section className="ask-box"><div><Icon name="spark" /><span>输入车型或维修问题，获取 AI 意见</span></div><button><Icon name="arrow" /></button></section>
      <p className="ai-disclaimer">AI 意见仅供专业技师参考，最终维修方案需结合实车检测确定</p>
    </main></>
  );
}

function Profile() {
  return (
    <><Header title="门店资料" subtitle="公开信息越完整，越容易被 AI 发现" /><main className="page generic-page profile-page">
      <section className="store-card">
        <div className="store-logo">驰援</div><div className="store-main"><div><h2>驰援汽车服务中心</h2><StatusPill tone="green">已认证</StatusPill></div><p><Icon name="location" size={14} />深圳市南山区科技园科苑路 18 号</p></div>
        <button className="icon-button"><Icon name="edit" size={18} /></button>
      </section>
      <section className="profile-completion">
        <div className="completion-ring"><strong>76</strong><span>%</span></div>
        <div><span className="section-kicker">资料完善度</span><h3>再补充 3 项，提升 AI 推荐概率</h3><p>完善擅长车型、技师资质与服务保障</p></div>
      </section>
      <section className="data-card">
        <div className="section-heading"><div><span className="section-kicker">公开名片</span><h2>门店信息</h2></div><button className="text-button">预览公开页 <Icon name="chevron" size={15} /></button></div>
        {[
          ["门店介绍", "专注德系车辆维修保养 12 年", true],
          ["擅长服务", "发动机维修 · 底盘 · 制动系统", true],
          ["技师资质", "待补充 2 位技师认证", false],
          ["服务保障", "配件质保信息待完善", false],
        ].map(([title, value, done]) => <button className="profile-row" key={title as string}><span className={done ? "row-icon done" : "row-icon"}>{done ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}</span><div><strong>{title}</strong><p>{value}</p></div><Icon name="chevron" size={17} /></button>)}
      </section>
      <section className="public-stats"><div><Icon name="album" /><strong>19</strong><span>公开案例</span></div><div><Icon name="share" /><strong>126</strong><span>本月被查看</span></div><div><Icon name="spark" /><strong>8</strong><span>AI 来源咨询</span></div></section>
    </main></>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const [parsed, setParsed] = useState(false);
  return <div className="modal-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="sheet">
      <div className="sheet-handle" />
      <div className="sheet-head"><div><span className="section-kicker">NEW ALBUM</span><h2>新建维修相册</h2><p>录入基础信息，后续过程由系统持续记录</p></div><button className="close-button" onClick={onClose}>×</button></div>
      <div className="form-grid">
        <label><span>车牌号</span><input defaultValue="粤 B·" /></label>
        <label><span>当前里程</span><div className="input-suffix"><input placeholder="请输入" /><em>km</em></div></label>
      </div>
      <label className="field"><span>车架号 VIN</span><div className="scan-input"><input placeholder="输入或扫描 17 位车架号" defaultValue={parsed ? "LBV8W3104MMR65218" : ""} /><button onClick={() => setParsed(true)}><Icon name="scan" size={19} />扫描</button></div></label>
      {parsed && <div className="parse-result"><Icon name="check" size={16} /><div><strong>VIN 解析成功</strong><span>宝马 3系 · 2021款 325Li M运动套装</span></div></div>}
      <label className="field"><span>车主手机号</span><input placeholder="用于发送确认单与交车报告" inputMode="tel" /></label>
      <div className="privacy-note"><Icon name="shield" size={17} /><span>车主隐私信息仅用于本次服务，公开案例将自动脱敏</span></div>
      <PrimaryButton onClick={onClose}>创建相册并开始接车</PrimaryButton>
    </div>
  </div>;
}

function DocumentModal({ name, onClose }: { name: string; onClose: () => void }) {
  return <div className="modal-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="sheet document-sheet"><div className="sheet-handle" />
      <div className="sheet-head"><div><span className="section-kicker">SERVICE DOCUMENT</span><h2>{name}</h2><p>粤 B·7K52M · 宝马 3系 325Li</p></div><button className="close-button" onClick={onClose}>×</button></div>
      <div className="document-preview">
        <div className="preview-brand"><span className="mini-logo">驰援</span><div><strong>驰援汽车服务中心</strong><small>透明维修 · 全程留证</small></div><StatusPill tone={name === "维修工单" ? "blue" : "green"}>{name === "维修工单" ? "施工中" : "已确认"}</StatusPill></div>
        <div className="preview-title">{name}</div>
        <div className="preview-row"><span>车辆信息</span><strong>粤 B·7K52M / 68,420km</strong></div>
        <div className="preview-row"><span>服务项目</span><strong>发动机渗油维修</strong></div>
        <div className="preview-list"><div><i /><span>更换气门室盖垫</span><strong>¥1,680</strong></div><div><i /><span>发动机清洗及检测</span><strong>¥580</strong></div><div><i /><span>施工服务费</span><strong>¥600</strong></div></div>
        <div className="preview-total"><span>合计</span><strong>¥2,860</strong></div>
        <div className="preview-stamp"><Icon name="shield" size={17} />全流程影像已存证 · 数据不可篡改</div>
      </div>
      <div className="sheet-buttons"><button className="secondary-button"><Icon name="share" size={18} />发送车主</button><PrimaryButton onClick={onClose}>查看完整文件</PrimaryButton></div>
    </div>
  </div>;
}

export default function App() {
  const [tab, setTab] = useState("home");
  const [detail, setDetail] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [document, setDocument] = useState<string | null>(null);

  const changeTab = (id: string) => { setTab(id); setDetail(false); setStage(null); };
  return (
    <div className="app-shell">
      <div className="phone-frame">
        <div className="status-bar"><span>9:41</span><div><i /><i /><b>▰</b></div></div>
        {stage ? <ProcessPage initialStage={stage} onBack={() => setStage(null)} /> : detail ? <AlbumDetail onBack={() => setDetail(false)} onDocument={setDocument} onStage={setStage} /> : <>
          {tab === "home" && <Home onCreate={() => setCreateOpen(true)} onOpen={() => setDetail(true)} />}
          {tab === "albums" && <Albums onOpen={() => setDetail(true)} />}
          {tab === "ai" && <AiAssistant />}
          {tab === "profile" && <Profile />}
          <BottomNav active={tab} onChange={changeTab} />
        </>}
        {createOpen && <CreateModal onClose={() => setCreateOpen(false)} />}
        {document && <DocumentModal name={document} onClose={() => setDocument(null)} />}
      </div>
    </div>
  );
}
