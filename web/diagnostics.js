// diagnostics.js

window.DiagnosticEngine = (function() {

  const RULES = [
    {
      id: "fabric-missing-or-incompatible-dependency",
      title: "Dependência ausente ou incompatível (Fabric)",
      severity: "critical",
      priority: 10,
      detect: /Incompatible mods? (?:found|set)!|Mod resolution (?:failed|encountered an incompatible mod set)/m,
      run: (log) => {
        const reqMatch = log.match(/Mod '([^']+)' \(([^)]+)\) (\S+) requires ([^\n]+)/);
        if (!reqMatch) return null;
        
        const modName = reqMatch[1];
        const modId = reqMatch[2];
        const requirement = reqMatch[4];
        
        let diagnosis = `O Fabric não conseguiu carregar o conjunto de mods. O mod '${modName}' (${modId}) exige: ${requirement}.`;
        if (requirement.includes("which is missing")) {
          diagnosis = `Falta instalar a dependência exigida por '${modName}': ${requirement}.`;
        } else if (requirement.includes("but only")) {
          diagnosis = `A dependência de '${modName}' está instalada, mas em versão fora da faixa exigida: ${requirement}.`;
        } else if (requirement.includes("1.17") || requirement.includes("1.16") || requirement.includes("1.18") || requirement.includes("1.19") || requirement.includes("1.20")) {
           diagnosis = `Há mods feitos para outra versão do Minecraft misturados com o seu modpack.`;
        }
        
        return {
          title: "Dependência ausente ou incompatível (Fabric)",
          diagnosis: diagnosis,
          fixes: [
            "Aplicar a correção que o próprio Fabric sugere nas mensagens 'Install' / 'Replace' do log.",
            "Instalar ou atualizar a dependência citada para uma versão compatível.",
            "Remover mods feitos para outra versão do Minecraft."
          ]
        };
      }
    },
    {
      id: "forge-missing-or-unsupported-dependency",
      title: "Dependência ausente ou fora da faixa (Forge/NeoForge)",
      severity: "critical",
      priority: 10,
      detect: /Missing or unsupported mandatory dependencies:|Missing mandatory dependencies:/m,
      run: (log) => {
        const match = log.match(/Mod ID: '([^']+)', Requested by: '([^']+)', Expected range: '([^']+)', Actual version: '([^']+)'/);
        if (!match) return null;
        
        const depId = match[1];
        const requestedBy = match[2];
        const range = match[3];
        const actual = match[4];
        
        let diagnosis = `O mod '${requestedBy}' exige '${depId}' na faixa ${range}, mas a versão encontrada é ${actual}.`;
        if (actual === "[MISSING]") {
           diagnosis = `Falta instalar o mod '${depId}' (exigido por '${requestedBy}', na versão ${range}).`;
        } else if (depId === "forge" || depId === "neoforge") {
           diagnosis = `A versão do loader instalada (${actual}) não atende '${requestedBy}' (exige ${range}). Atualize o Forge/NeoForge ou use um mod compatível com sua versão.`;
        } else {
           diagnosis = `O mod '${depId}' está instalado na versão ${actual}, que não atende a exigência de '${requestedBy}' (${range}).`;
        }
        
        return {
          title: "Dependência de Mod Incompatível (Forge/NeoForge)",
          diagnosis,
          fixes: [
            "Instalar ou atualizar a dependência listada, respeitando a versão requerida.",
            "Conferir se a versão do Forge e do Minecraft estão corretas.",
            "A página do CurseForge nem sempre mostra todas as dependências, confie no log."
          ]
        };
      }
    },
    {
      id: "java-version-too-old",
      title: "Java antigo para os Mods",
      severity: "critical",
      priority: 10,
      detect: /UnsupportedClassVersionError|Unsupported class file major version \d+/m,
      run: (log) => {
        let reqJava = null;
        let curJava = null;
        
        const m1 = log.match(/class file version (\d+)\.\d+\), this version of the Java Runtime only recognizes class file versions up to (\d+)\.\d+/);
        if (m1) {
          reqJava = parseInt(m1[1]) - 44;
          curJava = parseInt(m1[2]) - 44;
        } else {
          const m2 = log.match(/Unsupported class file major version (\d+)/);
          if (m2) reqJava = parseInt(m2[1]) - 44;
        }
        
        if (!reqJava) return null;
        
        const diagnosis = curJava 
          ? `O jogo ou um mod exige Java ${reqJava}, mas você está rodando com Java ${curJava}.` 
          : `O jogo ou um mod exige Java ${reqJava}, que não é suportado pelo Java atual.`;
          
        return {
          title: "Java desatualizado ou incompatível",
          diagnosis,
          fixes: [
            `Instale o Java ${reqJava} (JDK) e configure o seu Launcher para usá-lo.`,
            "Dica: Minecraft 1.18 a 1.20.4 usa Java 17. A partir do 1.20.5, usa Java 21."
          ]
        };
      }
    },
    {
      id: "java-version-too-new-for-loader",
      title: "Java mais novo do que o loader suporta",
      severity: "critical",
      priority: 18,
      detect: /cannot be cast to class java\.net\.URLClassLoader|Class file major version \d+ is not supported by active ASM|Level is not supported by the active JRE or ASM/m,
      run: (log) => {
        return {
          title: "Incompatibilidade: Java Moderno Demais",
          diagnosis: "O Forge e os mods (principalmente antigos) usam bibliotecas da JVM que quebram em versões muito novas do Java.",
          fixes: [
            "Use a versão exata de Java recomendada (Java 8 para 1.12, Java 17 para 1.18-1.20.4).",
            "Se estiver usando Java 21 num modpack mais antigo, volte para o Java 17.",
            "Atualize o Forge para a versão mais recente caso queira tentar contornar."
          ]
        };
      }
    },
    {
      id: "out-of-memory",
      title: "Falta de Memória (OutOfMemoryError)",
      severity: "critical",
      priority: 15,
      detect: /java\.lang\.OutOfMemoryError: (Java heap space|GC overhead limit exceeded|Metaspace)/m,
      run: (log) => {
        const match = log.match(/java\.lang\.OutOfMemoryError: (Java heap space|GC overhead limit exceeded|Metaspace)/);
        const kind = match ? match[1] : "Java heap space";
        
        let diagnosis = `O jogo ficou sem memória (${kind}). O mod listado no topo do crash geralmente não é o culpado, ele apenas deu azar de ser o último a pedir memória.`;
        if (kind === "GC overhead limit exceeded") {
           diagnosis = "O jogo passou quase todo o tempo apenas tentando limpar a memória (Garbage Collection), sinal clássico de RAM insuficiente ou memory leak.";
        } else if (kind === "Metaspace") {
           diagnosis = "O espaço de metadados da JVM acabou (Metaspace). Você pode tentar fechar o jogo e reabrir.";
        }

        return {
          title: "Falta de Memória RAM (OutOfMemory)",
          diagnosis,
          fixes: [
            "Aumente a quantidade de memória RAM alocada para o jogo no seu launcher.",
            "Evite alocar 100% da sua RAM. Deixe pelo menos 2-3 GB para o Windows.",
            "Confirme se o Java instalado é a versão de 64-bits."
          ]
        }
      }
    },
    {
      id: "jvm-heap-reservation-failed",
      title: "RAM alocada é maior que o sistema aguenta",
      severity: "critical",
      priority: 16,
      detect: /Could not reserve enough space for object heap|Error occurred during initialization of VM/m,
      run: (log) => {
         return {
            title: "Falha ao reservar memória para o Java",
            diagnosis: "O Java não conseguiu separar a memória que você pediu (RAM). Ou o PC não tem essa RAM livre no momento, ou o Java de 32-bits atingiu seu limite interno (~1.5GB).",
            fixes: [
               "Diminua o limite de RAM alocada para o jogo.",
               "Feche outros programas abertos no PC, como o Google Chrome.",
               "Certifique-se de estar rodando Java de 64-bits."
            ]
         }
      }
    },
    {
      id: "mixin-conflict-between-mods",
      title: "Conflito de Mixin entre mods",
      severity: "critical",
      priority: 30,
      detect: /InvalidInjectionException.*merged by ([\w.$]+)/m,
      run: (log) => {
        const match = log.match(/Mixin apply for mod ([\w.-]+) failed ([\w.-]+\.json):([\w.$]+)/);
        const modId = match ? match[1] : "um mod";
        const otherMatch = log.match(/merged by ([\w.$]+)/);
        const otherMixin = otherMatch ? otherMatch[1] : "outro mod";

        return {
          title: "Conflito Direto de Programação (Mixin)",
          diagnosis: `O mod '${modId}' tentou modificar o núcleo do jogo, mas aquela parte exata já havia sido modificada por outro mod (provavelmente ${otherMixin}).`,
          fixes: [
             "Remova um dos mods para confirmar o conflito.",
             "Atualize ambos os mods para a versão mais recente, pois os desenvolvedores podem ter resolvido a incompatibilidade.",
             "Procure na página oficial dos mods se há patches de compatibilidade."
          ]
        };
      }
    },
    {
      id: "mixin-target-not-found",
      title: "Mod feito para outra versão (Falha de Mixin)",
      severity: "critical",
      priority: 35,
      detect: /InvalidInjectionException.*could not find any targets matching|Mixin apply (?:for mod \S+ )?failed/m,
      run: (log) => {
        if (log.includes("---- Minecraft Crash Report ----") || log.includes("FATAL") || log.includes("ERROR")) {
           const match = log.match(/Mixin apply for mod ([\w.-]+) failed/);
           const modId = match ? match[1] : "Um mod";
           return {
              title: "Mod Incompatível com a Versão do Jogo (Target Not Found)",
              diagnosis: `${modId} não encontrou o código do Minecraft que ele tentou modificar. Na esmagadora maioria das vezes, isso significa que você baixou a versão errada do mod (ex: mod da 1.19 num jogo 1.20).`,
              fixes: [
                 "Conferir se a versão de todos os mods bate exatamente com a versão do Minecraft e do Loader.",
                 "Exclua os mods apontados nos avisos de erro logo antes do fechamento."
              ]
           };
        }
        return null;
      }
    },
    {
      id: "opengl-driver-unsupported",
      title: "Placa de vídeo não suporta OpenGL",
      severity: "critical",
      priority: 40,
      detect: /GLFW error 65542|The driver does not appear to support OpenGL|OpenGL: NO CONTEXT/m,
      run: (log) => {
         return {
            title: "Erro de Placa de Vídeo (Driver Gráfico)",
            diagnosis: "O jogo não conseguiu abrir a janela de renderização 3D. A sua placa de vídeo (ou o driver dela) não suporta a versão necessária do OpenGL.",
            fixes: [
               "Atualize o driver da sua placa de vídeo baixando o programa direto do site do fabricante (NVIDIA, AMD ou Intel).",
               "Se você está num notebook, certifique-se de que o jogo está rodando pela Placa Dedicada e não pela Placa Integrada.",
               "Reinicie o PC."
            ]
         };
      }
    },
    {
      id: "mod-loading-failure-generic",
      title: "Falha de Carregamento (Erro Genérico)",
      severity: "critical",
      priority: 99,
      detect: /Mod loading failures have occurred/m,
      run: (log) => {
         return {
            title: "Mod Loading Failures",
            diagnosis: "O Forge/NeoForge reportou que um ou mais mods falharam ao carregar, o que causou o crash. Esse é um erro 'genérico' e a causa real está sempre detalhada nas linhas um pouco antes desse erro no log.",
            fixes: [
               "Verifique se o Diagnóstico apontou dependências ausentes ou mods incompatíveis acima.",
               "Volte para a aba 'Visualizador de Logs', filtre por 'ERROR' e procure por mensagens detalhadas antes do crash report."
            ]
         };
      }
    },
    {
      id: "duplicate-mods",
      title: "Mods duplicados na pasta",
      severity: "critical",
      priority: 12,
      detect: /DuplicateModsFoundException|Duplicate Mods:/m,
      run: (log) => {
         const matches = [...log.matchAll(/^\s+(\S+) : ([^\n]+\.jar)\s*$/gm)];
         let mods = "";
         if (matches.length > 0) {
            mods = matches.map(m => m[2]).join(", ");
         }

         return {
            title: "Mods Duplicados",
            diagnosis: `O Minecraft detectou o mesmo mod mais de uma vez dentro da pasta 'mods'. Isso destrói o carregamento do Forge. ${mods ? "(Arquivos: " + mods + ")" : ""}`,
            fixes: [
               "Abra a pasta 'mods' e apague as versões antigas dos mods repetidos.",
               "Lembre-se de não deixar subpastas (como 'backups') com jars originais dentro da pasta 'mods'."
            ]
         }
      }
    }
  ];

  function runDiagnostics(rawLog) {
    const hits = [];
    
    // Sort rules by priority (lower is more important)
    RULES.sort((a, b) => a.priority - b.priority);

    for (const rule of RULES) {
      const match = rule.detect.exec(rawLog);
      if (match) {
        try {
          const result = rule.run(rawLog);
          if (result) {
            // Save the exact line that triggered the rule to jump to it later
            result.matchedText = match[0].split('\n')[0].trim();
            hits.push(result);
          }
        } catch (e) {
          console.error("Diagnostic rule error:", rule.id, e);
        }
      }
    }
    
    return hits;
  }

  return { runDiagnostics };
})();
