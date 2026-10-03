<div align="center">

# 🔍 LogLens

**Leitor e analisador de logs em TypeScript, com CLI e interface web.**
Transforme arquivos de log em informação que dá pra investigar, filtrar e entender, sem precisar de `grep` e paciência.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-Jest-C21325?logo=jest&logoColor=white)](https://jestjs.io/)
[![Deploy](https://img.shields.io/badge/demo-Vercel-000000?logo=vercel&logoColor=white)](https://loglens-nine.vercel.app)
[![License](https://img.shields.io/badge/license-ISC-blue)](#-licença)

[Demo](https://loglens-nine.vercel.app) · [Reportar bug](https://github.com/MaskDMoa/LogLens/issues) · [Sugerir melhoria](https://github.com/MaskDMoa/LogLens/issues)

</div>

---

## 📌 Sobre o projeto

Quem já investigou um bug em produção sabe: o problema quase nunca é *falta* de log, é **excesso de log sem estrutura**. Milhares de linhas, formatos misturados, e a informação importante enterrada no meio.

O **LogLens** nasceu para encurtar esse caminho. Ele lê arquivos de log, interpreta cada linha em uma estrutura tipada e permite explorar o resultado tanto pelo **terminal** quanto por uma **interface web**.

---

## ✨ Funcionalidades

- 📄 **Leitura e parsing** de arquivos de log em estruturas tipadas
- 🔎 **Filtragem e análise** das entradas para localizar rapidamente o que importa
- 💻 **Modo CLI** para uso em terminal, scripts e pipelines
- 🌐 **Interface web** estática para exploração visual dos logs
- 🧪 **Suíte de testes** automatizados com Jest
- 🔒 **Tipagem estrita** com TypeScript

<!-- AJUSTE: detalhe aqui os formatos de log suportados e os filtros disponíveis (nível, intervalo de tempo, texto livre, etc.) -->

---

## 🧱 Stack

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript 5 |
| Runtime | Node.js |
| Execução em dev | `ts-node` |
| Testes | Jest + `ts-jest` |
| Interface web | HTML/CSS/JS estáticos servidos com `serve` |
| Deploy | Vercel |

---

## 📂 Estrutura do projeto

```
LogLens/
├── src/            # Código-fonte (parser, lógica de análise e entrada da CLI)
├── tests/          # Testes automatizados (Jest)
├── web/            # Interface web estática
├── jest.config.js  # Configuração do Jest
├── tsconfig.json   # Configuração do TypeScript
└── package.json
```

---

## 🚀 Como começar

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- npm (já vem com o Node)

### Instalação

```bash
git clone https://github.com/MaskDMoa/LogLens.git
cd LogLens
npm install
```

### Executando a CLI

```bash
npm start
```

Isso executa `ts-node src/index.ts`.

<!-- AJUSTE: se a CLI aceitar argumentos, documente aqui. Exemplo:
npm start -- caminho/do/arquivo.log --level error
-->

### Executando a interface web

```bash
npm run web
```

O comando serve a pasta `web/` localmente. O endereço (normalmente `http://localhost:3000`) aparece no terminal.

Ou acesse a versão publicada: **[loglens-nine.vercel.app](https://loglens-nine.vercel.app)**

---

## 🧪 Testes

```bash
npm test
```

Com relatório de cobertura:

```bash
npx jest --coverage
```

### Estratégia de testes

Um parser de log é o tipo de código que **parece simples e quebra em produção**, porque a entrada real é suja. A estratégia de testes parte dessa premissa:

| Tipo de cenário | O que se valida |
|---|---|
| **Caminho feliz** | Linhas bem formadas são interpretadas corretamente |
| **Entradas inválidas** | Linhas malformadas não derrubam o processamento |
| **Valores-limite** | Arquivo vazio, linha em branco, linha muito longa |
| **Variações de formato** | Timestamps, níveis e separadores diferentes |
| **Caracteres especiais** | Acentuação, unicode, aspas e quebras de linha |
| **Regressão** | Cada bug corrigido ganha um teste que o reproduz |

> 🧭 **Regra do projeto:** se um bug foi encontrado, ele só está "corrigido" quando existe um teste que falharia sem a correção.

---

## ✅ Qualidade e boas práticas

- **Separação de responsabilidades:** a lógica de parsing fica isolada da camada de apresentação (CLI e web), o que torna o núcleo testável sem I/O.
- **Tipagem estrita:** erros de contrato aparecem em tempo de compilação, não em tempo de execução.
- **Testes determinísticos:** sem dependência de relógio, rede ou ordem de execução.
- **Entrada tratada como não confiável:** log é dado externo; o parser deve se comportar bem diante de lixo.

---

## 🤖 Sobre o uso de IA neste projeto

Este projeto foi desenvolvido com forte apoio de IA e é mantido de forma transparente quanto a isso.

Código gerado por IA **não substitui validação**. Por isso, a abordagem adotada é:

1. **Revisar** o que foi gerado como se fosse um pull request de outra pessoa
2. **Cobrir com testes** antes de confiar no comportamento
3. **Testar cenários adversos**, não só o caminho feliz que a IA costuma acertar
4. **Documentar** decisões e limitações conhecidas

---

## 🗺️ Roadmap

- [ ] Suporte a mais formatos de log (JSON estruturado, Apache/Nginx, syslog)
- [ ] Filtros combinados (nível + período + texto)
- [ ] Agrupamento de erros recorrentes
- [ ] Exportação dos resultados (JSON / CSV)
- [ ] Processamento em *streaming* para arquivos grandes
- [ ] Pipeline de CI com GitHub Actions (lint + testes + cobertura)
- [ ] Badge de cobertura de testes

---

## 🤝 Contribuindo

Contribuições são bem-vindas!

1. Faça um fork do projeto
2. Crie uma branch: `git checkout -b feature/minha-melhoria`
3. Escreva os testes **antes ou junto** com a mudança
4. Garanta que tudo passa: `npm test`
5. Commit com mensagem clara: `git commit -m "feat: descrição objetiva"`
6. Abra um Pull Request descrevendo **o que** mudou e **por quê**

### Reportando bugs

Um bom relato de bug economiza horas. Inclua:

- **Passos para reproduzir**
- **Resultado esperado vs. resultado obtido**
- **Um trecho do log** que causou o problema (remova dados sensíveis!)
- Versão do Node.js e sistema operacional

---

## 📄 Licença

Distribuído sob a licença **ISC**. Veja `package.json` para mais detalhes.

---
