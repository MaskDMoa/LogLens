import { readGnomeBotLog } from "./logReader";
import { analyzeLog } from "./logParser";
import { LogAnalysis } from "./types";

/**
 * Formata a análise do log para exibição no console.
 */
function formatAnalysis(analysis: LogAnalysis): string {
    const separator = "═".repeat(60);
    const thinSep = "─".repeat(60);
    const sections: string[] = [];

    // Cabeçalho
    sections.push(separator);
    sections.push("  📋 LEITOR DE LOGS - GNOMEBOT / MCLO.GS");
    sections.push(separator);

    // Resumo
    sections.push("");
    sections.push("  📊 RESUMO");
    sections.push(thinSep);
    sections.push(analysis.summary.split("\n").map(l => `  ${l}`).join("\n"));

    // Top erros (máximo 10)
    if (analysis.errors.length > 0) {
        sections.push("");
        sections.push("  ❌ ERROS ENCONTRADOS");
        sections.push(thinSep);
        const topErrors = analysis.errors.slice(0, 10);
        for (const err of topErrors) {
            sections.push(`  [L${err.lineNumber}] [${err.source}] ${err.message}`);
        }
        if (analysis.errors.length > 10) {
            sections.push(`  ... e mais ${analysis.errors.length - 10} erros.`);
        }
    }

    // Top warnings (máximo 10)
    if (analysis.warnings.length > 0) {
        sections.push("");
        sections.push("  ⚠️  AVISOS (WARNINGS)");
        sections.push(thinSep);
        const topWarnings = analysis.warnings.slice(0, 10);
        for (const warn of topWarnings) {
            sections.push(`  [L${warn.lineNumber}] [${warn.source}] ${warn.message}`);
        }
        if (analysis.warnings.length > 10) {
            sections.push(`  ... e mais ${analysis.warnings.length - 10} avisos.`);
        }
    }

    // Crash
    if (analysis.crash) {
        sections.push("");
        sections.push("  💥 CRASH REPORT");
        sections.push(thinSep);
        sections.push(`  Descrição: ${analysis.crash.description}`);
        sections.push(`  Exceção:   ${analysis.crash.exception}`);
        if (analysis.crash.stackTrace.length > 0) {
            sections.push("  Stack Trace (top 5):");
            for (const st of analysis.crash.stackTrace.slice(0, 5)) {
                sections.push(`    ${st}`);
            }
        }
    }

    // Mods (lista compacta)
    if (analysis.mods.length > 0) {
        sections.push("");
        sections.push(`  🧩 MODS INSTALADOS (${analysis.mods.length})`);
        sections.push(thinSep);
        for (const mod of analysis.mods) {
            sections.push(`  • ${mod.name} (${mod.modId}) v${mod.version}`);
        }
    }

    sections.push("");
    sections.push(separator);
    sections.push("  ✅ Análise concluída.");
    sections.push(separator);

    return sections.join("\n");
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error("╔══════════════════════════════════════════════╗");
        console.error("║  Leitor de Logs - GnomeBot / mclo.gs        ║");
        console.error("╠══════════════════════════════════════════════╣");
        console.error("║  Uso:                                       ║");
        console.error("║    npm start <URL>                           ║");
        console.error("║    npm start <URL> --raw                     ║");
        console.error("║                                              ║");
        console.error("║  Opções:                                     ║");
        console.error("║    --raw    Exibe o log bruto sem análise    ║");
        console.error("╚══════════════════════════════════════════════╝");
        process.exit(1);
    }

    const url = args[0];
    const rawMode = args.includes("--raw");

    console.log(`\n  🔍 Buscando log de: ${url}\n`);

    try {
        const logContent = await readGnomeBotLog(url);

        if (rawMode) {
            console.log("=== INÍCIO DO LOG ===");
            console.log(logContent);
            console.log("=== FIM DO LOG ===");
        } else {
            const analysis = analyzeLog(logContent);
            console.log(formatAnalysis(analysis));
        }
    } catch (error) {
        console.error("❌ Erro:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
