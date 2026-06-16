const DATA_FILES = {
  cards: "data/recite_cards.json",
  shortQuestions: "data/short_questions.json",
  choiceQuestions: "data/choice_questions.json",
  mindmap: "data/mindmap.json",
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

function renderCard(card, compact = false) {
  const status = cardStatusMap()[card.id] || "";
  const collapsed = status === "mastered" || status === "studied";
  return `<article class="reader-card ${compact ? "grid" : ""} ${status || ""} ${collapsed ? "collapsed" : ""}" data-card-id="${
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
    <ol>${card.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
    <div class="button-row">
      <button data-action="toggle-card">显示/隐藏内容</button>
      <button data-action="card-status" data-status="mastered" class="${status === "mastered" ? "primary" : ""}">已会背</button>
      <button data-action="card-status" data-status="studied" class="${status === "studied" ? "primary" : ""}">已学过</button>
      <button data-action="card-status" data-status="notyet" class="${status === "notyet" ? "primary" : ""}">还不会</button>
    </div>
  </article>`;
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

function renderMindmap() {
  const mindmap = state.data.mindmap;
  const slide = mindmap.slides.find((item) => item.slide === state.activeSlide) || mindmap.slides[0];
  if (!state.activeNodeId && slide.nodes[0]) state.activeNodeId = slide.nodes[0].id;
  const activeNode = slide.nodes.find((node) => node.id === state.activeNodeId) || slide.nodes[0];
  $("#page-mindmap").innerHTML = `<div class="controls">
    <div class="filter-grid">
      <select id="slideSelect">${mindmap.slides
        .map((item) => `<option value="${item.slide}" ${item.slide === slide.slide ? "selected" : ""}>第 ${item.slide} 页</option>`)
        .join("")}</select>
      <span class="muted">${mindmap.pageCount} 页 · ${mindmap.nodeCount} 个节点</span>
    </div>
  </div>
  <div class="mindmap-layout">
    <div class="mindmap-stage">
      <img src="${escapeHtml(slide.image)}" alt="第 ${slide.slide} 页思维导图" />
      ${slide.nodes
        .map(
          (node) =>
            `<button class="hotspot ${node.id === activeNode?.id ? "active" : ""}" data-node="${node.id}" style="left:${node.x * 100}%;top:${
              node.y * 100
            }%;width:${Math.max(node.w * 100, 2)}%;height:${Math.max(node.h * 100, 2)}%;" title="${escapeHtml(node.text)}"></button>`
        )
        .join("")}
    </div>
    <aside class="panel">
      <h2>本页节点</h2>
      <div class="node-list">${slide.nodes
        .map((node) => `<button class="chip ${node.id === activeNode?.id ? "active" : ""}" data-node="${node.id}">${escapeHtml(node.text)}</button>`)
        .join("")}</div>
      <h3>${activeNode ? escapeHtml(activeNode.text) : "暂无节点"}</h3>
      ${activeNode ? linkedCardsHtml(getLinks(activeNode.id)) : ""}
    </aside>
  </div>`;
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
    if (!button) return;
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
      renderMindmap();
    }
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
  });
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
