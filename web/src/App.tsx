import React, { useState, useMemo, useRef } from 'react';
import type { LogEntry, LogLevel } from './lib/types';
import { analyzeLog, groupNoise } from './lib/parser';
import { runDiagnostics } from './lib/diagnostics';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';

/* ── helpers ── */
function formatNumber(n: number) {
  return n.toLocaleString('pt-BR');
}

/* ── App ── */
export default function App() {
  const [rawLog, setRawLog] = useState('');
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyzeLog> | null>(null);

  const [activeTab, setActiveTab] = useState<'logs' | 'diag'>('logs');
  const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(new Set(["INFO", "WARN", "ERROR", "FATAL", "DEBUG", "UNKNOWN"]));
  const [searchQuery, setSearchQuery] = useState('');
  const [hideNoise, setHideNoise] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [pasteModal, setPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── load log ── */
  function loadLog(text: string, name: string) {
    setRawLog(text);
    setFileName(name);
    setAnalysis(analyzeLog(text));
    setSelectedEntry(null);
    setSearchQuery('');
    setSourceFilter(null);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      loadLog(event.target?.result as string, file.name);
    };
    reader.readAsText(file);
  }

  async function handleFetchUrl() {
    if (!urlInput.trim()) return;
    setLoading(true);
    try {
      let url = urlInput.trim();
      // Convert mclo.gs or gnomebot URLs to raw
      if (url.includes('mclo.gs/')) {
        const id = url.split('/').pop();
        url = `https://api.mclo.gs/1/raw/${id}`;
      }
      if (url.includes('gnomebot.dev/paste/')) {
        url = url.replace('/paste/', '/paste/raw/');
      }
      const res = await fetch(url);
      const text = await res.text();
      loadLog(text, url.split('/').pop() || 'log.txt');
    } catch {
      alert('Erro ao buscar log. Verifique a URL.');
    }
    setLoading(false);
  }

  function handlePasteConfirm() {
    if (pasteText.trim()) {
      loadLog(pasteText, 'colado.txt');
      setPasteModal(false);
      setPasteText('');
    }
  }

  /* ── filtering ── */
  const filteredEntries = useMemo(() => {
    if (!analysis) return [];
    const q = searchQuery.toLowerCase();
    let result = analysis.entries.filter((e) => {
      if (!activeLevels.has(e.level)) return false;
      if (q && !e.message.toLowerCase().includes(q) && !e.source.toLowerCase().includes(q) && !e.raw.toLowerCase().includes(q)) return false;
      if (sourceFilter && e.source !== sourceFilter) return false;
      return true;
    });
    if (hideNoise && !q) {
      result = groupNoise(result);
    }
    return result;
  }, [analysis, activeLevels, searchQuery, hideNoise, sourceFilter]);

  const toggleLevel = (lvl: LogLevel) => {
    const s = new Set(activeLevels);
    if (s.has(lvl)) s.delete(lvl); else s.add(lvl);
    setActiveLevels(s);
  };

  const activeFilters = useMemo(() => {
    const f: string[] = [];
    if (searchQuery) f.push(`Busca: "${searchQuery}"`);
    if (sourceFilter) f.push(`Origem: ${sourceFilter}`);
    const allLevels: LogLevel[] = ["INFO", "WARN", "ERROR", "FATAL", "DEBUG", "UNKNOWN"];
    const hidden = allLevels.filter(l => !activeLevels.has(l));
    if (hidden.length > 0) f.push(`Ocultos: ${hidden.join(', ')}`);
    return f;
  }, [searchQuery, sourceFilter, activeLevels]);

  /* ── INITIAL STATE ── */
  if (!analysis) {
    return (
      <>
        <div className="grain" aria-hidden="true" />
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Carregando log...</p>
          </div>
        )}
        {pasteModal && (
          <div className="loading-overlay" role="dialog" onClick={(e) => { if (e.target === e.currentTarget) setPasteModal(false); }}>
            <section className="import-panel glass" style={{ maxWidth: 620 }}>
              <h2>Colar Conteúdo do Log</h2>
              <p>Cole o conteúdo completo do log abaixo.</p>
              <textarea
                className="input"
                rows={12}
                style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6 }}
                placeholder="Cole o log aqui..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="import-actions" style={{ marginTop: 16 }}>
                <button className="btn" onClick={() => setPasteModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handlePasteConfirm}>Analisar</button>
              </div>
            </section>
          </div>
        )}
        <div id="state-initial">
          <nav className="topbar" role="banner">
            <div className="topbar-left">
              <div className="topbar-brand">Log<span>Lens</span></div>
              <div className="topbar-sep" aria-hidden="true" />
              <div className="topbar-status">
                <div className="status-dot idle" />
                <span>Nenhuma fonte conectada</span>
              </div>
            </div>
          </nav>
          <main className="initial-content">
            <h1 className="hero-title" aria-hidden="true">LOG<br />LENS</h1>
            <section className="import-panel glass" aria-labelledby="import-heading">
              <h2 id="import-heading">Carregar Log</h2>
              <p>Cole uma URL do GnomeBot ou mclo.gs, carregue um arquivo ou cole o conteúdo diretamente.</p>
              <div className="import-url-row">
                <input
                  type="text"
                  className="input"
                  placeholder="https://gnomebot.dev/paste/mclogs/..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                />
                <button className="btn btn-primary" onClick={handleFetchUrl}>Buscar</button>
              </div>
              <div className="import-divider">ou</div>
              <div className="import-actions">
                <button className="btn" onClick={() => fileInputRef.current?.click()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Carregar arquivo
                </button>
                <button className="btn" onClick={() => setPasteModal(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
                  Colar conteúdo
                </button>
              </div>
              <div className="drop-zone"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('drag-over');
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => loadLog(ev.target?.result as string, file.name);
                    reader.readAsText(file);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <p>Arraste um arquivo de log aqui</p>
              </div>
            </section>
            <div className="secondary-panels">
              <section className="secondary-panel glass">
                <h3>Sobre</h3>
                <p className="info-text">LogLens lê logs do <code>mclo.gs</code> e do GnomeBot. Cole a URL ou carregue um arquivo <code>.log</code> ou <code>.txt</code> para começar a investigar.</p>
              </section>
            </div>
          </main>
        </div>
        <input ref={fileInputRef} type="file" accept=".log,.txt,.gz" className="sr-only" onChange={handleFileUpload} />
      </>
    );
  }

  /* ── INVESTIGATION STATE ── */
  const diagnostics = runDiagnostics(rawLog);

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div id="state-investigation">
        {/* Top bar */}
        <nav className="topbar" role="banner">
          <div className="topbar-left">
            <div className="topbar-brand" title="Voltar ao início" onClick={() => setAnalysis(null)} style={{ cursor: 'pointer' }}>Log<span>Lens</span></div>
            <div className="topbar-sep" aria-hidden="true" />
            <div className="topbar-context">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>{fileName}</span>
            </div>
            <div className="topbar-sep" aria-hidden="true" />
            <div className="topbar-status">
              <div className="status-dot loaded" />
              <span>Carregado</span>
            </div>
          </div>
          <div className="topbar-right">
            <button className="btn" onClick={() => { setAnalysis(null); setRawLog(''); }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Novo log
            </button>
          </div>
        </nav>

        {/* Workspace */}
        <div className="workspace">
          {/* Sidebar */}
          <aside className="sidebar glass-opaque">
            {/* Stats */}
            <div className="sidebar-section">
              <div className="sidebar-label">Resumo</div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{formatNumber(analysis.entries.length)}</div>
                  <div className="stat-label">Entradas</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{analysis.mods.length}</div>
                  <div className="stat-label">Mods</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{analysis.counts.ERROR + analysis.counts.FATAL}</div>
                  <div className="stat-label">Erros</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{analysis.counts.WARN}</div>
                  <div className="stat-label">Avisos</div>
                </div>
              </div>
            </div>

            {/* Environment info */}
            <div className="sidebar-section">
              <div className="sidebar-label">Ambiente</div>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {analysis.minecraftVersion && (
                  <span className="env-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Minecraft {analysis.minecraftVersion}
                  </span>
                )}
                {analysis.neoForgeVersion && (
                  <span className="env-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    NeoForge {analysis.neoForgeVersion}
                  </span>
                )}
                {analysis.forgeVersion && (
                  <span className="env-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    Forge {analysis.forgeVersion}
                  </span>
                )}
                {analysis.fabricVersion && (
                  <span className="env-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    Fabric {analysis.fabricVersion}
                  </span>
                )}
                {analysis.javaVersion && (
                  <span className="env-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>
                    Java {analysis.javaVersion}
                  </span>
                )}
                {analysis.startupTime && (
                  <span className="env-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {analysis.startupTime}s para iniciar
                  </span>
                )}
                {analysis.crash && (
                  <span className="env-item" style={{ color: 'var(--sev-fatal)' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Crash: {analysis.crash.description}
                  </span>
                )}
              </div>
            </div>

            {/* Severity filter */}
            <div className="sidebar-section">
              <div className="sidebar-label">Severidade</div>
              <div className="sev-filter">
                {([
                  { lvl: 'INFO' as LogLevel, color: 'var(--sev-info)' },
                  { lvl: 'WARN' as LogLevel, color: 'var(--sev-warn)' },
                  { lvl: 'ERROR' as LogLevel, color: 'var(--sev-error)' },
                  { lvl: 'FATAL' as LogLevel, color: 'var(--sev-fatal)' },
                  { lvl: 'DEBUG' as LogLevel, color: 'var(--sev-debug)' },
                ]).map(({ lvl, color }) => (
                  <label key={lvl} className="sev-check">
                    <input type="checkbox" checked={activeLevels.has(lvl)} onChange={() => toggleLevel(lvl)} data-level={lvl} />
                    <span className="sev-dot" style={{ background: color }} />
                    {lvl.charAt(0) + lvl.slice(1).toLowerCase()}
                    <span className="sev-count">{analysis.counts[lvl] || 0}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Active filters */}
            <div className="sidebar-section">
              <div className="sidebar-label">Filtros Ativos</div>
              <div className="active-filters">
                {activeFilters.length === 0 ? (
                  <span className="no-filters-text">Nenhum filtro aplicado</span>
                ) : (
                  activeFilters.map((f, i) => (
                    <span key={i} className="filter-tag">{f}</span>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* Log area */}
          <main className="log-area">
            {/* Tabs Header */}
            <div className="tabs-header">
              <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>Visualizador de Logs</button>
              <button className={`tab-btn ${activeTab === 'diag' ? 'active' : ''}`} onClick={() => setActiveTab('diag')}>Diagnóstico Inteligente</button>
            </div>

            {/* Log Pane */}
            {activeTab === 'logs' && (
              <div className="tab-pane active">
                <div className="log-toolbar">
                  <div className="search-wrapper">
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input
                      type="text"
                      className="input"
                      placeholder="Buscar nos logs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="toolbar-sep" aria-hidden="true" />
                  <span className="log-count">{formatNumber(filteredEntries.length)} entradas</span>
                  <div className="toolbar-right">
                    <button className="btn btn-icon" title="Quebrar linhas longas" onClick={() => setWrapLines(!wrapLines)} style={wrapLines ? { background: 'rgba(255,255,255,0.08)' } : {}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="13 16 11 18 13 20"/><path d="M3 18h4"/></svg>
                    </button>
                    <button className="btn btn-icon" title="Agrupar linhas repetitivas" onClick={() => setHideNoise(!hideNoise)} style={hideNoise ? { background: 'rgba(255,255,255,0.08)' } : {}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    </button>
                    <button className="btn btn-icon" title="Limpar filtros" onClick={() => { setSearchQuery(''); setSourceFilter(null); setActiveLevels(new Set(["INFO","WARN","ERROR","FATAL","DEBUG","UNKNOWN"])); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/><line x1="4" y1="21" x2="20" y2="5" strokeWidth="2"/></svg>
                    </button>
                    <div className="toolbar-sep" aria-hidden="true" />
                    <button className="btn btn-icon" title="Ir ao final" onClick={() => virtuosoRef.current?.scrollToIndex({ index: filteredEntries.length - 1, behavior: 'smooth' })}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
                    </button>
                  </div>
                </div>

                {/* Log list */}
                <div className="log-list-container">
                  {filteredEntries.length === 0 ? (
                    <div className="log-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>Nenhuma entrada encontrada</span>
                      <span className="sub">Tente ajustar os filtros de severidade ou o termo de busca.</span>
                    </div>
                  ) : (
                    <Virtuoso
                      ref={virtuosoRef}
                      data={filteredEntries}
                      className="log-list-viewport"
                      itemContent={(_, entry) => {
                        const a = entry as any;
                        if (a._noiseGroup) {
                          return (
                            <div className="log-row noise-group">
                              <div className="col-line">{a.line}</div>
                              <div className="col-level"><span className={`badge badge-${a.level?.toLowerCase() || 'info'}`}>{a.level}</span></div>
                              <div className="col-message noise-label">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                {a.entries.length} linhas agrupadas — {a.label}
                              </div>
                            </div>
                          );
                        }
                        const isSelected = selectedEntry === entry;
                        return (
                          <div className={`log-row ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedEntry(entry)}>
                            <div className="col-line">{entry.line}</div>
                            <div className="col-level"><span className={`badge badge-${entry.level.toLowerCase()}`}>{entry.level}</span></div>
                            <div className="col-source">{entry.source}</div>
                            <div className={`col-message ${wrapLines ? 'wrap' : ''}`}>{entry.message}</div>
                          </div>
                        );
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Diagnostic Pane */}
            {activeTab === 'diag' && (
              <div className="tab-pane active">
                <div className="diag-content">
                  <h2>Resultado do Diagnóstico ({diagnostics.length} regras ativadas)</h2>
                  {diagnostics.length === 0 ? (
                    <div className="diag-card">
                      <h3>Nenhum Problema Grave Detectado</h3>
                      <p>O Motor de Diagnóstico não encontrou padrões de erros críticos óbvios conhecidos nos logs analisados.</p>
                    </div>
                  ) : (
                    diagnostics.map((hit, idx) => (
                      <div key={idx} className="diag-card">
                        <h3>{hit.title}</h3>
                        <p style={{ color: 'var(--text)', marginBottom: 12 }}><strong>Resumo:</strong> {hit.diagnosis}</p>
                        <strong>Possíveis Soluções:</strong>
                        <ul style={{ margin: '8px 0 0 20px', padding: 0, color: 'var(--text-sec)' }}>
                          {hit.fixes.map((fix, i) => <li key={i}>{fix}</li>)}
                        </ul>
                        {hit.matchedText && (
                          <button
                            className="btn"
                            style={{ marginTop: 16, gap: 6 }}
                            onClick={() => { setSearchQuery(hit.matchedText!); setActiveTab('logs'); }}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            Procurar no Log
                          </button>
                        )}
                      </div>
                    ))
                  )}
                  {analysis.crash && (
                    <div className="diag-card" style={{ opacity: 0.8 }}>
                      <h3>Detalhes do Crash Report Original</h3>
                      <p><strong>Descrição:</strong> {analysis.crash.description}</p>
                      <p><strong>Exceção:</strong> {analysis.crash.exception}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>

          {/* Detail panel */}
          <aside className={`detail-panel glass-opaque ${selectedEntry ? 'active' : ''}`}>
            <div className="detail-header">
              <h3>Detalhes da Entrada</h3>
              <button className="detail-close" onClick={() => setSelectedEntry(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {selectedEntry && (
              <>
                <div className="detail-section">
                  <div className="detail-label">Metadados</div>
                  <div className="detail-meta-grid">
                    <div>
                      <div className="detail-label" style={{ marginBottom: 2 }}>Linha</div>
                      <div className="detail-value">{selectedEntry.line}</div>
                    </div>
                    <div>
                      <div className="detail-label" style={{ marginBottom: 2 }}>Severidade</div>
                      <div className="detail-value"><span className={`badge badge-${selectedEntry.level.toLowerCase()}`}>{selectedEntry.level}</span></div>
                    </div>
                    <div>
                      <div className="detail-label" style={{ marginBottom: 2 }}>Timestamp</div>
                      <div className="detail-value">{selectedEntry.timestamp || '—'}</div>
                    </div>
                    <div>
                      <div className="detail-label" style={{ marginBottom: 2 }}>Thread</div>
                      <div className="detail-value">{selectedEntry.thread || '—'}</div>
                    </div>
                  </div>
                </div>
                <div className="detail-section">
                  <div className="detail-label">Origem</div>
                  <div className="detail-value">{selectedEntry.source || '—'}</div>
                </div>
                <div className="detail-section">
                  <div className="detail-label">Mensagem Completa</div>
                  <div className="detail-message-full">{selectedEntry.message}</div>
                </div>
                <div className="detail-actions">
                  <button className="btn" onClick={() => navigator.clipboard.writeText(selectedEntry.message)}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copiar mensagem
                  </button>
                  <button className="btn" onClick={() => { setSourceFilter(selectedEntry.source); setSelectedEntry(null); }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    Filtrar por origem
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
