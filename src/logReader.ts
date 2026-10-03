/**
 * Extrai o ID do log da URL do GnomeBot.
 * Exemplo: https://gnomebot.dev/paste/mclogs/prpZHwa -> prpZHwa
 */
export function getLogIdFromUrl(url: string): string | null {
    const match = url.match(/\/mclogs\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

/**
 * Busca o conteúdo raw do log usando a API do mclo.gs.
 */
export async function fetchLogContent(id: string): Promise<string> {
    const response = await fetch(`https://api.mclo.gs/1/raw/${id}`);
    if (!response.ok) {
        throw new Error(`Erro ao buscar o log: ${response.status} ${response.statusText}`);
    }
    return await response.text();
}

/**
 * Lê o log completo a partir de uma URL do GnomeBot.
 */
export async function readGnomeBotLog(url: string): Promise<string> {
    const id = getLogIdFromUrl(url);
    if (!id) {
        throw new Error("URL inválida do GnomeBot. Certifique-se de que contém '/mclogs/<id>'");
    }
    return await fetchLogContent(id);
}
