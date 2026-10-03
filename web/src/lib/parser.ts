import type { LogEntry, LogAnalysis, CrashInfo, ModInfo } from './types';

// Regex patterns
const LOG_LINE_RE = /^\[([^\]]+)\] \[([^\]]+)\/(INFO|WARN|ERROR|FATAL|DEBUG)\](?: \[([^\]]*)\])?:? ?(.*)$/s;
const MOD_LINE_RE = /Mod File: (.+) \((.+)\), Version: (.+)/;

const NOISE_PATTERNS = [
  {
    id: "found_mod",
    label: "Mods encontrados",
    test: (e: LogEntry) => e.message.startsWith("Found mod file") || e.message.startsWith("Found library file") || e.message.startsWith("Found gamelibrary file"),
  },
  {
    id: "refmap_warn",
    label: "Avisos de Reference Map",
    test: (e: LogEntry) => e.message.includes("Reference map") && e.message.includes("could not be read"),
  },
  {
    id: "class_not_found",
    label: "Classes não encontradas (opcionais)",
    test: (e: LogEntry) => e.message.startsWith("Error loading class:") || (e.message.startsWith("@Mixin target") && e.message.includes("was not found")),
  },
  {
    id: "mod_list_spam",
    label: "Lista de mods (Mod List)",
    test: (e: LogEntry) => e.message.startsWith("Mod List:") || e.message.startsWith("Found Kotlin-containing") || e.message.startsWith("Looks like a standalone"),
  },
  {
    id: "launcher_args",
    label: "Argumentos do launcher (dados sensíveis)",
    test: (e: LogEntry) => e.message.startsWith("ModLauncher running: args") || e.message.startsWith("Launching target") && e.message.includes("--accessToken"),
  },
  {
    id: "dependencies",
    label: "Dependências JarInJar",
    test: (e: LogEntry) => e.message.includes("dependencies adding them to mods") || (e.message.includes("[parent:") && e.message.includes("locator: jarinjar")),
  },
  {
    id: "mixin_disable",
    label: "Mixins desabilitados/forçados",
    test: (e: LogEntry) => e.message.startsWith("Force-disabling mixin") || e.message.startsWith("Force-enabling mixin"),
  },
  {
    id: "replaced_calls",
    label: "Chamadas substituídas (patches)",
    test: (e: LogEntry) => e.message.startsWith("Replaced") && e.message.includes("calls to"),
  },
];

export function groupNoise(entries: LogEntry[]): (LogEntry | any)[] {
  const result: any[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    const pattern = NOISE_PATTERNS.find((p) => p.test(e));
    if (pattern) {
      const group: LogEntry[] = [];
      while (i < entries.length && pattern.test(entries[i])) {
        group.push(entries[i]);
        i++;
      }
      if (group.length >= 3) {
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

function normalizeLevel(lvl: string): LogEntry['level'] {
  const u = lvl.toUpperCase().trim();
  if (u === "INFO") return "INFO";
  if (u === "WARN" || u === "WARNING") return "WARN";
  if (u === "ERROR") return "ERROR";
  if (u === "FATAL") return "FATAL";
  if (u === "DEBUG") return "DEBUG";
  return "UNKNOWN";
}

export function parseLogLines(rawLog: string): LogEntry[] {
  const lines = rawLog.split("\n");
  const entries: LogEntry[] = [];

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
          let s = m[4] ? m[4].trim().replace(/\/$/, "") : "unknown";
          const parts = s.split("/");
          const classPart = parts[0].split(".").pop() || "unknown";
          return parts.length > 1 ? `${classPart}/${parts[1]}` : classPart;
        })(),
        message: m[5].trim(),
        raw: line,
      });
    } else {
      if (entries.length > 0 && (line.startsWith("\t") || line.startsWith("    "))) {
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

function parseMods(rawLog: string): ModInfo[] {
  const lines = rawLog.split("\n");
  const mods: ModInfo[] = [];
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

function parseCrash(rawLog: string): CrashInfo | null {
  const idx = rawLog.indexOf("---- Minecraft Crash Report ----");
  if (idx === -1) return null;
  const section = rawLog.substring(idx);
  const lines = section.split("\n");
  let description = "", exception = "";
  const stackTrace: string[] = [];
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

function extract(rawLog: string, regex: RegExp): string | null {
  const m = rawLog.match(regex);
  return m ? m[1].trim() : null;
}

export function analyzeLog(rawLog: string): LogAnalysis {
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
    minecraftVersion: extract(rawLog, /Minecraft Version:\s*(.+?)(?:\n|\r)/) || extract(rawLog, /minecraft\s+(\d+\.\d+\.?\d*)/i),
    neoForgeVersion: extract(rawLog, /NeoForge:\s*(.+?)(?:\n|\r)/) || extract(rawLog, /neoforge[:\s]+(\d[\d.]+)/i),
    forgeVersion: extract(rawLog, /FML:\s*(.+?)(?:\n|\r)/),
    fabricVersion: extract(rawLog, /Fabric(?: Loader)?:\s*(.+?)(?:\n|\r)/),
    javaVersion: extract(rawLog, /Java Version:\s*(.+?)(?:,|\n|\r)/),
    startupTime: extract(rawLog, /Game took\s+([\d.]+)\s+seconds?\s+to\s+start/i),
  };
}
