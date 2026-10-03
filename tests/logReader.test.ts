import { getLogIdFromUrl, fetchLogContent, readGnomeBotLog } from "../src/logReader";

// Fazendo mock da função global fetch
global.fetch = jest.fn();

describe("Leitor de Logs do GnomeBot", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("getLogIdFromUrl", () => {
        it("deve extrair o ID corretamente de uma URL válida", () => {
            const url = "https://gnomebot.dev/paste/mclogs/prpZHwa";
            const id = getLogIdFromUrl(url);
            expect(id).toBe("prpZHwa");
        });

        it("deve retornar null para uma URL inválida", () => {
            const url = "https://example.com/other/path";
            const id = getLogIdFromUrl(url);
            expect(id).toBeNull();
        });
    });

    describe("fetchLogContent", () => {
        it("deve buscar o conteúdo do log da API mclo.gs", async () => {
            const mockResponseText = "Isso é um log de teste";
            
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                text: jest.fn().mockResolvedValueOnce(mockResponseText),
            });

            const content = await fetchLogContent("prpZHwa");
            
            expect(global.fetch).toHaveBeenCalledWith("https://api.mclo.gs/1/raw/prpZHwa");
            expect(content).toBe(mockResponseText);
        });

        it("deve lançar um erro se a requisição falhar", async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            await expect(fetchLogContent("invalidId")).rejects.toThrow("Erro ao buscar o log: 404 Not Found");
        });
    });

    describe("readGnomeBotLog", () => {
        it("deve extrair o ID e buscar o log completo", async () => {
            const mockResponseText = "Log completo";
            
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                text: jest.fn().mockResolvedValueOnce(mockResponseText),
            });

            const content = await readGnomeBotLog("https://gnomebot.dev/paste/mclogs/testId123");
            
            expect(global.fetch).toHaveBeenCalledWith("https://api.mclo.gs/1/raw/testId123");
            expect(content).toBe(mockResponseText);
        });

        it("deve lançar um erro se a URL for inválida", async () => {
            await expect(readGnomeBotLog("https://invalid-url.com")).rejects.toThrow("URL inválida do GnomeBot");
        });
    });
});
