const STORAGE_KEY = "bd-workbench-v1";
const CURRENT_USER = "local-user";

const seedState = {
  users: [
    {
      id: CURRENT_USER,
      name: "本地用户",
      role: "管理员",
    },
  ],
  creators: [],
  scripts: [],
  records: [],
};

const state = loadState();

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const dom = {
  introScreen: $("#introScreen"),
  enterWorkbenchBtn: $("#enterWorkbenchBtn"),
  workspaceRoot: $("#workspaceRoot"),
  tabs: document.querySelectorAll(".tab-button"),
  panels: {
    scripts: $("#scriptsPanel"),
    tasks: $("#tasksPanel"),
    creators: $("#creatorsPanel"),
    records: $("#recordsPanel"),
  },
  scriptForm: $("#scriptForm"),
  creatorForm: $("#creatorForm"),
  recordForm: $("#recordForm"),
  scriptsTable: $("#scriptsTable"),
  creatorCards: $("#creatorCards"),
  recordsTable: $("#recordsTable"),
  taskGrid: $("#taskGrid"),
  scriptCreatorSelect: $("#scriptCreatorSelect"),
  recordCreatorSelect: $("#recordCreatorSelect"),
  recordScriptSelect: $("#recordScriptSelect"),
  summaryCreatorSelect: $("#summaryCreatorSelect"),
  summaryOutput: $("#summaryOutput"),
};

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        users: parsed.users || seedState.users,
        creators: parsed.creators || [],
        scripts: parsed.scripts || [],
        records: parsed.records || [],
      };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return structuredClone(seedState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
}

function auditFields(ownerId = "") {
  const timestamp = nowIso();
  return {
    ownerId,
    createdBy: CURRENT_USER,
    updatedBy: CURRENT_USER,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function touch(item) {
  item.updatedBy = CURRENT_USER;
  item.updatedAt = nowIso();
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function creatorName(id) {
  return state.creators.find((creator) => creator.id === id)?.name || "未分配";
}

function scriptTitle(id) {
  return state.scripts.find((script) => script.id === id)?.title || "未关联脚本";
}

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linkHtml(url, label) {
  if (!url) return "-";
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>`;
}

function statusPill(status) {
  const className = status === "未给达人" || status === "未结算" ? "warning" : status === "已结算" || status === "已回传视频链接" ? "success" : "";
  return `<span class="pill ${className}">${escapeHtml(status)}</span>`;
}

function renderAll() {
  renderSelects();
  renderMetrics();
  renderScripts();
  renderCreators();
  renderRecords();
  renderTasks();
}

function renderSelects() {
  const creatorOptions = state.creators
    .map((creator) => `<option value="${creator.id}">${escapeHtml(creator.name)}</option>`)
    .join("");
  dom.scriptCreatorSelect.innerHTML = `<option value="">未分配达人</option>${creatorOptions}`;
  dom.recordCreatorSelect.innerHTML = creatorOptions || `<option value="">请先新增达人</option>`;
  dom.summaryCreatorSelect.innerHTML = `<option value="">选择达人</option>${creatorOptions}`;

  dom.recordScriptSelect.innerHTML = `<option value="">不关联脚本</option>${state.scripts
    .map((script) => `<option value="${script.id}">${escapeHtml(script.title)}</option>`)
    .join("")}`;
}

function renderMetrics() {
  $("#metricScripts").textContent = state.scripts.length;
  $("#metricCreators").textContent = state.creators.length;
  $("#metricWeekPosts").textContent = recordsThisWeek().reduce((sum, record) => sum + Number(record.postCount || 0), 0);
  $("#metricPendingSettlements").textContent = state.records.filter((record) => record.settlementStatus === "未结算").length;
}

function renderScripts() {
  const keyword = $("#scriptSearch").value.trim().toLowerCase();
  const rows = state.scripts
    .filter((script) => {
      const haystack = [script.title, script.status, script.ownerId, script.creatorVideoUrl, creatorName(script.creatorId)].join(" ").toLowerCase();
      return haystack.includes(keyword);
    })
    .map(
      (script) => `
        <tr>
          <td><strong>${escapeHtml(script.title)}</strong><br><small>${escapeHtml(script.notes || "")}</small></td>
          <td>${statusPill(script.status)}</td>
          <td>${escapeHtml(creatorName(script.creatorId))}</td>
          <td>${escapeHtml(script.ownerId || "-")}</td>
          <td class="link-list">${linkHtml(script.creatorVideoUrl, "回传链接")}</td>
          <td>${formatDateTime(script.updatedAt)}</td>
          <td class="row-actions">
            <button class="small-button" data-action="advance-script" data-id="${script.id}" type="button">推进</button>
            <button class="small-button danger" data-action="delete-script" data-id="${script.id}" type="button">删除</button>
          </td>
        </tr>
      `,
    )
    .join("");
  dom.scriptsTable.innerHTML = rows || emptyRow();
}

function renderCreators() {
  const keyword = $("#creatorSearch").value.trim().toLowerCase();
  const cards = state.creators
    .filter((creator) => [creator.name, creator.platform, creator.account, creator.contact, creator.address, creator.ownerId].join(" ").toLowerCase().includes(keyword))
    .map((creator) => {
      const weeklyPosts = recordsThisWeek().filter((record) => record.creatorId === creator.id);
      const postCount = weeklyPosts.reduce((sum, record) => sum + Number(record.postCount || 0), 0);
      const days = [...new Set(weeklyPosts.map((record) => record.publishedAt))].sort().join("、") || "本周暂无";
      return `
        <article class="creator-card">
          <h3>${escapeHtml(creator.name)}</h3>
          <p>${escapeHtml(creator.platform || "未填平台")} / ${escapeHtml(creator.account || "未填账号")}</p>
          <p>联系方式：${escapeHtml(creator.contact || "-")}</p>
          <p>达人地址：${escapeHtml(creator.address || "-")}</p>
          <p>负责人：${escapeHtml(creator.ownerId || "-")}</p>
          <p>结算方式：${escapeHtml(creator.settlementMethod || "-")}</p>
          <p>本周发布：${postCount} 条；日期：${escapeHtml(days)}</p>
          <p>${escapeHtml(creator.notes || "")}</p>
          <div class="row-actions">
            <button class="small-button danger" data-action="delete-creator" data-id="${creator.id}" type="button">删除</button>
          </div>
        </article>
      `;
    })
    .join("");
  dom.creatorCards.innerHTML = cards || `<div class="empty-state">暂无达人，先新增一位吧。</div>`;
}

function renderRecords() {
  const rows = [...state.records]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map(
      (record) => `
        <tr>
          <td>${escapeHtml(creatorName(record.creatorId))}<br><small>${escapeHtml(scriptTitle(record.scriptId))}</small></td>
          <td>${escapeHtml(record.publishedAt)}</td>
          <td>${Number(record.postCount || 0)}</td>
          <td>${linkHtml(record.publishUrl, "发布链接")}</td>
          <td>${statusPill(record.settlementStatus)}<br><small>${record.settlementAmount ? `¥${escapeHtml(record.settlementAmount)}` : ""}</small></td>
          <td>${escapeHtml(record.ownerId || "-")}</td>
          <td class="row-actions">
            <button class="small-button" data-action="toggle-settlement" data-id="${record.id}" type="button">切换结算</button>
            <button class="small-button danger" data-action="delete-record" data-id="${record.id}" type="button">删除</button>
          </td>
        </tr>
      `,
    )
    .join("");
  dom.recordsTable.innerHTML = rows || emptyRow();
}

function renderTasks() {
  const owner = $("#taskOwnerFilter").value.trim();
  const byOwner = (item) => !owner || (item.ownerId || "").includes(owner);
  const undistributed = state.scripts.filter((script) => script.status === "未给达人" && byOwner(script));
  const waitingLinks = state.scripts.filter((script) => script.status === "已给达人" && !script.creatorVideoUrl && byOwner(script));
  const pendingSettlements = state.records.filter((record) => record.settlementStatus === "未结算" && byOwner(record));
  const activeCreatorIds = new Set(recordsThisWeek().map((record) => record.creatorId));
  const quietCreators = state.creators.filter((creator) => !activeCreatorIds.has(creator.id) && byOwner(creator));

  dom.taskGrid.innerHTML = [
    taskCard("脚本未给达人", undistributed.map((script) => script.title)),
    taskCard("已给达人但未回传链接", waitingLinks.map((script) => `${script.title} / ${creatorName(script.creatorId)}`)),
    taskCard("本周未发布达人", quietCreators.map((creator) => creator.name)),
    taskCard("待结算发布记录", pendingSettlements.map((record) => `${creatorName(record.creatorId)} ${record.publishedAt} ${record.postCount} 条`)),
  ].join("");
}

function taskCard(title, items) {
  const content = items.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>暂无待办</li>";
  return `<article class="task-card"><h3>${title}</h3><ul>${content}</ul></article>`;
}

function emptyRow() {
  return $("#emptyStateTemplate").innerHTML;
}

function recordsThisWeek() {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return state.records.filter((record) => {
    const date = new Date(`${record.publishedAt}T00:00:00`);
    return date >= start && date < end;
  });
}

function addRecord(collection, payload) {
  state[collection].push({
    id: uid(collection),
    ...payload,
    ...auditFields(payload.ownerId),
  });
  saveState();
  renderAll();
}

dom.tabs.forEach((button) => {
  button.addEventListener("click", () => {
    dom.tabs.forEach((tab) => tab.classList.remove("active"));
    Object.values(dom.panels).forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    dom.panels[button.dataset.tab].classList.add("active");
  });
});

dom.creatorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addRecord("creators", formToObject(dom.creatorForm));
  dom.creatorForm.reset();
});

dom.scriptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addRecord("scripts", formToObject(dom.scriptForm));
  dom.scriptForm.reset();
});

dom.recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const payload = formToObject(dom.recordForm);
  payload.postCount = Number(payload.postCount || 1);
  addRecord("records", payload);
  dom.recordForm.reset();
  dom.recordForm.publishedAt.value = todayIsoDate();
});

document.body.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;

  if (action === "delete-script") state.scripts = state.scripts.filter((script) => script.id !== id);
  if (action === "delete-creator") {
    state.creators = state.creators.filter((creator) => creator.id !== id);
    state.scripts.forEach((script) => {
      if (script.creatorId === id) script.creatorId = "";
    });
  }
  if (action === "delete-record") state.records = state.records.filter((record) => record.id !== id);
  if (action === "advance-script") {
    const script = state.scripts.find((item) => item.id === id);
    if (script) {
      const next = {
        未给达人: "已给达人",
        已给达人: "已回传视频链接",
        已回传视频链接: "未给达人",
      };
      script.status = next[script.status];
      touch(script);
    }
  }
  if (action === "toggle-settlement") {
    const record = state.records.find((item) => item.id === id);
    if (record) {
      record.settlementStatus = record.settlementStatus === "已结算" ? "未结算" : "已结算";
      touch(record);
    }
  }

  saveState();
  renderAll();
});

["scriptSearch", "creatorSearch", "taskOwnerFilter"].forEach((id) => {
  $(`#${id}`).addEventListener("input", renderAll);
});

$("#generateSummaryBtn").addEventListener("click", () => {
  const creatorId = dom.summaryCreatorSelect.value;
  if (!creatorId) {
    dom.summaryOutput.value = "请先选择一个达人。";
    return;
  }
  const start = $("#summaryStart").value;
  const end = $("#summaryEnd").value;
  const creator = creatorName(creatorId);
  const records = state.records
    .filter((record) => record.creatorId === creatorId)
    .filter((record) => !start || record.publishedAt >= start)
    .filter((record) => !end || record.publishedAt <= end)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

  if (!records.length) {
    dom.summaryOutput.value = `${creator} 在所选时间范围内暂无发布记录。`;
    return;
  }

  const total = records.reduce((sum, record) => sum + Number(record.postCount || 0), 0);
  const lines = records.map((record) => {
    const url = record.publishUrl ? `，链接：${record.publishUrl}` : "";
    const amount = record.settlementAmount ? `，金额：¥${record.settlementAmount}` : "";
    return `${record.publishedAt} 发布 ${record.postCount} 条，${record.settlementStatus}${amount}${url}`;
  });
  dom.summaryOutput.value = `${creator} 发布汇总\n时间范围：${start || "不限"} 至 ${end || "不限"}\n总计：${total} 条\n\n${lines.join("\n")}`;
});

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bd-workbench-${todayIsoDate()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

$("#importInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    state.users = imported.users || seedState.users;
    state.creators = imported.creators || [];
    state.scripts = imported.scripts || [];
    state.records = imported.records || [];
    saveState();
    renderAll();
  } catch {
    alert("导入失败，请确认是有效 JSON 文件。");
  } finally {
    event.target.value = "";
  }
});

$("#resetBtn").addEventListener("click", () => {
  if (!confirm("确定清空当前本地数据吗？")) return;
  state.users = structuredClone(seedState.users);
  state.creators = [];
  state.scripts = [];
  state.records = [];
  saveState();
  renderAll();
});

initMaskedHeading();
initIntro();
dom.recordForm.publishedAt.value = todayIsoDate();
renderAll();

function initMaskedHeading() {
  const headings = document.querySelectorAll("[data-masked-heading]");
  if (!headings.length) return;

  headings.forEach((heading) => setupMaskedHeading(heading));
}

function setupMaskedHeading(heading) {

  const text = heading.querySelector(".masked-heading__text");
  const media = heading.querySelector(".masked-heading__media");
  if (!text || !media) return;

  const parallax = Number(heading.dataset.parallax || 22);
  const drift = Number(heading.dataset.drift || 12);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let raf = 0;
  let start = performance.now();

  const animate = (time) => {
    const elapsed = (time - start) / 1000;
    const idleX = reduceMotion ? 0 : Math.sin(elapsed * 0.28) * drift;
    const idleY = reduceMotion ? 0 : Math.cos(elapsed * 0.22) * drift * 0.48;
    currentX += (targetX + idleX - currentX) * 0.08;
    currentY += (targetY + idleY - currentY) * 0.08;

    media.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0) scale(1.08)`;
    text.style.backgroundPosition = `${50 + currentX * 0.28}% ${50 + currentY * 0.28}%`;
    raf = requestAnimationFrame(animate);
  };

  heading.addEventListener("pointermove", (event) => {
    const rect = heading.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / (rect.width || 1)) * 2 - 1;
    const ny = ((event.clientY - rect.top) / (rect.height || 1)) * 2 - 1;
    targetX = clamp(nx, -1, 1) * -parallax;
    targetY = clamp(ny, -1, 1) * -parallax;
  });

  heading.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
  });

  heading.animate(
    [
      { opacity: 0, transform: "translateY(14px)", clipPath: "inset(0 100% 0 0)" },
      { opacity: 1, transform: "translateY(0)", clipPath: "inset(0 0 0 0)" },
    ],
    { duration: reduceMotion ? 1 : 900, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "both" },
  );

  raf = requestAnimationFrame(animate);
  window.addEventListener("pagehide", () => cancelAnimationFrame(raf), { once: true });
}

function initIntro() {
  if (!dom.introScreen || !dom.enterWorkbenchBtn || !dom.workspaceRoot) return;

  dom.enterWorkbenchBtn.addEventListener("click", () => {
    dom.workspaceRoot.classList.remove("is-hidden");
    dom.workspaceRoot.classList.add("is-entering");
    dom.introScreen.classList.add("is-leaving");

    window.setTimeout(() => {
      dom.introScreen.remove();
      dom.workspaceRoot.classList.remove("is-entering");
    }, 620);
  });
}
