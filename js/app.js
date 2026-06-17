const DATA_FILES = {
  cards: "data/recite_cards.json",
  reciteClozeMasks: "data/recite_cloze_masks.json",
  shortQuestions: "data/short_questions.json",
  choiceQuestions: "data/choice_questions.json",
  mindmap: "data/mindmap.json?v=2",
  autoLinks: "data/auto_links.json",
  manualLinks: "data/manual_links.json",
  coverage: "data/coverage_report.json",
  rawWord: "data/raw_word_paragraphs.json",
  sourceManifest: "data/source_manifest.json",
  buildSummary: "data/build_summary.json",
};

const state = {
  data: {},
  page: "home",
  reciteMode: "horizontal",
  singleIndex: 0,
  activeSlide: 1,
  activeNodeId: "",
  filters: {
    recite: {},
    cards: {},
    short: {},
    choice: {},
  },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readStore(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function cardStatusMap() {
  return readStore("mayuan.cardStatus", {});
}

function questionStatusMap() {
  return readStore("mayuan.questionStatus", {});
}

function setCardStatus(id, status) {
  const map = cardStatusMap();
  map[id] = status;
  writeStore("mayuan.cardStatus", map);
  renderCurrentPage();
}

function setQuestionStatus(id, status) {
  const map = questionStatusMap();
  map[id] = status;
  writeStore("mayuan.questionStatus", map);
  renderCurrentPage();
}

function getLinks(id) {
  const manual = state.data.manualLinks || {};
  const auto = state.data.autoLinks || {};
  return manual[id] || auto[id] || [];
}

function linkedCards(ids) {
  const cards = state.data.cards || [];
  return ids.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
}

function linkedCardsHtml(ids) {
  const cards = linkedCards(ids);
  if (!cards.length) {
    return `<p class="muted">暂无自动关联知识点，可在 data/manual_links.json 中人工修正。</p>`;
  }
  return `<div class="linked-cards">${cards
    .map(
      (card) => `<article class="linked-mini">
        <h4>${escapeHtml(card.title)}</h4>
        <p class="muted">${escapeHtml(card.chapter)} · ${card.id}</p>
        <ol>${card.bullets.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </article>`
    )
    .join("")}</div>`;
}

async function loadData() {
  const entries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, path]) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`无法加载 ${path}`);
      return [key, await res.json()];
    })
  );
  state.data = Object.fromEntries(entries);
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function renderCard(card, compact = false, options = {}) {
  const status = cardStatusMap()[card.id] || "";
  const checkMode = options.checkMode === true;
  const collapsed = !checkMode && (status === "mastered" || status === "studied");
  const bulletHtml = card.bullets
    .map((item, index) => `<li>${checkMode ? renderClozeText(card.id, index, item) : escapeHtml(item)}</li>`)
    .join("");
  return `<article class="reader-card ${compact ? "grid" : ""} ${checkMode ? "check-card" : ""} ${status || ""} ${
    collapsed ? "collapsed" : ""
  }" data-card-id="${
    card.id
  }">
    <div class="meta-row">
      <span class="tag level-${card.level}">${card.level}</span>
      <span class="tag">Day ${card.day}</span>
      <span class="tag">${escapeHtml(card.kind)}</span>
      ${status ? `<span class="tag">${statusLabel(status)}</span>` : ""}
    </div>
    <h2>${escapeHtml(card.title)}</h2>
    <p class="chapter">${escapeHtml(card.chapter)} · ${card.id}</p>
    <ol>${bulletHtml}</ol>
    <div class="button-row">
      ${
        checkMode
          ? `<button data-action="reveal-card-clozes">显示全部遮罩</button><button data-action="hide-card-clozes">重新遮住</button>`
          : `<button data-action="toggle-card">显示/隐藏内容</button>`
      }
      <button data-action="card-status" data-status="mastered" class="${status === "mastered" ? "primary" : ""}">已会背</button>
      <button data-action="card-status" data-status="studied" class="${status === "studied" ? "primary" : ""}">已学过</button>
      <button data-action="card-status" data-status="notyet" class="${status === "notyet" ? "primary" : ""}">还不会</button>
    </div>
  </article>`;
}

function renderClozeText(cardId, bulletIndex, text) {
  const ranges = clozeRanges(cardId, bulletIndex, text);
  let cursor = 0;
  let html = "";
  ranges.forEach(([start, end]) => {
    html += escapeHtml(text.slice(cursor, start));
    html += `<button type="button" class="cloze-mask" data-action="reveal-cloze" aria-label="显示遮住内容"><span class="cloze-answer">${escapeHtml(
      text.slice(start, end)
    )}</span></button>`;
    cursor = end;
  });
  html += escapeHtml(text.slice(cursor));
  return html;
}

function clozeRanges(cardId, bulletIndex, text) {
  const manual = state.data.reciteClozeMasks?.cards?.[cardId]?.[String(bulletIndex)];
  const manualRanges = normalizeClozeRanges(text, manual || []);
  if (manualRanges.length) return manualRanges;
  return fallbackClozeRange(text);
}

function normalizeClozeRanges(text, ranges) {
  if (!Array.isArray(ranges)) return [];
  return ranges
    .filter((range) => Array.isArray(range) && range.length === 2)
    .map(([start, end]) => [Number(start), Number(end)])
    .filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= text.length && start < end)
    .sort((a, b) => a[0] - b[0])
    .filter(([start, end], index, list) => index === 0 || start >= list[index - 1][1]);
}

function fallbackClozeRange(text) {
  const match = /[\u4e00-\u9fa5A-Za-z0-9]{2,18}/.exec(text);
  return match ? [[match.index, match.index + match[0].length]] : [];
}

function statusLabel(status) {
  return { mastered: "已会背", studied: "已学过", notyet: "还不会", right: "做对", wrong: "做错", later: "稍后再看" }[status] || "";
}

function pageShell(title, controls, body) {
  return `<div class="band"><h2>${title}</h2></div>${controls || ""}${body}`;
}

function formValues(formId, key) {
  const form = $(`#${formId}`);
  if (form) {
    state.filters[key] = Object.fromEntries(new FormData(form).entries());
  }
  return state.filters[key] || {};
}

function selected(value, expected) {
  return String(value || "") === String(expected || "") ? "selected" : "";
}

function filterCards(key = "recite") {
  const formId = key === "cards" ? "cardFilters" : "reciteFilters";
  const cards = state.data.cards || [];
  const values = formValues(formId, key);
  const statusMap = cardStatusMap();
  const search = (values.search || "").trim().toLowerCase();
  return cards.filter((card) => {
    const status = statusMap[card.id] || "";
    if (values.day && String(card.day) !== values.day) return false;
    if (values.chapter && card.chapter !== values.chapter) return false;
    if (values.level && card.level !== values.level) return false;
    if (values.kind && card.kind !== values.kind) return false;
    if (values.progress === "unmastered" && status === "mastered") return false;
    if (values.progress === "mastered" && status !== "mastered") return false;
    if (values.progress === "notyet" && status !== "notyet") return false;
    if (search && !card.searchText.toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderReciteControls(targetId = "reciteFilters", key = "recite") {
  const cards = state.data.cards || [];
  const values = state.filters[key] || {};
  const days = unique(cards.map((card) => String(card.day)));
  const chapters = unique(cards.map((card) => card.chapter));
  const kinds = unique(cards.map((card) => card.kind));
  return `<form id="${targetId}" class="controls">
    <div class="segmented" id="modeButtons">
      <button type="button" data-mode="horizontal" class="${state.reciteMode === "horizontal" ? "active" : ""}">横向阅读</button>
      <button type="button" data-mode="grid" class="${state.reciteMode === "grid" ? "active" : ""}">网格浏览</button>
      <button type="button" data-mode="single" class="${state.reciteMode === "single" ? "active" : ""}">单张背诵</button>
      <button type="button" data-mode="check" class="${state.reciteMode === "check" ? "active" : ""}">检验背诵</button>
    </div>
    <div class="filter-grid">
      <select name="day"><option value="">全部 Day</option>${days.map((day) => `<option value="${day}" ${selected(values.day, day)}>Day ${day}</option>`).join("")}</select>
      <select name="chapter"><option value="">全部章节</option>${chapters.map((x) => `<option ${selected(values.chapter, x)}>${escapeHtml(x)}</option>`).join("")}</select>
      <select name="level"><option value="">全部等级</option>${["A", "B", "C"].map((x) => `<option ${selected(values.level, x)}>${x}</option>`).join("")}</select>
      <select name="kind"><option value="">全部类型</option>${kinds.map((x) => `<option ${selected(values.kind, x)}>${escapeHtml(x)}</option>`).join("")}</select>
      <select name="progress">
        <option value="">全部进度</option>
        <option value="unmastered" ${selected(values.progress, "unmastered")}>只看未会背</option>
        <option value="mastered" ${selected(values.progress, "mastered")}>只看已会背</option>
        <option value="notyet" ${selected(values.progress, "notyet")}>只看还不会</option>
      </select>
      <input name="search" value="${escapeHtml(values.search || "")}" placeholder="搜索：矛盾 / 真理 / 剩余价值" />
    </div>
  </form>`;
}

function renderHome() {
  const summary = state.data.buildSummary;
  const status = cardStatusMap();
  const mastered = Object.values(status).filter((x) => x === "mastered").length;
  const studied = Object.values(status).filter((x) => x === "studied").length;
  const page = $("#page-home");
  page.innerHTML = `<div class="band stats-grid">
    ${stat("背诵卡", summary.reciteCards)}
    ${stat("简答题", summary.shortQuestions)}
    ${stat("选择题", summary.choiceQuestions)}
    ${stat("导图页数", summary.mindmapPages)}
    ${stat("Word 覆盖", `${summary.wordCoveredParagraphs}/${summary.wordTotalParagraphs}`)}
    ${stat("当前进度", `${mastered} 会背 · ${studied} 学过`)}
  </div>
  <div class="band panel">
    <h2>今日建议任务</h2>
    <p>背诵 Day ${Math.max(1, Math.ceil((mastered + studied + 1) / 15))} 的卡片，刷 10 道选择题，再用思维导图点一遍薄弱节点。</p>
    <div class="button-row">
      <button class="primary" data-go="recite">开始背诵</button>
      <button data-go="choice">刷选择题</button>
      <button data-go="mindmap">看思维导图</button>
    </div>
  </div>`;
}

function stat(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderRecite() {
  const filtered = filterCards("recite");
  const page = $("#page-recite");
  let body = "";
  if (state.reciteMode === "single") {
    if (state.singleIndex >= filtered.length) state.singleIndex = 0;
    const card = filtered[state.singleIndex];
    body = `<div class="reader-list single">${
      card ? renderCard(card) : `<div class="panel band">没有匹配的卡片。</div>`
    }<div class="band button-row"><button data-single="prev">上一张</button><span class="muted">${filtered.length ? state.singleIndex + 1 : 0} / ${
      filtered.length
    }</span><button data-single="next">下一张</button></div></div>`;
  } else if (state.reciteMode === "check") {
    body = `<div class="reader-list check">${filtered.map((card) => renderCard(card, false, { checkMode: true })).join("")}</div>`;
  } else {
    body = `<div class="reader-list ${state.reciteMode}">${filtered.map((card) => renderCard(card, state.reciteMode === "grid")).join("")}</div>`;
  }
  page.innerHTML = pageShell("背诵", renderReciteControls("reciteFilters"), body);
}

function renderCardsPage() {
  const cards = filterCards("cards");
  $("#page-cards").innerHTML = pageShell(
    "卡片列表",
    renderReciteControls("cardFilters", "cards"),
    `<div class="question-grid">${cards
      .map(
        (card) => `<article class="question-card">
          <h3>${escapeHtml(card.title)}</h3>
          <p class="muted">${card.id} · ${escapeHtml(card.chapter)} · Day ${card.day} · ${card.level}</p>
          <p>${escapeHtml(card.bullets[0] || "")}</p>
          <button data-open-card="${card.id}">进入背诵</button>
        </article>`
      )
      .join("")}</div>`
  );
}

function filterQuestions(type) {
  const data = type === "short" ? state.data.shortQuestions : state.data.choiceQuestions;
  const values = formValues(`${type}Filters`, type);
  const search = (values.search || "").trim().toLowerCase();
  return data.filter((q) => {
    if (values.chapter && q.chapter !== values.chapter) return false;
    if (values.level && q.level !== values.level) return false;
    if (values.difficulty && q.difficulty !== values.difficulty) return false;
    const hay = `${q.title || ""} ${q.stem || ""} ${q.raw || ""}`.toLowerCase();
    if (search && !hay.includes(search)) return false;
    return true;
  });
}

function renderQuestionControls(type) {
  const data = type === "short" ? state.data.shortQuestions : state.data.choiceQuestions;
  const values = state.filters[type] || {};
  const chapters = unique(data.map((q) => q.chapter));
  const difficulties = unique(data.map((q) => q.difficulty));
  return `<form id="${type}Filters" class="controls">
    <div class="filter-grid">
      <select name="chapter"><option value="">全部章节</option>${chapters.map((x) => `<option ${selected(values.chapter, x)}>${escapeHtml(x)}</option>`).join("")}</select>
      ${
        type === "short"
          ? `<select name="level"><option value="">全部等级</option>${["A", "B"].map((x) => `<option ${selected(values.level, x)}>${x}</option>`).join("")}</select>`
          : `<select name="difficulty"><option value="">全部难度</option>${difficulties.map((x) => `<option ${selected(values.difficulty, x)}>${escapeHtml(x)}</option>`).join("")}</select>`
      }
      <input name="search" value="${escapeHtml(values.search || "")}" placeholder="关键词筛选" />
    </div>
  </form>`;
}

function renderShort() {
  const questions = filterQuestions("short");
  $("#page-short").innerHTML = pageShell(
    "简答题",
    renderQuestionControls("short"),
    `<div class="question-grid">${questions
      .map(
        (q) => `<article class="question-card">
          <div class="meta-row"><span class="tag level-${q.level}">${q.level}</span><span class="tag">${escapeHtml(q.chapter)}</span><span class="tag">${
          q.pageHint
        }</span></div>
          <h3>${q.number}. ${escapeHtml(q.title)}</h3>
          ${q.examYears.length ? `<p class="muted">历年：${q.examYears.map(escapeHtml).join("、")}</p>` : ""}
          <textarea placeholder="默写区"></textarea>
          <button data-toggle="#links-${q.id}">查看关联知识点</button>
          <div id="links-${q.id}" class="hidden">${linkedCardsHtml(getLinks(q.id))}</div>
        </article>`
      )
      .join("")}</div>`
  );
}

function renderChoice() {
  const questions = filterQuestions("choice");
  const qStatus = questionStatusMap();
  $("#page-choice").innerHTML = pageShell(
    "选择题",
    renderQuestionControls("choice"),
    `<div class="question-grid">${questions
      .map(
        (q) => `<article class="question-card">
          <div class="meta-row"><span class="tag">${escapeHtml(q.chapter)}</span><span class="tag">难度：${escapeHtml(q.difficulty)}</span>${
          qStatus[q.id] ? `<span class="tag">${statusLabel(qStatus[q.id])}</span>` : ""
        }</div>
          <h3>${q.id} ${escapeHtml(q.stem || "解析失败，保留原始题块")}</h3>
          <div class="options">${["A", "B", "C", "D"]
            .map((letter) => `<div class="option"><strong>${letter}</strong><span>${escapeHtml(q.options?.[letter] || "")}</span></div>`)
            .join("")}</div>
          <div class="button-row">
            <button data-toggle="#answer-${q.id}">显示答案</button>
            <button data-action="question-status" data-qid="${q.id}" data-status="right">做对</button>
            <button data-action="question-status" data-qid="${q.id}" data-status="wrong">做错</button>
            <button data-action="question-status" data-qid="${q.id}" data-status="later">稍后再看</button>
          </div>
          <div id="answer-${q.id}" class="answer hidden">正确答案：${escapeHtml(q.answer || "未解析")} ${linkedCardsHtml(getLinks(q.id))}</div>
          ${q.parseError ? `<pre class="raw-block">${escapeHtml(q.raw)}</pre>` : ""}
        </article>`
      )
      .join("")}</div>`
  );
}

/* ── Mindmap persistent state (survives re-renders) ── */
const mindmapState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  scrollStartX: 0,
  scrollStartY: 0,
  isFullscreen: false,
  sidebarVisible: true,
  cardsExpanded: true,
  searchQuery: "",
  highlightNodeId: "",
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.15;

function expandedLinkedCardsHtml(ids) {
  const cards = linkedCards(ids);
  if (!cards.length) {
    return `<div class="linked-empty">📭 该节点暂无关联的知识卡片。<br><span class="muted" style="font-size:12px;">可在 data/manual_links.json 中手动补充关联。</span></div>`;
  }
  if (!mindmapState.cardsExpanded) {
    return `<div class="linked-cards">${cards
      .map(
        (card) => `<article class="linked-mini">
          <h4>${escapeHtml(card.title)}</h4>
          <p class="muted">${escapeHtml(card.chapter)} · ${card.id}</p>
          <ol>${card.bullets.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
        </article>`
      )
      .join("")}</div>
    <button class="collapse-btn" data-action="expand-linked">📖 展开完整内容 (${cards.length} 张卡片)</button>`;
  }
  return `<div class="linked-detail">${cards
    .map(
      (card) => `<article class="linked-detail-card">
        <h4>${escapeHtml(card.title)}</h4>
        <div class="detail-meta">
          <span class="tag level-${card.level}">${card.level}</span>
          <span class="tag">${escapeHtml(card.chapter)}</span>
          <span class="tag">${card.id}</span>
          ${card.kind ? `<span class="tag">${escapeHtml(card.kind)}</span>` : ""}
          ${card.day ? `<span class="tag">Day ${card.day}</span>` : ""}
        </div>
        <ol>${card.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </article>`
    )
    .join("")}</div>
  <button class="collapse-btn" data-action="collapse-linked">▲ 收起</button>`;
}

function mindmapSearchResults(query) {
  if (!query || query.length < 1) return [];
  const mindmap = state.data.mindmap;
  const q = query.toLowerCase();
  const results = [];
  for (const slide of mindmap.slides) {
    for (const node of slide.nodes) {
      if (node.text.toLowerCase().includes(q)) {
        results.push({ slide: slide.slide, node });
      }
      if (results.length >= 30) return results;
    }
  }
  return results;
}

function renderMindmap() {
  const mindmap = state.data.mindmap;
  const slide = mindmap.slides.find((item) => item.slide === state.activeSlide) || mindmap.slides[0];
  if (!state.activeNodeId && slide.nodes[0]) state.activeNodeId = slide.nodes[0].id;
  const activeNode = slide.nodes.find((node) => node.id === state.activeNodeId) || slide.nodes[0];
  const totalSlides = mindmap.slides.length;
  const isFirst = state.activeSlide <= 1;
  const isLast = state.activeSlide >= totalSlides;
  const zoomPct = Math.round(mindmapState.zoom * 100);

  const pageSection = $("#page-mindmap");
  pageSection.classList.toggle("mindmap-fullscreen", mindmapState.isFullscreen);

  pageSection.innerHTML = `
  <div class="mindmap-controls">
    <div class="ctrl-group">
      <button data-mm-action="prev-page" ${isFirst ? "disabled" : ""} title="上一页 (←)">◀ 上一页</button>
      <select id="slideSelect">${mindmap.slides
        .map((item) => `<option value="${item.slide}" ${item.slide === slide.slide ? "selected" : ""}>第 ${item.slide} 页</option>`)
        .join("")}</select>
      <button data-mm-action="next-page" ${isLast ? "disabled" : ""} title="下一页 (→)">下一页 ▶</button>
      <span class="muted" style="font-size:13px;">${mindmap.pageCount} 页 · ${mindmap.nodeCount} 节点</span>
    </div>
    <div class="ctrl-group">
      <button data-mm-action="zoom-out" title="缩小">−</button>
      <span class="zoom-label">${zoomPct}%</span>
      <button data-mm-action="zoom-in" title="放大">+</button>
      <button data-mm-action="zoom-reset" title="重置缩放">1:1</button>
    </div>
    <div class="ctrl-group">
      <button data-mm-action="toggle-fullscreen" title="全屏模式">${mindmapState.isFullscreen ? "✕ 退出全屏" : "⛶ 全屏"}</button>
    </div>
    <div class="ctrl-sep"></div>
    <div class="mindmap-search-wrap">
      <input id="mmSearch" type="text" placeholder="搜索全部节点…" value="${escapeHtml(mindmapState.searchQuery)}" autocomplete="off" />
      <div class="mindmap-search-results" id="mmSearchResults"></div>
    </div>
  </div>
  <div class="mindmap-layout">
    <div class="mindmap-stage" id="mmStage">
      <div class="mindmap-zoom-container native-render" id="mmZoom" style="transform: scale(${mindmapState.zoom})">
        <svg class="mm-lines" width="100%" height="100%">
          ${(slide.lines || []).map(l => {
            const x1 = l.x1 * 100; const y1 = l.y1 * 100;
            const x2 = l.x2 * 100; const y2 = l.y2 * 100;
            if (l.type === 'bentConnector3') {
              // Draw a smooth bezier curve for elbow connectors
              const mx = (x1 + x2) / 2;
              return `<path d="M ${x1}% ${y1}% C ${mx}% ${y1}%, ${mx}% ${y2}%, ${x2}% ${y2}%" fill="none" stroke="#c0a98b" stroke-width="2.5" />`;
            } else {
              return `<line x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%" stroke="#c0a98b" stroke-width="2.5" />`;
            }
          }).join("")}
        </svg>
        ${slide.nodes
          .map(
            (node) => {
              const isVertical = node.h > node.w * 1.5;
              return `<button class="mm-node ${isVertical ? 'vertical-text' : ''} ${node.id === activeNode?.id ? "active" : ""} ${node.id === mindmapState.highlightNodeId ? "highlight-pulse" : ""}" data-node="${node.id}" style="left:${node.x * 100}%;top:${
                node.y * 100
              }%;width:${Math.max(node.w * 100, 2)}%;height:${Math.max(node.h * 100, 2)}%;" title="${escapeHtml(node.text)}"><span>${escapeHtml(node.text)}</span></button>`;
            }
          )
          .join("")}
      </div>
      <div class="minimap ${mindmapState.zoom > 1 ? "visible" : ""}" id="mmMinimap">
        <div class="minimap-bg"></div>
        <div class="minimap-viewport" id="mmMinimapViewport"></div>
      </div>
    </div>
    <aside class="mindmap-sidebar ${!mindmapState.sidebarVisible && mindmapState.isFullscreen ? "sidebar-hidden" : ""}" id="mmSidebar">
      <h2>本页节点</h2>
      <div class="node-list">${slide.nodes
        .map((node) => `<button class="chip ${node.id === activeNode?.id ? "active" : ""}" data-node="${node.id}">${escapeHtml(node.text)}</button>`)
        .join("")}</div>
      <h3>${activeNode ? escapeHtml(activeNode.text) : "暂无节点"}</h3>
      ${activeNode ? expandedLinkedCardsHtml(getLinks(activeNode.id)) : ""}
    </aside>
    <button class="sidebar-toggle-float" data-mm-action="toggle-sidebar" id="mmSidebarToggle">${mindmapState.sidebarVisible ? "◁ 隐藏" : "▷ 侧栏"}</button>
  </div>`;

  /* Restore scroll position if we had one, then set up minimap */
  requestAnimationFrame(() => {
    updateMinimap();
    /* Re-focus the search input if user was typing */
    if (mindmapState.searchQuery) {
      const inp = $("#mmSearch");
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
        doMindmapSearch(mindmapState.searchQuery);
      }
    }
  });
}

/* ── Zoom helpers ── */
function setZoom(newZoom, centerOnMouse, stage, mx, my) {
  const old = mindmapState.zoom;
  mindmapState.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  const container = $("#mmZoom");
  if (!container) return;
  if (centerOnMouse && stage) {
    const ratio = mindmapState.zoom / old;
    const sl = stage.scrollLeft;
    const st = stage.scrollTop;
    const newSl = (sl + mx) * ratio - mx;
    const newSt = (st + my) * ratio - my;
    container.style.transition = "none";
    container.style.transform = `scale(${mindmapState.zoom})`;
    stage.scrollLeft = newSl;
    stage.scrollTop = newSt;
    requestAnimationFrame(() => {
      container.style.transition = "";
    });
  } else {
    container.style.transform = `scale(${mindmapState.zoom})`;
  }
  /* Update zoom label */
  const label = $(".zoom-label");
  if (label) label.textContent = `${Math.round(mindmapState.zoom * 100)}%`;
  /* Update minimap visibility */
  const minimap = $("#mmMinimap");
  if (minimap) minimap.classList.toggle("visible", mindmapState.zoom > 1);
  updateMinimap();
}

/* ── Minimap ── */
function updateMinimap() {
  const stage = $("#mmStage");
  const minimap = $("#mmMinimap");
  const viewport = $("#mmMinimapViewport");
  const container = $("#mmZoom");
  if (!stage || !minimap || !viewport || !container) return;
  if (mindmapState.zoom <= 1) return;

  const mmImg = minimap.querySelector(".minimap-bg");
  if (!mmImg) return;
  const mmW = minimap.offsetWidth;
  const mmH = minimap.offsetHeight;
  if (!mmW || !mmH) return;

  const contentW = container.scrollWidth * mindmapState.zoom;
  const contentH = container.scrollHeight * mindmapState.zoom;
  if (!contentW || !contentH) return;

  const vpW = stage.clientWidth / contentW * mmW;
  const vpH = stage.clientHeight / contentH * mmH;
  const vpX = stage.scrollLeft / contentW * mmW;
  const vpY = stage.scrollTop / contentH * mmH;

  viewport.style.left = `${vpX}px`;
  viewport.style.top = `${vpY}px`;
  viewport.style.width = `${Math.min(vpW, mmW)}px`;
  viewport.style.height = `${Math.min(vpH, mmH)}px`;
}

/* ── Search ── */
function doMindmapSearch(query) {
  const resultsEl = $("#mmSearchResults");
  if (!resultsEl) return;
  if (!query || query.length < 1) {
    resultsEl.classList.remove("open");
    resultsEl.innerHTML = "";
    return;
  }
  const results = mindmapSearchResults(query);
  if (!results.length) {
    resultsEl.innerHTML = `<div class="search-empty">未找到匹配节点</div>`;
    resultsEl.classList.add("open");
    return;
  }
  resultsEl.innerHTML = results
    .map(
      (r) => `<div class="search-item" data-search-slide="${r.slide}" data-search-node="${r.node.id}">
        <span class="slide-badge">${r.slide}</span>
        <span class="node-text">${escapeHtml(r.node.text)}</span>
      </div>`
    )
    .join("");
  resultsEl.classList.add("open");
}

function renderCheck() {
  const summary = state.data.buildSummary;
  const coverage = state.data.coverage;
  const failures = state.data.choiceQuestions.filter((q) => q.parseError);
  $("#page-check").innerHTML = `<div class="band stats-grid">
    ${stat("Word 总段落", summary.wordTotalParagraphs)}
    ${stat("覆盖段落", summary.wordCoveredParagraphs)}
    ${stat("未覆盖段落", summary.wordUncoveredParagraphs)}
    ${stat("选择题解析失败", summary.choiceParseFailures)}
  </div>
  <div class="band panel">
    <h2>原始文件列表</h2>
    <div class="source-list">${state.data.sourceManifest
      .map(
        (row) =>
          `<div class="source-row"><strong>${escapeHtml(row.name)}</strong><p class="muted">${
            row.found ? `${escapeHtml(row.path)} · ${row.size} bytes` : "未找到"
          }</p></div>`
      )
      .join("")}</div>
  </div>
  <div class="band panel">
    <h2>Word 覆盖率报告</h2>
    <p>${coverage.coveredParagraphs} / ${coverage.totalParagraphs} 段已覆盖。</p>
    <div class="check-list">${
      coverage.uncoveredParagraphs.length
        ? coverage.uncoveredParagraphs.map((row) => `<div class="check-row">#${row.index} ${escapeHtml(row.text)}</div>`).join("")
        : `<div class="check-row">没有未覆盖段落。</div>`
    }</div>
  </div>
  <div class="band panel">
    <h2>解析失败选择题</h2>
    <div class="check-list">${
      failures.length
        ? failures.map((q) => `<div class="check-row"><strong>${q.id}</strong><pre class="raw-block">${escapeHtml(q.raw)}</pre></div>`).join("")
        : `<div class="check-row">没有解析失败的选择题。</div>`
    }</div>
  </div>
  <div class="band panel">
    <h2>开发说明</h2>
    <p>抽取脚本位于 scripts/。源目录实际为 source/，脚本同时兼容 source/、sources/ 与根目录。思维导图图片由 PPTX XML 坐标离线重绘生成。</p>
  </div>`;
}

function renderCurrentPage() {
  if (state.page === "home") renderHome();
  if (state.page === "recite") renderRecite();
  if (state.page === "cards") renderCardsPage();
  if (state.page === "short") renderShort();
  if (state.page === "choice") renderChoice();
  if (state.page === "mindmap") renderMindmap();
  if (state.page === "check") renderCheck();
}

function setPage(page) {
  state.page = page;
  $$(".page").forEach((el) => el.classList.toggle("active", el.id === `page-${page}`));
  $$(".nav-tabs button").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === page));
  renderCurrentPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function attachEvents() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      /* Close search results when clicking outside */
      const results = $("#mmSearchResults");
      if (results && !event.target.closest(".mindmap-search-wrap")) {
        results.classList.remove("open");
      }
      return;
    }
    if (button.dataset.page) setPage(button.dataset.page);
    if (button.dataset.go) setPage(button.dataset.go);
    if (button.dataset.mode) {
      state.reciteMode = button.dataset.mode;
      renderRecite();
    }
    if (button.dataset.single) {
      const filtered = filterCards("recite");
      state.singleIndex = button.dataset.single === "next" ? Math.min(state.singleIndex + 1, filtered.length - 1) : Math.max(state.singleIndex - 1, 0);
      renderRecite();
    }
    if (button.dataset.action === "toggle-card") {
      button.closest(".reader-card")?.classList.toggle("collapsed");
    }
    if (button.dataset.action === "reveal-cloze") {
      button.classList.add("revealed");
    }
    if (button.dataset.action === "reveal-card-clozes") {
      button
        .closest(".reader-card")
        ?.querySelectorAll(".cloze-mask")
        .forEach((item) => item.classList.add("revealed"));
    }
    if (button.dataset.action === "hide-card-clozes") {
      button
        .closest(".reader-card")
        ?.querySelectorAll(".cloze-mask")
        .forEach((item) => item.classList.remove("revealed"));
    }
    if (button.dataset.action === "card-status") {
      const card = button.closest(".reader-card");
      if (card) setCardStatus(card.dataset.cardId, button.dataset.status);
    }
    if (button.dataset.action === "question-status") {
      setQuestionStatus(button.dataset.qid, button.dataset.status);
    }
    if (button.dataset.toggle) {
      $(button.dataset.toggle)?.classList.toggle("hidden");
    }
    if (button.dataset.openCard) {
      state.page = "recite";
      state.reciteMode = "single";
      state.singleIndex = state.data.cards.findIndex((card) => card.id === button.dataset.openCard);
      setPage("recite");
    }
    if (button.dataset.node) {
      state.activeNodeId = button.dataset.node;
      mindmapState.highlightNodeId = "";
      mindmapState.cardsExpanded = true;
      renderMindmap();
    }
    /* ── Mindmap-specific actions ── */
    if (button.dataset.mmAction) {
      const action = button.dataset.mmAction;
      if (action === "zoom-in") setZoom(mindmapState.zoom + ZOOM_STEP);
      if (action === "zoom-out") setZoom(mindmapState.zoom - ZOOM_STEP);
      if (action === "zoom-reset") {
        mindmapState.zoom = 1;
        const container = $("#mmZoom");
        if (container) container.style.transform = `scale(1)`;
        const label = $(".zoom-label");
        if (label) label.textContent = "100%";
        const minimap = $("#mmMinimap");
        if (minimap) minimap.classList.remove("visible");
      }
      if (action === "prev-page") {
        if (state.activeSlide > 1) {
          state.activeSlide--;
          state.activeNodeId = "";
          mindmapState.highlightNodeId = "";
          mindmapState.zoom = 1;
          renderMindmap();
        }
      }
      if (action === "next-page") {
        const total = state.data.mindmap.slides.length;
        if (state.activeSlide < total) {
          state.activeSlide++;
          state.activeNodeId = "";
          mindmapState.highlightNodeId = "";
          mindmapState.zoom = 1;
          renderMindmap();
        }
      }
      if (action === "toggle-fullscreen") {
        mindmapState.isFullscreen = !mindmapState.isFullscreen;
        mindmapState.sidebarVisible = true;
        renderMindmap();
      }
      if (action === "toggle-sidebar") {
        mindmapState.sidebarVisible = !mindmapState.sidebarVisible;
        const sidebar = $("#mmSidebar");
        const toggle = $("#mmSidebarToggle");
        if (sidebar) sidebar.classList.toggle("sidebar-hidden", !mindmapState.sidebarVisible);
        if (toggle) toggle.textContent = mindmapState.sidebarVisible ? "◁ 隐藏" : "▷ 侧栏";
      }
    }
    /* ── Expand/collapse linked cards ── */
    if (button.dataset.action === "expand-linked") {
      mindmapState.cardsExpanded = true;
      renderMindmap();
    }
    if (button.dataset.action === "collapse-linked") {
      mindmapState.cardsExpanded = false;
      renderMindmap();
    }
  });

  /* ── Search result click ── */
  document.addEventListener("click", (event) => {
    const item = event.target.closest(".search-item");
    if (!item) return;
    const slideNum = Number(item.dataset.searchSlide);
    const nodeId = item.dataset.searchNode;
    state.activeSlide = slideNum;
    state.activeNodeId = nodeId;
    mindmapState.highlightNodeId = nodeId;
    mindmapState.cardsExpanded = true;
    mindmapState.zoom = 1;
    const results = $("#mmSearchResults");
    if (results) results.classList.remove("open");
    renderMindmap();
    /* After render, scroll the hotspot into view */
    requestAnimationFrame(() => {
      const hotspot = $(`button.hotspot[data-node="${nodeId}"]`);
      if (hotspot) {
        hotspot.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
      /* Remove highlight after animation */
      setTimeout(() => {
        mindmapState.highlightNodeId = "";
        if (hotspot) hotspot.classList.remove("highlight-pulse");
      }, 2500);
    });
  });

  document.addEventListener("change", (event) => {
    if (event.target.closest("#reciteFilters")) {
      formValues("reciteFilters", "recite");
      renderRecite();
    }
    if (event.target.closest("#cardFilters")) {
      formValues("cardFilters", "cards");
      renderCardsPage();
    }
    if (event.target.closest("#shortFilters")) {
      formValues("shortFilters", "short");
      renderShort();
    }
    if (event.target.closest("#choiceFilters")) {
      formValues("choiceFilters", "choice");
      renderChoice();
    }
    if (event.target.id === "slideSelect") {
      state.activeSlide = Number(event.target.value);
      state.activeNodeId = "";
      mindmapState.highlightNodeId = "";
      mindmapState.zoom = 1;
      renderMindmap();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.closest("#reciteFilters")) {
      formValues("reciteFilters", "recite");
      renderRecite();
    }
    if (event.target.closest("#cardFilters")) {
      formValues("cardFilters", "cards");
      renderCardsPage();
    }
    if (event.target.closest("#shortFilters")) {
      formValues("shortFilters", "short");
      renderShort();
    }
    if (event.target.closest("#choiceFilters")) {
      formValues("choiceFilters", "choice");
      renderChoice();
    }
    /* ── Mindmap search input ── */
    if (event.target.id === "mmSearch") {
      mindmapState.searchQuery = event.target.value;
      doMindmapSearch(mindmapState.searchQuery);
    }
  });

  /* ── Ctrl+Scroll wheel zoom ── */
  document.addEventListener("wheel", (event) => {
    if (!event.target.closest("#mmStage")) return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const stage = $("#mmStage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(mindmapState.zoom + delta, true, stage, mx, my);
  }, { passive: false });

  /* ── Drag to pan ── */
  document.addEventListener("mousedown", (event) => {
    const stage = event.target.closest("#mmStage");
    if (!stage) return;
    if (event.target.closest("button")) return;
    if (event.target.closest(".minimap")) return;
    if (mindmapState.zoom <= 1) return;
    mindmapState.isDragging = true;
    mindmapState.dragStartX = event.clientX;
    mindmapState.dragStartY = event.clientY;
    mindmapState.scrollStartX = stage.scrollLeft;
    mindmapState.scrollStartY = stage.scrollTop;
    const container = $("#mmZoom");
    if (container) container.classList.add("dragging");
    event.preventDefault();
  });

  document.addEventListener("mousemove", (event) => {
    if (!mindmapState.isDragging) return;
    const stage = $("#mmStage");
    if (!stage) return;
    const dx = event.clientX - mindmapState.dragStartX;
    const dy = event.clientY - mindmapState.dragStartY;
    stage.scrollLeft = mindmapState.scrollStartX - dx;
    stage.scrollTop = mindmapState.scrollStartY - dy;
    updateMinimap();
  });

  document.addEventListener("mouseup", () => {
    if (!mindmapState.isDragging) return;
    mindmapState.isDragging = false;
    const container = $("#mmZoom");
    if (container) container.classList.remove("dragging");
  });

  /* ── Minimap click navigation ── */
  document.addEventListener("mousedown", (event) => {
    const minimap = event.target.closest("#mmMinimap");
    if (!minimap) return;
    event.preventDefault();
    event.stopPropagation();
    navigateViaMinimap(event, minimap);
  });

  document.addEventListener("mousemove", (event) => {
    if (!event.buttons) return;
    const minimap = event.target.closest("#mmMinimap");
    if (!minimap) return;
    navigateViaMinimap(event, minimap);
  });

  /* ── Stage scroll → update minimap ── */
  document.addEventListener("scroll", () => {
    updateMinimap();
  }, true);

  /* ── Keyboard shortcuts ── */
  document.addEventListener("keydown", (event) => {
    if (state.page !== "mindmap") return;
    /* Don't capture when typing in inputs */
    if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.tagName === "SELECT") return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (state.activeSlide > 1) {
        state.activeSlide--;
        state.activeNodeId = "";
        mindmapState.highlightNodeId = "";
        mindmapState.zoom = 1;
        renderMindmap();
      }
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const total = state.data.mindmap.slides.length;
      if (state.activeSlide < total) {
        state.activeSlide++;
        state.activeNodeId = "";
        mindmapState.highlightNodeId = "";
        mindmapState.zoom = 1;
        renderMindmap();
      }
    }
    if (event.key === "Escape" && mindmapState.isFullscreen) {
      mindmapState.isFullscreen = false;
      renderMindmap();
    }
  });
}

function navigateViaMinimap(event, minimap) {
  const stage = $("#mmStage");
  const container = $("#mmZoom");
  if (!stage || !container) return;
  const mmImg = minimap.querySelector(".minimap-bg");
  if (!mmImg) return;
  const rect = minimap.getBoundingClientRect();
  const mx = (event.clientX - rect.left) / rect.width;
  const my = (event.clientY - rect.top) / rect.height;
  const contentW = container.scrollWidth * mindmapState.zoom;
  const contentH = container.scrollHeight * mindmapState.zoom;
  stage.scrollLeft = mx * contentW - stage.clientWidth / 2;
  stage.scrollTop = my * contentH - stage.clientHeight / 2;
  updateMinimap();
}

function setupLogin() {
  const unlocked = localStorage.getItem("mayuan.unlocked") === "true";
  if (unlocked) {
    $("#lock").classList.add("hidden");
    $("#app").classList.remove("hidden");
  }
  $("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if ($("#passwordInput").value === "mayuan") {
      localStorage.setItem("mayuan.unlocked", "true");
      $("#lock").classList.add("hidden");
      $("#app").classList.remove("hidden");
    } else {
      $("#loginError").textContent = "密码不正确。";
    }
  });
}

async function boot() {
  setupLogin();
  await loadData();
  attachEvents();
  renderCurrentPage();
}

boot().catch((error) => {
  document.body.innerHTML = `<pre class="raw-block">${escapeHtml(error.stack || error.message)}</pre>`;
});
