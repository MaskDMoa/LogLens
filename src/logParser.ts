import {
    LogEntry,
    LogLevel,
    ModInfo,
    CrashInfo,
    LogAnalysis,
} from "./types";

/**
 * Regex para capturar uma linha de log padrão do Minecraft/NeoForge.
 * Formato: [timestamp] [thread/LEVEL] [source/]: mensagem
 */
const LOG_LINE_REGEX = /^\[([^\]]+)\]\s+\[([^/]+)\/(\w+)\]\s+\[([^\]]+)\]:?\s*(.*)$/;

/**
 * Regex para capturar linhas de mod na tabela de mods do FML/NeoForge.
 * Formato: arquivo.jar    |Nome do Mod    |modid    |versão    |Manifest: ...
 */
const MOD_LINE_REGEX = /^\s+(\S+\.jar)\s+\|(.+?)\|(.+?)\|(.+?)\|/;

/**
 * Parseia uma linha individual de log e retorna uma LogEntry estruturada.
 */
export function parseLogLine(line: string, lineNumber: number): LogEntry | null {
    const match = line.match(LOG_LINE_REGEX);
    if (!match) {
        return null;
    }

    const [, timestamp, thread, levelStr, source, message] = match;
    const level = normalizeLogLevel(levelStr);

    return {
        timestamp: timestamp.trim(),
        thread: thread.trim(),
        level,
        source: source.trim(),
        message: message.trim(),
        lineNumber,
    };
}

/**
 * Normaliza o nível de log para um dos valores conhecidos.
 */
export function normalizeLogLevel(level: string): LogLevel {
    const upper = level.toUpperCase().trim();
    switch (upper) {
        case "INFO":
            return "INFO";
        case "WARN":
        case "WARNING":
            return "WARN";
        case "ERROR":
            return "ERROR";
        case "FATAL":
            return "FATAL";
        case "DEBUG":
            return "DEBUG";
        default:
            return "UNKNOWN";
    }
}

/**
 * Extrai informações de mods da tabela de mods do log.
 */
export function parseModList(lines: string[]): ModInfo[] {
    const mods: ModInfo[] = [];

    for (const line of lines) {
        const match = line.match(MOD_LINE_REGEX);
        if (match) {
            const [, fileName, name, modId, version] = match;
            mods.push({
                fileName: fileName.trim(),
                name: name.trim(),
                modId: modId.trim(),
                version: version.trim(),
            });
        }
    }

    return mods;
}

/**
 * Extrai informações de crash report do log, se houver.
 */
export function parseCrashInfo(rawLog: string): CrashInfo | null {
    const crashIndex = rawLog.indexOf("---- Minecraft Crash Report ----");
    if (crashIndex === -1) {
        return null;
    }

    const crashSection = rawLog.substring(crashIndex);
    const lines = crashSection.split("\n");

    let description = "";
    let exception = "";
    const stackTrace: string[] = [];
    let inStackTrace = false;

    for (const line of lines) {
        if (line.startsWith("Description:")) {
            description = line.replace("Description:", "").trim();
        } else if (line.includes("Exception") || line.includes("Error:")) {
            if (!exception) {
                exception = line.trim();
            }
            inStackTrace = true;
        } else if (inStackTrace && line.trim().startsWith("at ")) {
            stackTrace.push(line.trim());
        } else if (inStackTrace && line.trim() === "") {
            inStackTrace = false;
        }
    }

    return { description, exception, stackTrace };
}

/**
 * Extrai a versão do Java do log.
 */
export function extractJavaVersion(rawLog: string): string | null {
    const match = rawLog.match(/Java Version:\s*(.+?)(?:,|\n|\r)/);
    if (match) return match[1].trim();

    const match2 = rawLog.match(/java\.version[=:]\s*(.+?)(?:\s|\n|\r)/);
    if (match2) return match2[1].trim();

    return null;
}

/**
 * Extrai a versão do Minecraft do log.
 */
export function extractMinecraftVersion(rawLog: string): string | null {
    const match = rawLog.match(/Minecraft Version:\s*(.+?)(?:\n|\r)/);
    if (match) return match[1].trim();

    const match2 = rawLog.match(/minecraft\s+(\d+\.\d+\.?\d*)/i);
    if (match2) return match2[1].trim();

    return null;
}

/**
 * Extrai a versão do Forge do log.
 */
export function extractForgeVersion(rawLog: string): string | null {
    const match = rawLog.match(/FML:\s*(.+?)(?:\n|\r)/);
    if (match) return match[1].trim();

    const match2 = rawLog.match(/Forge\s+Mod\s+Loader\s+version\s+([\d.]+)/i);
    if (match2) return match2[1].trim();

    return null;
}

/**
 * Extrai a versão do NeoForge do log.
 */
export function extractNeoForgeVersion(rawLog: string): string | null {
    const match = rawLog.match(/NeoForge:\s*(.+?)(?:\n|\r)/);
    if (match) return match[1].trim();

    const match2 = rawLog.match(/neoforge[:\s]+(\d[\d.]+)/i);
    if (match2) return match2[1].trim();

    return null;
}

/**
 * Extrai o tempo de inicialização do jogo.
 */
export function extractStartupTime(rawLog: string): string | null {
    const match = rawLog.match(/Game took\s+([\d.]+)\s+seconds?\s+to\s+start/i);
    if (match) return `${match[1]} segundos`;
    return null;
}

/**
 * Gera um resumo textual da análise do log.
 */
export function generateSummary(analysis: Omit<LogAnalysis, "summary">): string {
    const parts: string[] = [];

    parts.push(`[Total de linhas]: ${analysis.totalLines}`);
    parts.push(`[Entradas parseadas]: ${analysis.entries.length}`);
    parts.push(`[Warnings]: ${analysis.warnings.length}`);
    parts.push(`[Errors]: ${analysis.errors.length}`);
    parts.push(`[Mods detectados]: ${analysis.mods.length}`);

    if (analysis.minecraftVersion) {
        parts.push(`[Minecraft]: ${analysis.minecraftVersion}`);
    }
    if (analysis.neoForgeVersion) {
        parts.push(`[NeoForge]: ${analysis.neoForgeVersion}`);
    } else if (analysis.forgeVersion) {
        parts.push(`[FML]: ${analysis.forgeVersion}`);
    }
    if (analysis.javaVersion) {
        parts.push(`[Java]: ${analysis.javaVersion}`);
    }
    if (analysis.startupTime) {
        parts.push(`[Tempo de inicialização]: ${analysis.startupTime}`);
    }
    if (analysis.crash) {
        parts.push(`[CRASH DETECTADO]: ${analysis.crash.description}`);
    }

    return parts.join("\n");
}

/**
 * Função principal: analisa o log completo e retorna um LogAnalysis estruturado.
 */
export function analyzeLog(rawLog: string): LogAnalysis {
    const lines = rawLog.split("\n");
    const entries: LogEntry[] = [];
    const errors: LogEntry[] = [];
    const warnings: LogEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
        const entry = parseLogLine(lines[i], i + 1);
        if (entry) {
            entries.push(entry);
            if (entry.level === "ERROR" || entry.level === "FATAL") {
                errors.push(entry);
            } else if (entry.level === "WARN") {
                warnings.push(entry);
            }
        }
    }

    const mods = parseModList(lines);
    const crash = parseCrashInfo(rawLog);
    const javaVersion = extractJavaVersion(rawLog);
    const minecraftVersion = extractMinecraftVersion(rawLog);
    const forgeVersion = extractForgeVersion(rawLog);
    const neoForgeVersion = extractNeoForgeVersion(rawLog);
    const startupTime = extractStartupTime(rawLog);

    const partialAnalysis = {
        totalLines: lines.length,
        entries,
        errors,
        warnings,
        mods,
        crash,
        javaVersion,
        minecraftVersion,
        forgeVersion,
        neoForgeVersion,
        startupTime,
    };

    return {
        ...partialAnalysis,
        summary: generateSummary(partialAnalysis),
    };
}
