/**
 * Tipos e interfaces para os dados extraídos do log.
 */

/** Nível de severidade de uma entrada de log */
export type LogLevel = "INFO" | "WARN" | "ERROR" | "FATAL" | "DEBUG" | "UNKNOWN";

/** Uma entrada individual de log parseada */
export interface LogEntry {
    timestamp: string;
    thread: string;
    level: LogLevel;
    source: string;
    message: string;
    lineNumber: number;
}

/** Informação de um mod instalado */
export interface ModInfo {
    fileName: string;
    name: string;
    modId: string;
    version: string;
}

/** Informações do crash report, se houver */
export interface CrashInfo {
    description: string;
    exception: string;
    stackTrace: string[];
}

/** Resultado completo da análise do log */
export interface LogAnalysis {
    totalLines: number;
    entries: LogEntry[];
    errors: LogEntry[];
    warnings: LogEntry[];
    mods: ModInfo[];
    crash: CrashInfo | null;
    javaVersion: string | null;
    minecraftVersion: string | null;
    forgeVersion: string | null;
    neoForgeVersion: string | null;
    startupTime: string | null;
    summary: string;
}
