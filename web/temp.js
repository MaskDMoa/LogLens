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
    envSection:       $("env-section"),
    envInfo:          $("env-info"),
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
    
    // Tabs
    tabLogs:          $("tab-logs"),
    tabDiag:          $("tab-diag"),
    logPane:          $("log-pane"),
    diagPane:         $("diag-pane"),
    diagContent:      $("diag-content"),

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
    hideNoise: true,     // Noise reduction toggle

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
  // NOISE PATTERNS — repetitive lines that clutter logs
  // ═══════════════════════════════════════
  const NOISE_PATTERNS = [
    {
      id: "found_mod",
      label: "Mods encontrados",
      test: (e) => e.message.startsWith("Found mod file") || e.message.startsWith("Found library file") || e.message.startsWith("Found gamelibrary file"),
    },
    {
      id: "refmap_warn",
      label: "Avisos de Reference Map",
      test: (e) => e.message.includes("Reference map") && e.message.includes("could not be read"),
    },
    {
      id: "class_not_found",
      label: "Classes não encontradas (opcionais)",
      test: (e) => e.message.startsWith("Error loading class:") || (e.message.startsWith("@Mixin target") && e.message.includes("was not found")),
    },
    {
      id: "mod_list_spam",
      label: "Lista de mods (Mod List)",
      test: (e) => e.message.startsWith("Mod List:") || e.message.startsWith("Found Kotlin-containing") || e.message.startsWith("Looks like a standalone"),
    },
    {
      id: "launcher_args",
      label: "Argumentos do launcher (dados sensíveis)",
      test: (e) => e.message.startsWith("ModLauncher running: args") || e.message.startsWith("Launching target") && e.message.includes("--accessToken"),
    },
    {
      id: "dependencies",
      label: "Dependências JarInJar",
      test: (e) => e.message.includes("dependencies adding them to mods") || (e.message.includes("[parent:") && e.message.includes("locator: jarinjar")),
    },
    {
      id: "mixin_disable",
      label: "Mixins desabilitados/forçados",
      test: (e) => e.message.startsWith("Force-disabling mixin") || e.message.startsWith("Force-enabling mixin"),
    },
    {
      id: "replaced_calls",
      label: "Chamadas substituídas (patches)",
      test: (e) => e.message.startsWith("Replaced") && e.message.includes("calls to"),
    },
  ];

  /**
   * Groups consecutive noise entries into collapsible summary rows.
   * Returns a new array where noise sequences are replaced by a single
   * { _noiseGroup: true, pattern, entries[], collapsed } object.
   */
  function groupNoise(entries) {
    const result = [];
    let i = 0;
    while (i < entries.length) {
      const e = entries[i];
      // Find which noise pattern matches
      const pattern = NOISE_PATTERNS.find((p) => p.test(e));
      if (pattern) {
        // Collect all consecutive entries matching the same pattern
        const group = [];
        while (i < entries.length && pattern.test(entries[i])) {
          group.push(entries[i]);
          i++;
        }
        if (group.length >= 3) {
          // Only group if 3+ lines; otherwise keep individual
          result.push({
            _noiseGroup: true,
            id: pattern.id,
            label: pattern.label,
            entries: group,
            collapsed: true,
            level: group[0].level,
            line: group[0].line,
          });
        } else {
          result.push(...group);
        }
      } else {
        result.push(e);
        i++;
      }
    }
    return result;
  }

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
