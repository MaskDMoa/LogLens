export type LogLevel = "INFO" | "WARN" | "ERROR" | "FATAL" | "DEBUG" | "UNKNOWN";

export interface LogEntry {
  line: number;
  timestamp: string;
  thread: string;
  level: LogLevel;
  source: string;
  message: string;
  raw: string;
  isNoise?: boolean;
}

export interface ModInfo {
  fileName: string;
  name: string;
  modId: string;
  version: string;
}

export interface CrashInfo {
  description: string;
  exception: string;
  stackTrace: string[];
}

export interface LogCounts {
  INFO: number;
  WARN: number;
  ERROR: number;
  FATAL: number;
  DEBUG: number;
  UNKNOWN: number;
}

export interface LogAnalysis {
  entries: LogEntry[];
  counts: LogCounts;
  mods: ModInfo[];
  crash: CrashInfo | null;
  javaVersion: string | null;
  minecraftVersion: string | null;
  forgeVersion: string | null;
  neoForgeVersion: string | null;
  fabricVersion: string | null;
  startupTime: string | null;
}

export interface DiagnosticHit {
  title: string;
  diagnosis: string;
  fixes: string[];
  matchedText?: string;
}
