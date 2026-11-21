# Roadmap — Frame Genérico

**Objetivo:** uma base robusta e reutilizável para vários sistemas web. Inclui navegação, CRUD dirigido por configuração, dashboard, configurações, segurança e deploy. O primeiro sistema construído em cima dela é o de **finanças pessoais**.

**Princípio:** o frame evolui puxado por um sistema real, não no vácuo. Cada fase do core é validada pelo app de finanças. O que o finanças precisar e for genérico sobe para o core. O que for específico fica no módulo.

---

## Fase 0 — Fundação de engenharia ✅ concluída (07/11/2026)

- Git com histórico e Conventional Commits; npm workspaces (`shared/`, `server/`, `web/`)
- TypeScript strict em todo o projeto (tsx em dev, tsup no build)
- Validação Zod gerada das entidades, a mesma no form e na API
- Knex com migrações versionadas, `db:diff` gerando migração a partir das entidades e CLI
  (migrate/rollback/status/diff/seed/reset)
- `.env` validado no boot e logger estruturado (pino)
- ESLint + Prettier, pre-commit (husky + lint-staged), 39 testes (Vitest + Supertest)
- CI no GitHub Actions (antecipado da Fase 6): lint, tipos, testes, build e migração do zero

## Fase 1 — Segurança e acesso ✅ concluída (08/11/2026)

- Login com sessão em cookie `httpOnly`/`SameSite` (token em hash no banco), "manter conectado", expiração por inatividade
- Senhas com scrypt (nativo do Node), política única no form e na API
- Troca de senha (obrigatória no primeiro acesso, se o admin quiser) e recuperação por e-mail com link de uso único
  (SMTP via `.env`; sem SMTP, o e-mail vai para o log)
- **Perfis editáveis** com matriz recurso × ação; menu, botões e rotas respeitam as permissões; mudanças valem na hora
- Proteções contra lockout e escalada: sempre um admin ativo; só admin gerencia perfis e usuários administradores
- Logs com usuário real, IP e antes/depois de cada campo (tela com detalhe expansível)
- Hardening: helmet/CSP, bloqueio de origem (CSRF), limite de tentativas, mensagens que não revelam e-mails cadastrados
- `db:admin` para criar/recuperar administrador em produção
- Antecipado da Fase 2: **hooks por entidade** (`beforeSave`/`afterSave`/`beforeDelete`)
- Pendente para quando houver necessidade: 2FA, login social/SSO, tela de sessões ativas

## Núcleo genérico (v0.3.0) ✅ concluído (08/11/2026)

- Frame sem nada do sistema de chamados; separação núcleo × aplicação (pastas `app/` em shared, server e web)
- Dashboard genérico, botão "+ Novo", versão no menu e em `/api/health` com aviso de nova versão
- Meu perfil (nome, senha, sessões abertas), Central de Ajuda configurável, estilo do menu (colorido/claro)
- Migrações reescritas numa única migração do núcleo; CHANGELOG

## Fase 2 — Motor de CRUD maduro

_Aqui o frame passa a sustentar sistemas de verdade._

### 2A (v0.4.0) ✅ concluída (08/11/2026)

- Campos: moeda BRL com máscara e cores por sinal, CPF/CNPJ com validação, telefone, cor, multiselect, percentual
- Listagem: ordenação clicável, painel de filtros, período (mês), totais, exportar CSV/Excel, ações em lote,
  colunas visíveis por usuário, itens por página
- Lixeira (soft delete), restauração e esvaziamento automático
- Formulário em seções e selects dependentes
- Módulo de demonstração opcional (`DEMO=true`)

### 2B (v0.5.0) ✅ concluída (08/11/2026)

- Master-detail: sub-tabela no formulário, gravada junto (transação), somas no pai, campos calculados
- Anexos por registro (disco local; S3/R2 fica para a Fase 6)
- Importação de planilha (.xlsx/.csv) com mapeamento, prévia e validação linha a linha
- Telas plugáveis: lista/form próprios por entidade, páginas novas com permissão, slots nas telas genéricas
- **Resultado:** dá para modelar o finanças sem tocar no motor; as regras (saldo, transferência, parcelamento)
  entram como hooks e rotas da aplicação na Fase 3

## Fase 3 — Finanças pessoais (MVP) ← primeiro sistema · funcionalidades concluídas (12/11/2026), em uso

_Começa assim que a Fase 2 tiver o essencial; as duas andam juntas._

- ✅ Entidades: contas, categorias (receita/despesa, hierárquicas), lançamentos, cartões/faturas, orçamento mensal
- ✅ Regras: saldo por conta, transferência entre contas, parcelamento, recorrência
- ✅ Dashboard: saldo consolidado, receitas × despesas, gastos por categoria, orçamento × realizado
- ✅ Importação de extrato OFX/CSV/XLSX e de faturas (PDF/Excel) com categorização assistida; migração do Mobills
- Além do previsto: relatório anual por grupos, detalhamento dos números, faturas quitadas/reabertura, saldo do dia
- **Decidido (12/11/2026):** metas de economia saem da Fase 3 e entram no módulo de investimentos (Fase 7), onde o
  progresso vem da posição real dos ativos, com rendimento, em vez do saldo de contas inteiras
- **Pronto quando:** você usa no dia a dia por um mês sem planilha paralela (uso começou em 12/11/2026). Ao fechar:
  v1.0 do finanças
- Referência visual/funcional (Mobills, 08/11): menu Contas · Transações · Cartões de crédito · Planejamento ·
  Relatórios; botão "+ Novo" para lançar rápido; seletor de mês no topo; cards Saldo atual / Receitas / Despesas;
  gráficos de despesas e receitas por categoria

## Fase 4 — Dashboards e relatórios configuráveis ✅ concluída (12/11/2026, v0.15.0)

- ✅ 4A: fontes de dados + widgets declarativos (card, gráfico, ranking, tabela, componente) e personalização por
  usuário (ocultar/reordenar, guardada no servidor)
- ✅ 4B: conjuntos + relatório dinâmico (evolução mês a mês, comparativo com média, filtros, CSV, impressão/PDF com
  cabeçalho da organização). No finanças: painel em widgets, evolução por categoria, comparativo e fluxo de caixa
  projetado
- ✅ 4C: notificações reais (tipos de alerta do sistema, sino com contador, página com preferências por tipo,
  resumo diário por e-mail). No finanças: fatura vencendo/vencida, orçamento 80%/100%, pendente atrasado,
  recorrência terminando e saldo negativo previsto

## Fase 5 — SaaS: plataforma, espaços e assinantes

- **Decidido (08/11/2026, v0.5.1):** cada sistema é um repositório derivado do frame, com `upstream` = frame-app.
  O sistema só mexe nas pastas `app/` e em `docs/app/`; melhorias no núcleo nascem no frame e descem com
  `git pull upstream main`. Primeiro: `financas`.
- **Decidido (12/11/2026): o finanças vira SaaS para múltiplos assinantes** (referência: Monarch Money)
  - **Isolamento: um banco por espaço** (SQLite por arquivo hoje; um schema por espaço se for para Postgres). O
    isolamento vem da estrutura, não de filtro em consulta; backup/exclusão por assinante (LGPD) triviais
  - **Papéis:** super usuário (plataforma: identidade, assinantes, suporte); no espaço, **dono** (assinante),
    **editor** e **leitor** (convidados, inativáveis pelo dono). O convidado vê o espaço inteiro
  - **Vários espaços por assinante** (pessoal, holding, empresa), com seletor de espaço
  - **Suporte só com consentimento do dono** (liberação temporária, somente leitura por padrão, faixa na tela) e
    **cada acesso registrado no log do espaço**, visível ao dono; 2FA obrigatório para o super usuário
- ✅ **5A — Plataforma e espaços** (12/11/2026, v0.16.0): banco da plataforma (usuários, sessões, identidade,
  espaços, membros) + um banco por espaço, escolhido pela sessão a cada requisição; conversão automática da
  instalação antiga (backup + espaço 1); teste de isolamento que percorre todas as rotas, fontes, relatórios e
  alertas de um espaço procurando dados do outro
- ✅ **5B — Membros** (12/11/2026, v0.17.0): papel no espaço × perfil (dono pode tudo no espaço; editor segue o
  perfil; leitor só vê; backup e configurações só o dono; usuários, perfis e identidade continuam da plataforma);
  perfil "Membro" (acesso completo aos dados, nenhum poder na plataforma) para quem entra por convite; convites por
  e-mail (link único, 7 dias, só para o e-mail convidado, cria a conta se preciso); inativar/reativar/remover, sair;
  ao menos um dono ativo; seletor de espaço no menu do usuário; criar espaços (quem já é dono ou administrador)
- ✅ **5C — Super usuário e suporte** (12/11/2026, v0.18.0): painel da plataforma (contas, espaços, membros,
  tamanho, último acesso — só metadados, nunca os dados); desativar/reativar espaço e conta, encerrar sessões,
  desligar o 2FA de quem perdeu o celular; **acesso de suporte com consentimento**: o dono libera por 24 h, 3 ou 7 dias,
  como leitor (padrão) ou editor, e revoga quando quiser (quem está dentro sai na hora); entrada, saída e alterações
  no log do espaço com "(suporte)"; faixa na tela; suporte não vira membro; **verificação em duas etapas** (TOTP, sem
  dependência externa, QR + 8 códigos de recuperação), obrigatória para administradores em produção
  (`ADMIN_2FA_OBRIGATORIO`). Identidade visual já era global (só administrador)
- ✅ **5D — Cadastro e LGPD** (12/11/2026, v0.19.0): cadastro **fechado por padrão** (beta): o administrador
  convida pelo painel ("Convidar para testar", link de 14 dias) e a pessoa cria a conta já como dona do próprio
  espaço; chave "cadastro aberto" nas Configurações (com confirmação de e-mail, 24 h); termos de uso e política de
  privacidade (texto-base, aceite gravado com a versão); baixar meus dados (JSON); excluir conta (espaços de que é a
  única dona saem junto e ficam guardados 30 dias antes de apagar de vez; nos alheios, o nome sai dos registros);
  **Enviar feedback** dentro do app, lido no painel e avisado por e-mail
- **Decidido (12/11/2026): planos e cobrança ficam para a fase comercial** (Fase 8). Antes, o sistema vai para um
  grupo pequeno de pessoas próximas validarem funcionalidades e usabilidade (beta fechado, sem cobrança)
- Monorepo (`packages/core` + `apps/*`) ou núcleo publicado como pacote npm só se o número de sistemas pedir;
  **CLI de scaffold** (`npm run novo-sistema nome`) quando houver um segundo sistema

## Fase 6 — Produção e mobile

_Próxima: é o que põe o beta nas mãos das pessoas convidadas (endereço na internet, HTTPS, e-mail de verdade,
backup fora do servidor)._

- ✅ **6A — Postgres** (12/11/2026, v0.20.0, decidido já para o beta): plataforma no schema `public`, cada espaço no
  schema `espaco_<id>` (`search_path` só nele); SQLite continua para desenvolvimento; a suíte inteira roda nos dois
  bancos (CI com serviço Postgres); `npm run db:para-postgres` leva uma instalação SQLite com os mesmos ids
  (conferido com os dados reais do finanças: respostas da API idênticas)
- ✅ **6B — Deploy** (13/11/2026, v0.21.0): `deploy/` com Docker (imagem multi-stage), compose com Postgres 16,
  aplicação (migra ao subir), Caddy (HTTPS automático) e backup diário (`pg_dump` + anexos, 14 dias, cópia opcional
  para S3); guia em `deploy/LEIAME.md`. Servidor do beta: **AWS Lightsail, Ohio** (2 GB; São Paulo indisponível na
  conta nova — migrar depois), endereço `<ip>.sslip.io` até haver domínio, e-mail pelo Gmail (senha de app) até
  haver domínio para o SES
- Depois do domínio: SES para e-mail; cópia de backup fora do servidor (bucket); migrar para São Paulo
- **Login social (Google primeiro)**, depois do domínio (o Google não aceita bem `sslip.io` nos domínios autorizados):
  OpenID Connect com code + PKCE no servidor (`/api/auth/google/inicio` e `/retorno`; valida assinatura, `aud`,
  `nonce`, `email_verified`) e a mesma sessão `sid`; tabela `identidades_externas` (usuário, provedor, `sub`; liga
  pelo `sub`, não pelo e-mail); conta existente ligada pelo e-mail verificado; 2FA continua depois do Google;
  cadastro fechado = só quem já tem conta ou chega com convite; aberto = sem confirmar e-mail, com aceite dos termos;
  "Contas conectadas" em Meu perfil (não desligar se ficar sem senha); `GOOGLE_CLIENT_ID`/`SECRET` só no `.env`
  (sem eles o botão não aparece); testes com o Google simulado
- Segurança: cifrar os segredos de 2FA com chave do `.env`; e-mail ao dono quando o suporte entra
- Monitoramento e log de erros (Sentry)
- **PWA:** instalável no celular, com ícone e cache básico. Cobre boa parte do "mobile" sem app nativo.
- React Native/Expo só se surgir necessidade real de recurso nativo, consumindo a mesma API

## Fase 7 — Investimentos (módulo do finanças)

_Depois do sistema no ar (Fases 5 e 6). Específico do finanças: vive nas pastas `app/`; o que for genérico sobe
para o frame._

- Carteira por ativo (renda fixa, Tesouro, ações, FIIs, fundos, previdência), por conta/corretora
- Aportes e resgates ligados às transferências para as contas de investimento; posição e rentabilidade
- **Metas** de economia: valor-alvo e data, alimentadas pelos ativos/aportes alocados a cada meta (uma corretora
  pode atender várias metas); quanto guardar por mês considerando a rentabilidade esperada; alerta de ritmo
- Painel de investimentos: evolução do patrimônio, distribuição por classe, comparação com CDI/IPCA

## Fase 8 — Comercial

_Depois do beta fechado e dos ajustes que vierem do feedback._

- Planos e limites por plano (espaços, membros, anexos), período de teste, cobrança recorrente (Asaas/Stripe, Pix e
  cartão), nota fiscal, termos revisados por advogado, página de apresentação

---

## Ordem e paralelismo

```
Fase 0 ──► Fase 1 ──► Fase 2 ─┬─► Fase 4 ──► Fase 5 ──► Fase 6 ──► Fase 7 (Investimentos)
                              └─► Fase 3 (Finanças) ──┘
```

## Decisões em aberto

1. Migrar para TypeScript agora (recomendado) ou seguir em JavaScript?
2. Knex (query builder, combina com o modelo dirigido por config) ou um ORM tipado como Drizzle?
3. ~~Na Fase 5: instâncias separadas ou multi-tenant?~~ Multi-tenant com um banco por espaço (12/11/2026)
