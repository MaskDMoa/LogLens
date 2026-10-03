import React, { useState, useMemo } from 'react';
import type { LogEntry, LogAnalysis, LogLevel } from './lib/types';
import { analyzeLog, groupNoise } from './lib/parser';
import { runDiagnostics } from './lib/diagnostics';
import { Upload, FileText, Activity, Search, Box, ShieldAlert, Coffee, Wrench } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';

function levelBadge(level: string) {
  const map: Record<string, string> = {
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    FATAL: "fatal",
    DEBUG: "debug",
    UNKNOWN: "unknown",
  };
  return map[level] || "unknown";
}

export default function App() {
  const [rawLog, setRawLog] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);
  
  const [activeTab, setActiveTab] = useState<'logs' | 'diag'>('logs');
  const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(new Set(["INFO", "WARN", "ERROR", "FATAL", "DEBUG", "UNKNOWN"]));
  const [searchQuery, setSearchQuery] = useState('');
  const [hideNoise, setHideNoise] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawLog(text);
      setFileName(file.name);
      setAnalysis(analyzeLog(text));
    };
    reader.readAsText(file);
  };

  const filteredEntries = useMemo(() => {
    if (!analysis) return [];
    let result = analysis.entries.filter((e) => {
      if (!activeLevels.has(e.level)) return false;
      if (searchQuery && !e.message.toLowerCase().includes(searchQuery) && !e.source.toLowerCase().includes(searchQuery)) {
        return false;
      }
      return true;
    });

    if (hideNoise && !searchQuery) {
      result = groupNoise(result);
    }

    return result;
  }, [analysis, activeLevels, searchQuery, hideNoise]);

  const toggleLevel = (lvl: LogLevel) => {
    const newLevels = new Set(activeLevels);
    if (newLevels.has(lvl)) newLevels.delete(lvl);
    else newLevels.add(lvl);
    setActiveLevels(newLevels);
  };

  if (!analysis) {
    return (
      <div className="layout">
        <aside className="sidebar glass">
          <div className="brand">
            <div className="logo-icon"></div>
            <h1>Log<span>Lens</span></h1>
          </div>
        </aside>
        <main className="log-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="upload-box" style={{ textAlign: 'center' }}>
            <Upload size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
            <h2>Solte seu arquivo de log aqui</h2>
            <p style={{ color: 'var(--text-sec)', margin: '8px 0 24px' }}>ou clique para selecionar (latest.log, crash-report.txt)</p>
            <input type="file" id="file-upload" style={{ display: 'none' }} onChange={handleFileUpload} />
            <label htmlFor="file-upload" className="btn">Escolher arquivo</label>
          </div>
        </main>
      </div>
    );
  }

  const diagnostics = runDiagnostics(rawLog);

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar glass">
        <div className="brand">
          <div className="logo-icon"></div>
          <h1>Log<span>Lens</span></h1>
        </div>

        <div className="file-info" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <FileText size={16} />
          <span style={{ fontSize: 13, color: 'var(--text-sec)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</span>
        </div>

        {/* Counts */}
        <div className="sidebar-section">
          <div className="sidebar-label">Resumo</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="stat-card">
              <span className="stat-value">{analysis.entries.length}</span>
              <span className="stat-label">Entradas</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{analysis.mods.length}</span>
              <span className="stat-label">Mods</span>
            </div>
            <div className="stat-card stat-errors">
              <span className="stat-value">{analysis.counts.ERROR + analysis.counts.FATAL}</span>
              <span className="stat-label">Erros</span>
            </div>
            <div className="stat-card stat-warnings">
              <span className="stat-value">{analysis.counts.WARN}</span>
              <span className="stat-label">Avisos</span>
            </div>
          </div>
        </div>

        {/* Env */}
        <div className="sidebar-section">
          <div className="sidebar-label">Ambiente</div>
          <div className="env-info" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analysis.minecraftVersion && <span className="env-item"><Box size={14} /> Minecraft {analysis.minecraftVersion}</span>}
            {analysis.fabricVersion && <span className="env-item"><Wrench size={14} /> Fabric {analysis.fabricVersion}</span>}
            {analysis.forgeVersion && <span className="env-item"><Wrench size={14} /> Forge {analysis.forgeVersion}</span>}
            {analysis.neoForgeVersion && <span className="env-item"><Wrench size={14} /> NeoForge {analysis.neoForgeVersion}</span>}
            {analysis.javaVersion && <span className="env-item"><Coffee size={14} /> Java {analysis.javaVersion}</span>}
            {analysis.startupTime && <span className="env-item"><Activity size={14} /> {analysis.startupTime}s para iniciar</span>}
            {analysis.crash && <span className="env-item" style={{ color: 'var(--color-fatal)' }}><ShieldAlert size={14} /> Crash: {analysis.crash.description}</span>}
          </div>
        </div>

        {/* Filters */}
        <div className="sidebar-section">
          <div className="sidebar-label">Filtros de Severidade</div>
          <div className="sev-filter">
            {(["FATAL", "ERROR", "WARN", "INFO", "DEBUG"] as LogLevel[]).map(lvl => (
              <label key={lvl} className="sev-check">
                <input type="checkbox" checked={activeLevels.has(lvl)} onChange={() => toggleLevel(lvl)} />
                <span className={`badge badge-${levelBadge(lvl)}`} style={{ minWidth: 50, textAlign: 'center' }}>{lvl}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 'auto' }}>{analysis.counts[lvl] || 0}</span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="log-area">
        <div className="tabs-header">
          <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>Visualizador de Logs</button>
          <button className={`tab-btn ${activeTab === 'diag' ? 'active' : ''}`} onClick={() => setActiveTab('diag')}>Diagnóstico Inteligente</button>
        </div>

        {activeTab === 'logs' && (
          <div className="tab-pane active" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="log-toolbar">
              <div className="search-wrapper">
                <Search size={16} style={{ color: 'var(--text-dim)' }} />
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Buscar nos logs..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="toolbar-sep" />
              <span className="log-count">{filteredEntries.length} entradas</span>
              <div className="toolbar-right">
                <button className={`btn btn-icon ${!hideNoise ? 'active' : ''}`} onClick={() => setHideNoise(!hideNoise)} title="Agrupar ruído">
                  <Activity size={16} />
                </button>
              </div>
            </div>
            
            <div style={{ flex: 1, minHeight: 0 }}>
              <Virtuoso
                data={filteredEntries}
                itemContent={(_, entry) => {
                  const anyEntry = entry as any;
                  if (anyEntry._noiseGroup) {
                    return (
                      <div className="log-entry noise-group-row">
                        <div className="noise-group-header">
                          <Activity size={14} />
                          <span>{anyEntry.entries.length} linhas agrupadass ({anyEntry.label})</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className={`log-entry ${selectedEntry === entry ? 'selected' : ''}`} onClick={() => setSelectedEntry(entry)}>
                      <div className="col-line">{entry.line}</div>
                      <div className="col-level">
                        <span className={`badge badge-${levelBadge(entry.level)}`}>{entry.level}</span>
                      </div>
                      <div className="col-source">{entry.source}</div>
                      <div className="col-message">{entry.message}</div>
                    </div>
                  );
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'diag' && (
          <div className="tab-pane active" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
                    <h3>🚨 {hit.title}</h3>
                    <p style={{ color: 'var(--text-main)', marginBottom: 12 }}><strong>Resumo:</strong> {hit.diagnosis}</p>
                    <strong>Possíveis Soluções:</strong>
                    <ul style={{ margin: '8px 0 0 20px', padding: 0, color: 'var(--text-sec)' }}>
                      {hit.fixes.map((fix, i) => <li key={i}>{fix}</li>)}
                    </ul>
                    {hit.matchedText && (
                      <button 
                        className="btn btn-jump-to-error" 
                        style={{ marginTop: 16, background: 'rgba(255,255,255,0.1)' }}
                        onClick={() => {
                          setSearchQuery(hit.matchedText!);
                          setActiveTab('logs');
                        }}
                      >
                        <Search size={14} style={{ marginRight: 6 }} /> Procurar no Log
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
      {selectedEntry && (
        <aside className="detail-panel glass-opaque active">
          <div className="detail-header">
            <h3>Detalhes da Entrada</h3>
            <button className="btn btn-icon" onClick={() => setSelectedEntry(null)}>✕</button>
          </div>
          <div className="detail-content">
            <div className="detail-section">
              <div className="detail-label">Linha</div>
              <div>{selectedEntry.line}</div>
            </div>
            <div className="detail-section">
              <div className="detail-label">Nível</div>
              <div><span className={`badge badge-${levelBadge(selectedEntry.level)}`}>{selectedEntry.level}</span></div>
            </div>
            <div className="detail-section">
              <div className="detail-label">Mensagem Completa</div>
              <div className="detail-message-full">{selectedEntry.message}</div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
