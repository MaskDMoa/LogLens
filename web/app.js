/* ═══════════════════════════════════════════════════════
   LogLens — Application Logic
   Log reader, parser, virtual scroller & UI controller
   ═══════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── Constants ──────────────────────────────────────
  const ITEM_HEIGHT = 34;
  const BUFFER_ITEMS = 30;
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";
  const MCLOGS_RAW = "https://api.mclo.gs/1/raw/";
  const STORAGE_KEY = "loglens_recent";
  const MAX_RECENT = 5;

  // ── Regex patterns ─────────────────────────────────
  const LOG_LINE_RE = /^\[([^\]]+)\]\s+\[([^/]+)\/(\w+)\]\s+\[([^\]]+)\]:?\s*(.*)$/;
  const MOD_LINE_RE = /^\s+(\S+\.jar)\s+\|(.+?)\|(.+?)\|(.+?)\|/;

  // ── DOM Elements ───────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const els = {
    stateInitial:     $("state-initial"),
    stateInvestigation: $("state-investigation"),
    loading:          $("loading"),
    loadingText:      $("loading-text"),
    toast:            $("toast"),

    // Initial
    urlInput:         $("url-input"),
    btnFetch:         $("btn-fetch"),
    btnUpload:        $("btn-upload"),
    btnPaste:         $("btn-paste"),
    dropZone:         $("drop-zone"),
    fileInput:        $("file-input"),
    recentList:       $("recent-list"),
    noRecent:         $("no-recent"),

    // Paste modal
    pasteModal:       $("paste-modal"),
    pasteTextarea:    $("paste-textarea"),
    btnPasteCancel:   $("btn-paste-cancel"),
    btnPasteConfirm:  $("btn-paste-confirm"),

    // Investigation - topbar
    brandBack:        $("brand-back"),
    btnImportNew:     $("btn-import-new"),
    sourceName:       $("source-name"),
    statusDot:        $("status-dot"),
    statusText:       $("status-text"),

    // Investigation - sidebar
    statTotal:        $("stat-total"),
    statMods:         $("stat-mods"),
    statErrors:       $("stat-errors"),
    statWarnings:     $("stat-warnings"),
    envInfo:          $("env-info"),
    envSection:       $("env-section"),
    sevFilter:        $("sev-filter"),
    countInfo:        $("count-info"),
    countWarn:        $("count-warn"),
    countError:       $("count-error"),
    countFatal:       $("count-fatal"),
    countDebug:       $("count-debug"),
    activeFilters:    $("active-filters"),
    noFilters:        $("no-filters"),

    // Investigation - log area
    searchInput:      $("search-input"),
    logCount:         $("log-count"),
    btnWrap:          $("btn-wrap"),
    btnClearFilters:  $("btn-clear-filters"),
    btnScrollBottom:  $("btn-scroll-bottom"),
    logViewport:      $("log-viewport"),
    logSpacer:        $("log-spacer"),
    logEmpty:         $("log-empty"),
    emptyTitle:       $("empty-title"),
    emptySub:         $("empty-sub"),
    newEntriesBanner: $("new-entries-banner"),

    // Investigation - detail panel
    detailPanel:      $("detail-panel"),
    detailClose:      $("detail-close"),
    detailLine:       $("detail-line"),
    detailLevel:      $("detail-level"),
    detailTimestamp:   $("detail-timestamp"),
    detailThread:     $("detail-thread"),
    detailSource:     $("detail-source"),
    detailMessage:    $("detail-message"),
    btnCopyMsg:       $("btn-copy-msg"),
    btnFilterSource:  $("btn-filter-source"),
  };

  // ── Application State ──────────────────────────────
  const state = {
    rawLog: "",
    allEntries: [],      // { line, timestamp, thread, level, source, message, raw }
    filteredEntries: [],
    analysis: null,

    // Filters
    activeLevels: new Set(["INFO", "WARN", "ERROR", "FATAL", "DEBUG", "UNKNOWN"]),
    searchTerm: "",
    sourceFilter: null,

    // UI
    selectedIndex: -1,
    wrapLines: false,
    isAtBottom: true,
    sourceName: "",
  };

  // ═══════════════════════════════════════
  // LOG PARSER
  // ═══════════════════════════════════════

  function normalizeLevel(lvl) {
    const u = lvl.toUpperCase().trim();
    if (u === "INFO") return "INFO";
    if (u === "WARN" || u === "WARNING") return "WARN";
    if (u === "ERROR") return "ERROR";
    if (u === "FATAL") return "FATAL";
    if (u === "DEBUG") return "DEBUG";
    return "UNKNOWN";
  }

  function parseLogLines(rawLog) {
    const lines = rawLog.split("\n");
    const entries = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const m = line.match(LOG_LINE_RE);
      if (m) {
        entries.push({
          line: i + 1,
          timestamp: m[1].trim(),
          thread: m[2].trim(),
          level: normalizeLevel(m[3]),
          source: (() => {
            let s = m[4].trim().replace(/\/$/, "");
            const parts = s.split("/");
            const classPart = parts[0].split(".").pop();
            return parts.length > 1 ? `${classPart}/${parts[1]}` : classPart;
          })(),
          message: m[5].trim(),
          raw: line,
        });
      } else {
        // Attach to previous entry as continuation, or create raw entry
        if (entries.length > 0 && line.startsWith("\t") || line.startsWith("    ")) {
          entries[entries.length - 1].message += "\n" + line;
          entries[entries.length - 1].raw += "\n" + line;
        } else {
          entries.push({
            line: i + 1,
            timestamp: "",
            thread: "",
            level: "UNKNOWN",
            source: "",
            message: line,
            raw: line,
          });
        }
      }
    }

    return entries;
  }

  function parseMods(rawLog) {
    const lines = rawLog.split("\n");
    const mods = [];
    for (const line of lines) {
      const m = line.match(MOD_LINE_RE);
      if (m) {
        mods.push({
          fileName: m[1].trim(),
          name: m[2].trim(),
          modId: m[3].trim(),
          version: m[4].trim(),
        });
      }
    }
    return mods;
  }

  function parseCrash(rawLog) {
    const idx = rawLog.indexOf("---- Minecraft Crash Report ----");
    if (idx === -1) return null;
    const section = rawLog.substring(idx);
    const lines = section.split("\n");
    let description = "", exception = "";
    const stackTrace = [];
    let inStack = false;

    for (const line of lines) {
      if (line.startsWith("Description:")) {
        description = line.replace("Description:", "").trim();
      } else if ((line.includes("Exception") || line.includes("Error:")) && !exception) {
        exception = line.trim();
        inStack = true;
      } else if (inStack && line.trim().startsWith("at ")) {
        stackTrace.push(line.trim());
      } else if (inStack && !line.trim()) {
        inStack = false;
      }
    }
    return { description, exception, stackTrace };
  }

  function extract(rawLog, regex) {
    const m = rawLog.match(regex);
    return m ? m[1].trim() : null;
  }

  function analyzeLog(rawLog) {
    const entries = parseLogLines(rawLog);
    const mods = parseMods(rawLog);
    const crash = parseCrash(rawLog);

    const counts = { INFO: 0, WARN: 0, ERROR: 0, FATAL: 0, DEBUG: 0, UNKNOWN: 0 };
    for (const e of entries) {
      counts[e.level] = (counts[e.level] || 0) + 1;
    }

    return {
      entries,
      mods,
      crash,
      counts,
      minecraftVersion: extract(rawLog, /Minecraft Version:\s*(.+?)(?:\n|\r)/) ||
                         extract(rawLog, /minecraft\s+(\d+\.\d+\.?\d*)/i),
      neoForgeVersion:  extract(rawLog, /NeoForge:\s*(.+?)(?:\n|\r)/) ||
                         extract(rawLog, /neoforge[:\s]+(\d[\d.]+)/i),
      forgeVersion:     extract(rawLog, /FML:\s*(.+?)(?:\n|\r)/),
      javaVersion:      extract(rawLog, /Java Version:\s*(.+?)(?:,|\n|\r)/),
      startupTime:      extract(rawLog, /Game took\s+([\d.]+)\s+seconds?\s+to\s+start/i),
    };
  }

  // ═══════════════════════════════════════
  // LOG FETCHER
  // ═══════════════════════════════════════

  function getLogId(url) {
    let m = url.match(/\/mclogs\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    m = url.match(/mclo\.gs\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    m = url.match(/api\.mclo\.gs\/\d\/raw\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    return null;
  }

  async function fetchLog(url) {
    const id = getLogId(url);
    if (!id) throw new Error("URL inválida. Use uma URL do GnomeBot ou mclo.gs.");

    const rawUrl = MCLOGS_RAW + id;

    // Try direct first
    try {
      const resp = await fetch(rawUrl);
      if (resp.ok) return { content: await resp.text(), name: `mclogs-${id}` };
    } catch (_) {
      // CORS blocked, try proxy
    }

    // Try via CORS proxy
    try {
      const resp = await fetch(CORS_PROXY + encodeURIComponent(rawUrl));
      if (resp.ok) return { content: await resp.text(), name: `mclogs-${id}` };
    } catch (_) {
      // Proxy also failed
    }

    throw new Error("Não foi possível buscar o log. A API pode estar bloqueando CORS. Tente colar o conteúdo manualmente.");
  }

  // ═══════════════════════════════════════
  // CHUNKED RENDERER
  // ═══════════════════════════════════════

  let renderState = {
    chunkSize: 100,
    currentIndex: 0,
    isRendering: false
  };

  function renderVirtualList() {
    // Reset rendering
    els.logSpacer.innerHTML = "";
    renderState.currentIndex = 0;
    renderState.isRendering = false;
    
    if (state.filteredEntries.length === 0) {
      els.logEmpty.classList.remove("hidden");
      return;
    }
    
    els.logEmpty.classList.add("hidden");
    
    // First render - fill enough to scroll
    renderNextChunk();
    renderNextChunk();
  }

  function renderNextChunk() {
    if (renderState.currentIndex >= state.filteredEntries.length) return;
    renderState.isRendering = true;

    const entries = state.filteredEntries;
    const startIdx = renderState.currentIndex;
    const endIdx = Math.min(startIdx + renderState.chunkSize, entries.length);
    
    let html = "";
    for (let i = startIdx; i < endIdx; i++) {
      const e = entries[i];
      const isSelected = i === state.selectedIndex;
      const levelClass = (e.level === "WARN" || e.level === "ERROR" || e.level === "FATAL") ? ` level-${e.level.toLowerCase()}` : "";
      const selectedClass = isSelected ? " selected" : "";
      const wrapClass = state.wrapLines ? " log-wrap" : "";

      const message = state.searchTerm
        ? highlightSearch(escapeHtml(e.message), state.searchTerm)
        : escapeHtml(e.message);

      if (e.timestamp !== "") {
        html += `<div class="log-entry${levelClass}${selectedClass}${wrapClass}" data-idx="${i}">
          <span class="log-entry-line">${e.line}</span>
          <span class="log-entry-timestamp">${escapeHtml(e.timestamp)}</span>
          <span class="log-entry-level"><span class="badge badge-${levelBadge(e.level)}">${e.level}</span></span>
          <span class="log-entry-source" title="${escapeHtml(e.source)}">${escapeHtml(e.source)}</span>
          <span class="log-entry-message">${message}</span>
        </div>`;
      } else {
        html += `<div class="log-entry-raw${selectedClass}${wrapClass}" data-idx="${i}">
          <span class="log-entry-message">${message}</span>
        </div>`;
      }
    }

    // Insert chunk
    els.logSpacer.insertAdjacentHTML("beforeend", html);
    renderState.currentIndex = endIdx;
    renderState.isRendering = false;
  }

  function levelBadge(level) {
    switch (level) {
      case "INFO": return "info";
      case "WARN": return "warn";
      case "ERROR": return "error";
      case "FATAL": return "fatal";
      case "DEBUG": return "debug";
      default: return "debug";
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function highlightSearch(html, term) {
    if (!term) return html;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped})`, "gi");
    return html.replace(re, '<span class="highlight">$1</span>');
  }

  // ═══════════════════════════════════════
  // FILTERING
  // ═══════════════════════════════════════

  function applyFilters() {
    const term = state.searchTerm.toLowerCase();

    state.filteredEntries = state.allEntries.filter((e) => {
      // Level filter
      if (!state.activeLevels.has(e.level)) return false;

      // Source filter
      if (state.sourceFilter && e.source !== state.sourceFilter) return false;

      // Search
      if (term) {
        const hay = (e.message + " " + e.source + " " + e.timestamp).toLowerCase();
        if (!hay.includes(term)) return false;
      }

      return true;
    });

    updateFilterUI();
    updateLogCount();
    renderVirtualList();
  }

  function updateFilterUI() {
    const container = els.activeFilters;
    let html = "";

    if (state.searchTerm) {
      html += `<span class="filter-tag">Busca: "${escapeHtml(state.searchTerm)}" <button class="filter-tag-remove" data-action="clear-search">×</button></span>`;
    }
    if (state.sourceFilter) {
      html += `<span class="filter-tag">Origem: ${escapeHtml(state.sourceFilter)} <button class="filter-tag-remove" data-action="clear-source">×</button></span>`;
    }

    const allChecked = state.activeLevels.size >= 6;
    if (!allChecked) {
      for (const lvl of state.activeLevels) {
        if (lvl === "UNKNOWN") continue;
        html += `<span class="filter-tag">${lvl}</span>`;
      }
    }

    if (!html) {
      els.noFilters.style.display = "";
    } else {
      els.noFilters.style.display = "none";
    }
    container.innerHTML = html + (els.noFilters.style.display === "" ? '<span class="no-filters-text">Nenhum filtro aplicado</span>' : "");

    // Click handlers for remove buttons
    container.querySelectorAll(".filter-tag-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === "clear-search") {
          state.searchTerm = "";
          els.searchInput.value = "";
        } else if (action === "clear-source") {
          state.sourceFilter = null;
        }
        applyFilters();
      });
    });
  }

  function updateLogCount() {
    const total = state.filteredEntries.length;
    const all = state.allEntries.length;
    if (total === all) {
      els.logCount.textContent = `${total.toLocaleString()} entradas`;
    } else {
      els.logCount.textContent = `${total.toLocaleString()} de ${all.toLocaleString()}`;
    }
  }

  // ═══════════════════════════════════════
  // UI STATE MANAGEMENT
  // ═══════════════════════════════════════

  function showLoading(text) {
    els.loadingText.textContent = text || "Carregando...";
    els.loading.classList.add("active");
  }

  function hideLoading() {
    els.loading.classList.remove("active");
  }

  function showToast(msg, duration = 4000) {
    els.toast.textContent = msg;
    els.toast.classList.add("visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => els.toast.classList.remove("visible"), duration);
  }

  function switchToInitial() {
    els.stateInvestigation.classList.remove("active");
    els.stateInitial.style.display = "";
    state.rawLog = "";
    state.allEntries = [];
    state.filteredEntries = [];
    state.analysis = null;
    state.selectedIndex = -1;
    state.searchTerm = "";
    state.sourceFilter = null;
    els.searchInput.value = "";
    els.detailPanel.classList.remove("active");
  }

  function switchToInvestigation(rawLog, name) {
    showLoading("Analisando log...");

    // Use setTimeout to let the loading overlay render
    setTimeout(() => {
      state.rawLog = rawLog;
      state.sourceName = name;
      state.analysis = analyzeLog(rawLog);
      state.allEntries = state.analysis.entries;
      state.selectedIndex = -1;
      state.searchTerm = "";
      state.sourceFilter = null;

      // Reset level filters
      state.activeLevels = new Set(["INFO", "WARN", "ERROR", "FATAL", "DEBUG", "UNKNOWN"]);
      els.sevFilter.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
      });

      populateSidebar();
      applyFilters();

      els.stateInitial.style.display = "none";
      els.stateInvestigation.classList.add("active");
      els.sourceName.textContent = name;
      els.detailPanel.classList.remove("active");

      // Scroll to bottom
      requestAnimationFrame(() => {
        els.logViewport.scrollTop = els.logViewport.scrollHeight;
        hideLoading();
      });

      saveRecent(name);
    }, 50);
  }

  function populateSidebar() {
    const a = state.analysis;
    if (!a) return;

    els.statTotal.textContent = a.entries.length.toLocaleString();
    els.statMods.textContent = a.mods.length.toLocaleString();
    els.statErrors.textContent = (a.counts.ERROR + a.counts.FATAL).toLocaleString();
    els.statWarnings.textContent = a.counts.WARN.toLocaleString();

    // Severity counts
    els.countInfo.textContent = a.counts.INFO.toLocaleString();
    els.countWarn.textContent = a.counts.WARN.toLocaleString();
    els.countError.textContent = a.counts.ERROR.toLocaleString();
    els.countFatal.textContent = a.counts.FATAL.toLocaleString();
    els.countDebug.textContent = (a.counts.DEBUG + a.counts.UNKNOWN).toLocaleString();

    // Environment info
    const envParts = [];
    const ICONS = {
      cube: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
      wrench: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`,
      coffee: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`,
      clock: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
      alert: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    };

    if (a.minecraftVersion) envParts.push(`<span class="env-item">${ICONS.cube} Minecraft ${a.minecraftVersion}</span>`);
    if (a.neoForgeVersion)  envParts.push(`<span class="env-item">${ICONS.wrench} NeoForge ${a.neoForgeVersion}</span>`);
    else if (a.forgeVersion) envParts.push(`<span class="env-item">${ICONS.wrench} FML ${a.forgeVersion}</span>`);
    if (a.javaVersion)      envParts.push(`<span class="env-item">${ICONS.coffee} Java ${a.javaVersion}</span>`);
    if (a.startupTime)      envParts.push(`<span class="env-item">${ICONS.clock} ${a.startupTime}s para iniciar</span>`);
    if (a.crash)            envParts.push(`<span class="env-item env-crash">${ICONS.alert} Crash: ${escapeHtml(a.crash.description)}</span>`);

    if (envParts.length > 0) {
      els.envInfo.innerHTML = envParts.join("");
      els.envSection.style.display = "";
    } else {
      els.envSection.style.display = "none";
    }
  }

  function selectEntry(idx) {
    if (idx < 0 || idx >= state.filteredEntries.length) return;
    state.selectedIndex = idx;
    const entry = state.filteredEntries[idx];

    els.detailLine.textContent = entry.line;
    els.detailLevel.innerHTML = `<span class="badge badge-${levelBadge(entry.level)}">${entry.level}</span>`;
    els.detailTimestamp.textContent = entry.timestamp || "—";
    els.detailThread.textContent = entry.thread || "—";
    els.detailSource.textContent = entry.source || "—";
    els.detailMessage.textContent = entry.message;

    els.detailPanel.classList.add("active");
    
    // Update DOM selection visually
    document.querySelectorAll(".log-entry.selected, .log-entry-raw.selected").forEach(el => el.classList.remove("selected"));
    const selectedEl = document.querySelector(`[data-idx="${idx}"]`);
    if (selectedEl) selectedEl.classList.add("selected");
  }

  function closeDetail() {
    state.selectedIndex = -1;
    els.detailPanel.classList.remove("active");
    document.querySelectorAll(".log-entry.selected, .log-entry-raw.selected").forEach(el => el.classList.remove("selected"));
  }

  // ═══════════════════════════════════════
  // RECENT LOGS (localStorage)
  // ═══════════════════════════════════════

  function getRecent() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch { return []; }
  }

  function saveRecent(name) {
    const recent = getRecent().filter((r) => r.name !== name);
    recent.unshift({ name, date: new Date().toLocaleDateString("pt-BR") });
    if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch {}
    renderRecent();
  }

  function renderRecent() {
    const recent = getRecent();
    if (recent.length === 0) {
      els.recentList.innerHTML = "";
      els.noRecent.style.display = "";
      return;
    }
    els.noRecent.style.display = "none";
    els.recentList.innerHTML = recent.map((r) => `
      <li class="recent-item" data-name="${escapeHtml(r.name)}">
        <div class="recent-item-icon">
          <svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <span class="recent-item-text">${escapeHtml(r.name)}</span>
        <span class="recent-item-date">${r.date}</span>
      </li>
    `).join("");
  }

  // ═══════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════

  function initEvents() {
    // ── Initial state ──
    els.btnFetch.addEventListener("click", handleFetch);
    els.urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleFetch();
    });

    els.btnUpload.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", handleFileUpload);

    els.btnPaste.addEventListener("click", () => {
      els.pasteModal.classList.add("active");
      els.pasteTextarea.value = "";
      els.pasteTextarea.focus();
    });
    els.btnPasteCancel.addEventListener("click", () => {
      els.pasteModal.classList.remove("active");
    });
    els.btnPasteConfirm.addEventListener("click", () => {
      const content = els.pasteTextarea.value.trim();
      if (!content) return showToast("Cole o conteúdo do log primeiro.");
      els.pasteModal.classList.remove("active");
      switchToInvestigation(content, "log-colado");
    });

    // Drag & drop
    els.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      els.dropZone.classList.add("dragover");
    });
    els.dropZone.addEventListener("dragleave", () => {
      els.dropZone.classList.remove("dragover");
    });
    els.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      els.dropZone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) readFile(file);
    });

    // ── Investigation state ──
    els.brandBack.addEventListener("click", switchToInitial);
    els.btnImportNew.addEventListener("click", switchToInitial);

    // Search
    let searchTimer;
    els.searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchTerm = els.searchInput.value.trim();
        applyFilters();
      }, 200);
    });

    // Severity checkboxes
    els.sevFilter.addEventListener("change", (e) => {
      if (e.target.type !== "checkbox") return;
      const level = e.target.dataset.level;
      if (e.target.checked) {
        state.activeLevels.add(level);
      } else {
        state.activeLevels.delete(level);
      }
      applyFilters();
    });

    // Clear filters
    els.btnClearFilters.addEventListener("click", () => {
      state.searchTerm = "";
      state.sourceFilter = null;
      els.searchInput.value = "";
      state.activeLevels = new Set(["INFO", "WARN", "ERROR", "FATAL", "DEBUG", "UNKNOWN"]);
      els.sevFilter.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.checked = true);
      applyFilters();
    });

    // Scroll to load chunks
    els.logViewport.addEventListener("scroll", () => {
      const vp = els.logViewport;
      
      // Load next chunk if near bottom (within 500px)
      if (vp.scrollHeight - vp.scrollTop - vp.clientHeight < 500) {
        if (!renderState.isRendering && renderState.currentIndex < state.filteredEntries.length) {
          renderNextChunk();
        }
      }

      const atBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 60;
      state.isAtBottom = atBottom;
      els.newEntriesBanner.classList.toggle("visible", !atBottom && state.filteredEntries.length > 0);
    });

    // Click on log entry
    els.logSpacer.addEventListener("click", (e) => {
      const entry = e.target.closest("[data-idx]");
      if (entry) {
        selectEntry(parseInt(entry.dataset.idx, 10));
      }
    });

    // Detail panel
    els.detailClose.addEventListener("click", closeDetail);

    els.btnCopyMsg.addEventListener("click", () => {
      if (state.selectedIndex >= 0) {
        const entry = state.filteredEntries[state.selectedIndex];
        navigator.clipboard.writeText(entry.message).then(() => {
          showToast("Mensagem copiada!");
        });
      }
    });

    els.btnFilterSource.addEventListener("click", () => {
      if (state.selectedIndex >= 0) {
        const entry = state.filteredEntries[state.selectedIndex];
        if (entry.source) {
          state.sourceFilter = entry.source;
          applyFilters();
        }
      }
    });

    // Scroll to bottom
    els.btnScrollBottom.addEventListener("click", () => {
      els.logViewport.scrollTop = els.logViewport.scrollHeight;
    });
    els.newEntriesBanner.addEventListener("click", () => {
      els.logViewport.scrollTop = els.logViewport.scrollHeight;
    });

    // Wrap toggle
    els.btnWrap.addEventListener("click", () => {
      state.wrapLines = !state.wrapLines;
      els.btnWrap.style.background = state.wrapLines ? "rgba(255,255,255,0.08)" : "";
      
      // Update DOM manually without losing scroll position
      document.querySelectorAll(".log-entry, .log-entry-raw").forEach(el => {
        el.classList.toggle("log-wrap", state.wrapLines);
      });
    });

    // Keyboard
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (els.pasteModal.classList.contains("active")) {
          els.pasteModal.classList.remove("active");
        } else if (els.detailPanel.classList.contains("active")) {
          closeDetail();
        }
      }
      // Ctrl+F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && els.stateInvestigation.classList.contains("active")) {
        e.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
      }
    });

    // Resize observer for virtual list
    const resizeObs = new ResizeObserver(() => renderVirtualList());
    resizeObs.observe(els.logViewport);
  }

  // ── Handlers ──
  async function handleFetch() {
    const url = els.urlInput.value.trim();
    if (!url) return showToast("Insira uma URL válida.");

    showLoading("Buscando log...");
    try {
      const { content, name } = await fetchLog(url);
      switchToInvestigation(content, name);
    } catch (err) {
      hideLoading();
      showToast(err.message);
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) readFile(file);
    els.fileInput.value = "";
  }

  function readFile(file) {
    showLoading("Lendo arquivo...");
    const reader = new FileReader();
    reader.onload = () => {
      switchToInvestigation(reader.result, file.name);
    };
    reader.onerror = () => {
      hideLoading();
      showToast("Erro ao ler o arquivo.");
    };
    reader.readAsText(file);
  }

  // ═══════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════

  function init() {
    renderRecent();
    initEvents();

    // Check URL params for auto-load
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    if (urlParam) {
      els.urlInput.value = urlParam;
      handleFetch();
    }
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
