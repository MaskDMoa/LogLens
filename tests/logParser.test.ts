import {
    parseLogLine,
    normalizeLogLevel,
    parseModList,
    parseCrashInfo,
    extractJavaVersion,
    extractMinecraftVersion,
    extractForgeVersion,
    extractNeoForgeVersion,
    extractStartupTime,
    generateSummary,
    analyzeLog,
} from "../src/logParser";

describe("Log Parser", () => {
    // ──────────────────────────────────────────────
    // normalizeLogLevel
    // ──────────────────────────────────────────────
    describe("normalizeLogLevel", () => {
        it("deve normalizar INFO", () => {
            expect(normalizeLogLevel("INFO")).toBe("INFO");
            expect(normalizeLogLevel("info")).toBe("INFO");
        });

        it("deve normalizar WARN e WARNING", () => {
            expect(normalizeLogLevel("WARN")).toBe("WARN");
            expect(normalizeLogLevel("WARNING")).toBe("WARN");
            expect(normalizeLogLevel("warn")).toBe("WARN");
        });

        it("deve normalizar ERROR", () => {
            expect(normalizeLogLevel("ERROR")).toBe("ERROR");
        });

        it("deve normalizar FATAL", () => {
            expect(normalizeLogLevel("FATAL")).toBe("FATAL");
        });

        it("deve normalizar DEBUG", () => {
            expect(normalizeLogLevel("DEBUG")).toBe("DEBUG");
        });

        it("deve retornar UNKNOWN para níveis desconhecidos", () => {
            expect(normalizeLogLevel("TRACE")).toBe("UNKNOWN");
            expect(normalizeLogLevel("abc")).toBe("UNKNOWN");
        });
    });

    // ──────────────────────────────────────────────
    // parseLogLine
    // ──────────────────────────────────────────────
    describe("parseLogLine", () => {
        it("deve parsear uma linha de log padrão do NeoForge", () => {
            const line = "[02Oct2026 19:39:33.746] [Render thread/WARN] [ModernFix/]: Game took 34.696 seconds to start";
            const entry = parseLogLine(line, 1);

            expect(entry).not.toBeNull();
            expect(entry!.timestamp).toBe("02Oct2026 19:39:33.746");
            expect(entry!.thread).toBe("Render thread");
            expect(entry!.level).toBe("WARN");
            expect(entry!.source).toBe("ModernFix/");
            expect(entry!.message).toBe("Game took 34.696 seconds to start");
            expect(entry!.lineNumber).toBe(1);
        });

        it("deve parsear linha de log com INFO", () => {
            const line = "[02Oct2026 19:38:58.901] [main/INFO] [cpw.mods.modlauncher.Launcher/MODLAUNCHER]: ModLauncher running";
            const entry = parseLogLine(line, 42);

            expect(entry).not.toBeNull();
            expect(entry!.level).toBe("INFO");
            expect(entry!.thread).toBe("main");
            expect(entry!.lineNumber).toBe(42);
        });

        it("deve parsear linha de log com ERROR", () => {
            const line = "[02Oct2026 19:39:10.500] [main/ERROR] [net.neoforged.fml/]: Missing or unsupported mod detected";
            const entry = parseLogLine(line, 100);

            expect(entry).not.toBeNull();
            expect(entry!.level).toBe("ERROR");
            expect(entry!.source).toBe("net.neoforged.fml/");
        });

        it("deve retornar null para linhas que não são de log", () => {
            expect(parseLogLine("Isso é um texto qualquer", 1)).toBeNull();
            expect(parseLogLine("", 1)).toBeNull();
            expect(parseLogLine("   ", 1)).toBeNull();
        });
    });

    // ──────────────────────────────────────────────
    // parseModList
    // ──────────────────────────────────────────────
    describe("parseModList", () => {
        it("deve extrair mods da tabela do log", () => {
            const lines = [
                "\tJEI-1.21.1-neoforge-19.21.1.345.jar               |Just Enough Items             |jei                           |19.21.1.345         |Manifest: NOSIGNATURE",
                "\txaerominimap-neoforge-1.21.1-25.3.13.jar           |Xaero's Minimap               |xaerominimap                  |25.3.13             |Manifest: NOSIGNATURE",
                "Linha que não é mod",
            ];

            const mods = parseModList(lines);

            expect(mods).toHaveLength(2);
            expect(mods[0].name).toBe("Just Enough Items");
            expect(mods[0].modId).toBe("jei");
            expect(mods[0].version).toBe("19.21.1.345");
            expect(mods[1].modId).toBe("xaerominimap");
        });

        it("deve retornar lista vazia quando não há mods", () => {
            const lines = ["Apenas texto normal", "Outra linha"];
            expect(parseModList(lines)).toHaveLength(0);
        });
    });

    // ──────────────────────────────────────────────
    // parseCrashInfo
    // ──────────────────────────────────────────────
    describe("parseCrashInfo", () => {
        it("deve extrair informações de crash report", () => {
            const rawLog = `
[02Oct2026 19:39:33.746] [main/INFO] [some/]: Loading
---- Minecraft Crash Report ----
Description: Ticking entity

java.lang.NullPointerException: Ticking entity
	at net.minecraft.world.entity.Entity.tick(Entity.java:123)
	at net.minecraft.server.level.ServerLevel.tick(ServerLevel.java:456)

-- System Details --
`;
            const crash = parseCrashInfo(rawLog);

            expect(crash).not.toBeNull();
            expect(crash!.description).toBe("Ticking entity");
            expect(crash!.exception).toContain("NullPointerException");
            expect(crash!.stackTrace.length).toBeGreaterThanOrEqual(1);
        });

        it("deve retornar null quando não há crash", () => {
            const rawLog = "[02Oct2026 19:39:33.746] [main/INFO] [test/]: Tudo OK";
            expect(parseCrashInfo(rawLog)).toBeNull();
        });
    });

    // ──────────────────────────────────────────────
    // Extração de versões
    // ──────────────────────────────────────────────
    describe("extractJavaVersion", () => {
        it("deve extrair a versão do Java", () => {
            const log = "Java Version: 21.0.3, Oracle\nOutra coisa";
            expect(extractJavaVersion(log)).toBe("21.0.3");
        });

        it("deve retornar null se não encontrar", () => {
            expect(extractJavaVersion("sem versão")).toBeNull();
        });
    });

    describe("extractMinecraftVersion", () => {
        it("deve extrair a versão do Minecraft", () => {
            const log = "Minecraft Version: 1.21.1\n";
            expect(extractMinecraftVersion(log)).toBe("1.21.1");
        });

        it("deve extrair via fallback regex", () => {
            const log = "minecraft 1.21.1 neoforge";
            expect(extractMinecraftVersion(log)).toBe("1.21.1");
        });

        it("deve retornar null se não encontrar", () => {
            expect(extractMinecraftVersion("nada aqui")).toBeNull();
        });
    });

    describe("extractForgeVersion", () => {
        it("deve extrair a versão do FML", () => {
            const log = "FML: 4.0.44\n";
            expect(extractForgeVersion(log)).toBe("4.0.44");
        });

        it("deve retornar null se não encontrar", () => {
            expect(extractForgeVersion("nada")).toBeNull();
        });
    });

    describe("extractNeoForgeVersion", () => {
        it("deve extrair a versão do NeoForge", () => {
            const log = "NeoForge: 21.1.252\n";
            expect(extractNeoForgeVersion(log)).toBe("21.1.252");
        });

        it("deve retornar null se não encontrar", () => {
            expect(extractNeoForgeVersion("nada")).toBeNull();
        });
    });

    describe("extractStartupTime", () => {
        it("deve extrair o tempo de inicialização", () => {
            const log = "Game took 34.696 seconds to start";
            expect(extractStartupTime(log)).toBe("34.696 segundos");
        });

        it("deve retornar null se não encontrar", () => {
            expect(extractStartupTime("nada")).toBeNull();
        });
    });

    // ──────────────────────────────────────────────
    // generateSummary
    // ──────────────────────────────────────────────
    describe("generateSummary", () => {
        it("deve gerar um resumo com todas as informações", () => {
            const summary = generateSummary({
                totalLines: 100,
                entries: Array(50).fill(null),
                errors: Array(3).fill(null),
                warnings: Array(10).fill(null),
                mods: Array(25).fill(null),
                crash: null,
                javaVersion: "21.0.3",
                minecraftVersion: "1.21.1",
                forgeVersion: null,
                neoForgeVersion: "21.1.252",
                startupTime: "34.696 segundos",
            });

            expect(summary).toContain("100");
            expect(summary).toContain("50");
            expect(summary).toContain("3");
            expect(summary).toContain("10");
            expect(summary).toContain("25");
            expect(summary).toContain("1.21.1");
            expect(summary).toContain("21.1.252");
            expect(summary).toContain("21.0.3");
            expect(summary).toContain("34.696 segundos");
        });

        it("deve incluir crash quando presente", () => {
            const summary = generateSummary({
                totalLines: 10,
                entries: [],
                errors: [],
                warnings: [],
                mods: [],
                crash: { description: "Ticking entity", exception: "NPE", stackTrace: [] },
                javaVersion: null,
                minecraftVersion: null,
                forgeVersion: null,
                neoForgeVersion: null,
                startupTime: null,
            });

            expect(summary).toContain("CRASH");
            expect(summary).toContain("Ticking entity");
        });
    });

    // ──────────────────────────────────────────────
    // analyzeLog (integração)
    // ──────────────────────────────────────────────
    describe("analyzeLog", () => {
        it("deve analisar um log completo", () => {
            const rawLog = [
                "[02Oct2026 19:38:58.901] [main/INFO] [Launcher/]: ModLauncher running",
                "[02Oct2026 19:39:10.500] [main/ERROR] [FML/]: Missing mod detected",
                "[02Oct2026 19:39:20.100] [main/WARN] [SomeLib/]: Deprecated API usage",
                "\tJEI-1.21.1-neoforge-19.21.1.345.jar               |Just Enough Items             |jei                           |19.21.1.345         |Manifest: NOSIGNATURE",
                "NeoForge: 21.1.252",
                "Game took 34.696 seconds to start",
            ].join("\n");

            const analysis = analyzeLog(rawLog);

            expect(analysis.totalLines).toBe(6);
            expect(analysis.entries).toHaveLength(3);
            expect(analysis.errors).toHaveLength(1);
            expect(analysis.warnings).toHaveLength(1);
            expect(analysis.mods).toHaveLength(1);
            expect(analysis.mods[0].modId).toBe("jei");
            expect(analysis.neoForgeVersion).toBe("21.1.252");
            expect(analysis.startupTime).toBe("34.696 segundos");
            expect(analysis.crash).toBeNull();
            expect(analysis.summary).toBeTruthy();
        });

        it("deve lidar com log vazio", () => {
            const analysis = analyzeLog("");

            expect(analysis.totalLines).toBe(1);
            expect(analysis.entries).toHaveLength(0);
            expect(analysis.errors).toHaveLength(0);
            expect(analysis.mods).toHaveLength(0);
            expect(analysis.crash).toBeNull();
        });
    });
});
