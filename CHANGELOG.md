# Changelog

Versões do frame. O número exibido no rodapé do menu vem do `package.json` da raiz, junto com o commit do git.
Use [versionamento semântico](https://semver.org/lang/pt-BR/): **MAIOR** quebra compatibilidade, **MENOR** traz
novidades, **CORREÇÃO** só corrige.

## 0.31.0 — 21/11/2026

- **Campo de relação com busca** (`components/RelationSelect.tsx`, usado pelo `FieldInput` em formulários,
  sub-tabelas e edição em lote): digitar filtra a lista (sem diferenciar acento e maiúsculas), setas + Enter escolhem,
  Esc fecha, "—" limpa quando o campo não é obrigatório; a lista abre com posição fixa (não é cortada dentro de
  tabelas). Desenha até 200 itens por vez; a busca alcança todos
- **Opções de relação em ordem alfabética do português** (`relationOptions`): antes o SQLite punha maiúsculas antes
  das minúsculas e os acentos no fim ("e-Core" depois de "Zeta"); agora "Ágil" fica junto de "Agile" e "item 9"
  antes de "item 10"
- **Filtro de relação com muitas opções** (painel de filtros, mais de 12): busca + lista de marcação, com os
  marcados no topo e "Limpar" (antes, um select múltiplo que pedia Ctrl/Cmd)

## 0.30.0 — 20/11/2026

- **Sub-tabela desenhada pelo sistema** (CrudForm `detalhes`): `{ [entidade das linhas]: (ctx) => ReactNode }` troca
  a tabela genérica do master-detail por uma própria, no mesmo lugar, com as linhas, `setRows`, os valores e o `set`
  do registro pai, os erros e as opções de relação. A gravação continua a mesma (pai + linhas numa transação)
- **Célula desenhada pelo sistema** (CrudList `celulas`): `{ [campo]: (linha, padrão) => ReactNode }` (ex.: um selo
  ao lado do valor padrão)
- **Filtro que casa na sub-tabela** (`FieldDef.filtraDetalhe: { entidade, campo }`): o filtro de igualdade do campo
  também traz o registro quando uma linha da sub-tabela tem o valor (ex.: lançamento rateado aparece no filtro da
  categoria de uma das partes)

## 0.29.0 — 19/11/2026

- **Tokens de integração** (`server/src/auth/integracao.ts`): acesso sem navegador (atalho do celular, automação,
  outro sistema) com `Authorization: Bearer fi_...`. O sistema registra o que cada tipo pode fazer com
  `registerEscopoIntegracao({ escopo, nome, descricao, rotas: ['POST /api/...'] })`; o token só abre essas rotas
  (o resto dá 403), vale num espaço só (o da sessão em que foi criado, enquanto o usuário for membro), segue as
  permissões e o papel do usuário, é guardado só como hash (tabela `tokens_integracao` na plataforma), registra o
  último uso, é revogável e limitado a 60 requisições por minuto. Não gerencia tokens nem acessa `/api/auth`
- Meu perfil → **Integrações** (`components/IntegracoesCard.tsx`): gerar (o token aparece uma vez), listar e revogar;
  só aparece quando há escopo registrado

## 0.28.0 — 18/11/2026

- **Filtros extras** (`EntityDef.filtrosExtras`): filtro que não é campo da entidade, para as linhas extras do sistema
  (`listExtras`) — opção no painel de filtros (com o rótulo do padrão), chip nos filtros ativos e parâmetro na URL;
  a consulta dos registros o ignora e o hook decide

## 0.27.0 — 18/11/2026

- **Listagem agrupada**: `EntityDef.agrupar` (ex.: `'classe'`) mostra um título por grupo, com a quantidade, que abre e
  fecha com um clique; o que ficou fechado é lembrado por usuário (`lista.<entidade>.recolhidos`). Em `select`, os
  grupos seguem a ordem das opções; vazio vai por último ("Sem <rótulo>")
- `usePreferencia(null)`: não busca nem grava (para preferência condicional)

## 0.26.1 — 17/11/2026

- Campo numérico aceita **vírgula decimal**: virou um campo de texto com teclado decimal no celular ("0,5", "0.5" e
  "1.234,56"). O `type="number"` do navegador em português descartava a vírgula e "0,5" virava 5 — quantidades
  menores que 1 (cotas, cripto) não entravam certas

## 0.26.0 — 17/11/2026

- **Coluna emprestada da relação** (`deRelacao: { relacao, campo }` no campo): mostra, ordena e busca na listagem um
  campo do registro relacionado (ex.: o código do ativo numa lista de operações), sem gravar coluna nova nem
  aparecer no formulário/importação
- **Busca pela relação**: campo `relation` com `search: true` busca no nome e nos campos de busca do registro
  relacionado

## 0.25.0 — 16/11/2026

- Importação: relação também pelo **código** — `chavesImportacao` na entidade apontada (ex.: `['codigo']`) faz
  "PETR4" achar o ativo "Petrobras"; o código tem prioridade sobre o nome
- Importação: nome repetido em mais de um registro agora dá erro na linha ("use um nome único"), em vez de ligar
  ao registro errado sem avisar

## 0.24.0 — 16/11/2026

- **Tarefas diárias em horário fixo** (`services/agenda.ts`): o sistema registra com
  `registrarTarefaDiaria({ nome, horarios: ['19:30'], executar })` e o boot confere a cada minuto o que já passou
  da hora e ainda não rodou hoje (ex.: buscar cotações depois do fechamento da bolsa). Falha vai para o log e não
  derruba as outras
- Número na listagem com até 8 casas decimais (cotas de fundo, cripto), em vez de 3

## 0.23.1 — 15/11/2026

- Entidade aceita `listOrder`: a ordem das colunas da listagem pode ser diferente da do formulário

## 0.23.0 — 15/11/2026

- `CrudForm` aceita `campos` (o sistema desenha um campo no lugar do genérico — mesmo lugar e largura — e pode
  preencher outros campos com `set`) e `ocultar(values)` (esconde campos conforme o que está preenchido; continuam
  sendo enviados)

## 0.22.1 — 14/11/2026

- Listagem: ligar/desligar na linha (ex.: efetivado) recarrega a lista sem piscar — totais e linhas extras
  (saldos do dia) são recalculados; o mesmo depois de excluir, restaurar, editar em lote e importar
- `CrudList` aceita `onAlterado` (avisa o que depende da lista, como os cards do `before`)
- "Novo" numa lista filtrada já vem com os filtros de um valor só (`presetDoFiltro`): lista da conta X → novo
  registro na conta X

## 0.22.0 — 13/11/2026

**Espaço modelo**

- O administrador marca um espaço como **modelo** (Plataforma → ações do espaço; só um por vez, precisa estar ativo)
- O sistema registra o que se copia dele com `registrarCopiaDoModelo({ nome, copiar(destino, modelo, { novo }) })`
  (bibliotecas, cadastros padrão — nunca movimentos); espaço novo recebe na criação
- Espaços que já existem: o dono traz as novidades (`POST /api/espaco/modelo`, botão `<TrazerDoModelo>`), sem
  sobrescrever o que personalizou; registrado no log do espaço
- `CrudList` aceita `actions` (botões extras no cabeçalho)

## 0.21.1 — 13/11/2026

**Falha no envio de e-mail com mensagem clara**

- Servidor de e-mail recusando (senha errada, fora do ar): em vez de "Erro interno", 502 `EMAIL_FALHOU` com
  explicação; o motivo técnico (código e resposta do servidor) vai para o log como "falha ao enviar e-mail"
- Convite para o espaço ou para a plataforma: fica registrado e a tela avisa que o e-mail não saiu (use Reenviar
  depois de corrigir); o log do espaço registra "convite registrado (e-mail não enviado)"
- Esqueci a senha: a resposta continua igual (não revela quem é cadastrado); o log registra que o e-mail não saiu
- Guia de deploy: depois de mudar o `deploy/.env`, `dc up -d app` (o `restart` não relê o arquivo); conferência da
  senha do SMTP

## 0.21.0 — 13/11/2026

**Fase 6B: colocar no ar**

- `deploy/`: imagem Docker de produção (multi-stage, só dependências de produção, fuso de Brasília), compose com
  **Postgres 16**, **aplicação** (aplica as migrações ao subir), **Caddy** (HTTPS automático com Let's Encrypt) e
  **backup** diário (`pg_dump` do banco inteiro + anexos, guardados 14 dias, cópia opcional para S3)
- Guia passo a passo em `deploy/LEIAME.md`: chave de implantação do GitHub, configuração, trazer a instalação SQLite
  (`para-postgres`), subir, atualizar (`deploy/atualizar.sh`), backup e restauração
- Sem domínio: funciona com `<ip>.sslip.io` (HTTPS de verdade); e-mail por SMTP de qualquer provedor (ex.: Gmail)
- Política de privacidade avisa que os servidores podem ficar fora do Brasil

## 0.20.0 — 12/11/2026

**Fase 6A: Postgres**

- `DATABASE_URL=postgres://...` liga o Postgres: plataforma no schema `public`, **cada espaço no próprio schema**
  (`espaco_<id>`), com a conexão presa a ele (`search_path`) — o mesmo isolamento dos arquivos. Sem a variável,
  continua o SQLite em arquivos (desenvolvimento)
- `npm run db:para-postgres`: copia a instalação SQLite (plataforma + espaços) para um Postgres vazio, com os mesmos
  ids, sequências acertadas e contagens conferidas; os arquivos originais ficam intactos
- **A suíte inteira roda nos dois bancos** (`TESTE_PG_URL`); o CI ganhou um job com Postgres 16, que também aplica as
  migrações e o seed do zero
- Diferenças tratadas: id de INSERT (`inserir`), busca sem diferenciar maiúsculas (`likeOp`), datas inválidas da URL
  (`dataValida`: 31/11 vira 30/11), decimais/contagens como número e datas como texto, booleanos sempre true/false
  na API (antes 0/1 no SQLite)
- Backup do espaço no Postgres: JSON com todas as tabelas; tamanho dos espaços no painel pelo Postgres; exclusão de
  espaço renomeia o schema e o apaga de vez em 30 dias
- `.gitignore`: backups em `server/data/backup-*`

## 0.19.0 — 12/11/2026

**Fase 5D: cadastro, LGPD e feedback — pronto para um beta fechado**

- **Cadastro fechado por padrão**: o administrador convida em Plataforma → **Convidar para testar**; a pessoa recebe
  o link (14 dias), cria a conta com aquele e-mail, aceita os termos e entra já como dona do próprio espaço
- **Cadastro aberto** (Configurações → Acesso): qualquer pessoa cria conta; o login só libera depois de confirmar o
  e-mail (link de 24 h, que já cria o espaço e entra). A resposta não revela se o e-mail já tinha conta; cadastros
  nunca confirmados saem em 7 dias
- **Termos de uso e política de privacidade** (`/termos`, `/privacidade`, links no rodapé), com o aceite gravado e
  a versão; também no aceite de convite para espaço
- **Baixar meus dados** (Meu perfil): JSON com a conta, sessões, acessos e os dados completos dos espaços de que é
  dono (dos outros, só o que é seu)
- **Excluir minha conta** (Meu perfil, senha + "EXCLUIR" + código 2FA se ligado): espaços de que é o único dono saem
  junto (guardados 30 dias e depois apagados de vez, com os anexos); nos espaços de outras pessoas o nome sai dos
  registros; logs da plataforma sem nome/e-mail; e-mail de confirmação. O único administrador não se exclui
- **Enviar feedback** (menu do usuário): sugestão, problema ou elogio, com a página e a versão; chega por e-mail aos
  administradores e fica em Plataforma → Feedback (marcar lido, responder por e-mail)
- Configurações booleanas da identidade gravadas corretamente

## 0.18.0 — 12/11/2026

**Fase 5C: super usuário, suporte com consentimento e verificação em duas etapas**

- **Verificação em duas etapas** (Meu perfil): aplicativo autenticador (QR ou chave), 8 códigos de recuperação de
  uso único, login em duas etapas (desafio de 5 min, 5 tentativas, o mesmo código não vale duas vezes). Obrigatória
  para administradores com `ADMIN_2FA_OBRIGATORIO` (padrão: ligado em produção): até configurar, só a tela de
  configuração abre. `db:admin` (recuperar acesso) também desliga o 2FA
- **Painel da plataforma** (Administração → Plataforma, só administradores): contas, espaços, membros, sessões,
  tamanho dos bancos e último acesso — **só metadados**. Desativar/reativar espaço (todos saem na hora) e conta,
  encerrar sessões, desligar o 2FA de quem perdeu o celular
- **Acesso de suporte com consentimento** (Membros → Acesso do suporte): o dono libera por 24 h, 3 ou 7 dias, para
  só ver ou para alterar, e encerra quando quiser. O administrador entra pelo painel, com faixa "Modo suporte" na
  tela; não vira membro; entrada, saída e tudo o que alterar ficam no log do espaço com "(suporte)"
- Remover um membro apaga as notificações e preferências dele naquele espaço
- Demonstração: tabelas de exemplo em todo espaço que abrir (`aoAbrirEspaco`), não só no primeiro
- Colunas `segredo_*` nunca saem da API (o CRUD remove)

## 0.17.0 — 12/11/2026

**Fase 5B: membros, convites e vários espaços**

- **Papel no espaço**: dono (tudo no espaço: membros, configurações do sistema, backup), editor (altera os dados,
  conforme o perfil) e leitor (só vê). Usuários, perfis e identidade visual seguem da plataforma (administrador)
- Perfil **"Membro"** (novo campo `perfis.completo`): acesso a todos os dados dos espaços em que participa, sem
  nenhum poder na plataforma — é o de quem entra por convite. Perfis granulares continuam valendo para editores
- **Convites por e-mail**: link único, válido por 7 dias, uma vez só e só para o e-mail convidado; quem não tem conta
  cria a dela ao aceitar (`/convite/:token`); reenviar gera link novo; cancelar; convite novo substitui o anterior
- **Tela Membros** (Administração → Membros): papéis, inativar/reativar (perde o acesso na hora), remover, convites
  pendentes, editar nome/tipo do espaço; quem não é dono pode sair do espaço. Todo espaço mantém um dono ativo
- **Seletor de espaço** no menu do usuário e **novo espaço** (pessoal, holding, empresa) para quem já é dono
- Identidade visual só para administradores; o dono do espaço vê em Configurações só as do sistema
- Login, troca de senha e perfil devolvem o usuário com os espaços (o front já sabe o papel desde o login)
- `db:diff` compara o espaço só com as entidades do espaço (`entidadesDe`)
- Logs de acesso e de contas vindos da conversão saem do banco do espaço (ficam só na plataforma)

## 0.16.0 — 12/11/2026

**Fase 5A: plataforma e espaços (base do SaaS)** — nada muda na tela; muda onde cada dado mora

- **Um banco por espaço** (`data/espacos/<id>.db`) e o banco da **plataforma** (`data/app.db`: usuários, perfis,
  sessões, identidade, `espacos`, `membros`). O espaço vem da sessão, conferido nos membros a cada requisição; o
  código do sistema usa `dbEspaco`, que sempre aponta para o banco do espaço da sessão
- **Conversão automática** da instalação antiga no primeiro boot (ou `db:migrate`): backup
  `backup-antes-dos-espacos-<data>.db`, dados no espaço 1 ("Pessoal"), plataforma sem dado do sistema, mesmos logins
- O banco do espaço não guarda senha nem sessão (cópia leve dos usuários membros, para nomes e vínculos)
- Usuários (lista, opções, detalhe, edição, lote) restritos aos membros do espaço; id de fora = 404
- `GET /api/auth/me` traz o espaço em uso e a lista; `POST /api/auth/espaco` troca (a tela vem na 5B)
- Logs: a tela mostra os do espaço; administrador vê também os da plataforma (acessos, usuários, identidade)
- Configurações do sistema derivado passam a ser **por espaço**; a identidade visual é da plataforma
- Manutenção diária roda em cada espaço (lixeira, logs, manutenção do app, alertas e e-mails)
- CLI: `db:migrate`/`status`/`rollback`/`seed`/`reset`/`admin` entendem plataforma + espaços (`ESPACOS_DIR`)
- **Teste de isolamento** (`espacos.test.ts`): com dois espaços, percorre todas as entidades (lista, opções,
  exportação, lixeira), logs, painel, backup, configurações, todas as fontes de dados, relatórios e notificações do
  espaço B procurando dados do A; tentativas por id, troca para espaço alheio, membro inativado perde acesso na hora

## 0.15.0 — 12/11/2026

**Fase 4C: notificações reais**

- **Tipos de alerta** registrados pelo sistema (`registerAlerta(tipo, { rotulo, descricao, perm, nivel, icone,
gerar })` em `server/src/services/notificacoes.ts`): cada aviso tem uma **chave**; o frame grava uma notificação
  por usuário e por chave (nova tabela `notificacoes`), então o mesmo aviso nunca se repete
- Verificação na **manutenção diária** (todos os usuários) e ao abrir o sino (no máximo a cada 10 min por usuário);
  um alerta com erro não derruba os outros
- **Sino** no topo com contador de não lidas, as últimas 8, "marcar todas como lidas"; atualiza a cada 2 min e ao
  voltar para a aba. Página **/notificacoes** (todas/não lidas) com **preferências**: liga/desliga cada tipo e
  "Receber também por e-mail" (um resumo dos avisos novos por dia; avisa quando o SMTP não está configurado)
- Rotas: `GET /api/notificacoes`, `POST /api/notificacoes/:id/lida`, `POST /api/notificacoes/lidas`,
  `GET/PUT /api/notificacoes/preferencias`. Lidas há mais de 90 dias são apagadas na manutenção
- Demonstração: alerta "Movimentos atrasados (demo)"

## 0.14.0 — 12/11/2026

**Fase 4A + 4B: painéis por configuração e relatório dinâmico**

- **Fontes de dados** (`registerDados` em `server/src/services/paineis.ts`; o sistema registra em
  `server/src/app/paineis.ts`): `GET /api/dados/:nome?de=&ate=&...` com permissão própria. Formatos: `valores`,
  `serie`, `ranking`, `tabela` e `partes` (várias de um cálculo só)
- **Widgets** (`<PainelWidgets id widgets de ate />`, tipos em `web/src/lib/paineis.ts`): card, gráfico
  (barras/linhas), ranking, tabela ou componente próprio do sistema; mesma fonte = uma chamada só
- **Personalizar painel**: cada usuário oculta, mostra e reordena os widgets; guardado no servidor (tabela
  `preferencias`, `GET/PUT /api/preferencias/:chave`), vale em qualquer aparelho; "Restaurar padrão"
- **Conjuntos** (`registerConjunto`): o sistema entrega movimentos planos (data, valor, dimensões) e o frame monta a
  **tabela dinâmica** `GET /api/relatorios/:nome?de=&ate=&linhas=&f_<dim>=` (linhas × meses, total, média, opções
  dos filtros, link de detalhamento por célula)
- Tela **Relatórios** (`/relatorios` e `/relatorios/:conjunto`): **Evolução** (até 24 meses, gráfico de linhas das
  linhas marcadas) e **Comparativo** (mês × mês anterior ou média de 3/6/12 meses, diferença e %, colorida pelo
  sentido do conjunto); agrupar por qualquer dimensão, filtros múltiplos, CSV e **impressão/PDF** com cabeçalho da
  organização (tudo na URL)
- Paleta categórica dos gráficos (`--serie-1..8`, claro e escuro) e estilos de impressão
- Demonstração: "Painel (widgets)" e "Relatório dinâmico" sobre os movimentos de exemplo

## 0.13.0 — 12/11/2026

- **Esvaziar lixeira**: botão na lixeira de cada entidade (`POST /api/:entity/lixeira/esvaziar`, permissão de excluir)
  apaga de vez tudo o que está nela — anexos e linhas de sub-tabelas juntos — com um log de resumo ("lixeira
  esvaziada")
- A lixeira passa a dizer o prazo da limpeza automática (`dias_lixeira` das Configurações, padrão 30 dias), que já
  rodava na manutenção diária mas não aparecia na tela

## 0.12.1 — 10/11/2026

- Linha extra **separadora** na listagem (`__extra.separador`, com `rotulo`, `destaque` e `icon`): ocupa a largura
  toda, centralizada numa pílula, sem seleção nem edição — para o sistema derivado intercalar, por exemplo, o
  saldo do final de cada dia

## 0.12.0 — 10/11/2026

- **Período da navegação**: o mês/período escolhido no seletor vale para as outras telas até o usuário trocar.
  Listagem aberta sem período na URL usa o último escolhido (antes: sempre o mês atual). Novo login (ou sair)
  volta ao mês atual. `lib/periodoGlobal.ts`: `periodoPadrao()`, `mesPadrao()` e `guardarMes()` para telas por
  mês do sistema derivado (guardado no `sessionStorage`)

## 0.11.0 — 09/11/2026

- **Configurações próprias do sistema derivado**: `shared/src/app/settings.ts` declara `appSettings`
  (`select`, `boolean`, `number`, `text`, com padrão, opções e ajuda). Aparecem na tela de Configurações numa seção
  com o nome do sistema e são gravadas junto (`app.<chave>` na tabela `configuracoes`, com log). API:
  `GET /api/settings/app` (qualquer logado) e `PUT /api/settings/app` (editar configurações). No servidor:
  `getAppSetting(db, chave)`; no front: `useAppSettings()` (`lib/appSettings.ts`). "Restaurar padrão" volta também
  essas

## 0.10.1 — 09/11/2026

- **Voltar para onde estava**: quem navega passa `state: useOrigem()` e a tela de destino volta com
  `useVolta(padrão)` (`lib/voltar.ts`), em cadeia (lista → outra tela → formulário → outra tela → lista). A
  `CrudList` já passa a origem ao abrir um registro, uma linha extra ou "Novo"; o `CrudForm` volta para a origem
  (ou para a listagem guardada). `PageHeader.back` aceita `{ to, state }`

## 0.10.0 — 09/11/2026

- **Linhas extras na listagem**: hook `listExtras(query, { db, actor })` por entidade devolve linhas de outras
  entidades (mesmos campos + `__extra: { rotulo, link, icon, campo }`) que aparecem intercaladas na mesma ordenação, com
  selo, fundo suave e clique abrindo `link`. Não têm seleção nem edição na linha, não entram nos totais nem na
  contagem "N registro(s)", e ficam fora da lixeira e da exportação. A API devolve `extras` (quantas linhas extras
  há em `total`). Com extras, a listagem busca os registros filtrados e pagina em memória
  (`listWithExtras` em `services/records.ts`)

## 0.9.3 — 09/11/2026

- Formulário volta para a listagem **como ela estava** (mês/período, filtros, página, ordenação), ao salvar, cancelar
  ou pela seta do título; antes voltava para o mês atual. A listagem guarda a URL no `sessionStorage`
  (`lembrarLista`/`urlLista` em `lib/listParams.ts`)
- Entidade escolhe as opções de "registros por página" e o padrão: `pageSizes` e `pageSize` (padrão continua
  10, 25, 50, 100)

## 0.9.2 — 09/11/2026

- Seletor de período das listagens: **Período personalizado** (De/Até) abaixo dos atalhos. Aceita só uma das pontas
  ("A partir de…", "Até…") e corrige a ordem se as datas vierem trocadas; o ano inteiro aparece como "Ano de 2025"
- `MonthPicker` ganha `referencia`: com um intervalo livre, as setas e a grade partem do mês do início (antes: do
  mês atual)

## 0.9.1 — 09/11/2026

- `feminino: true` na entidade: botão e título dizem "Nova categoria" em vez de "Novo categoria" (`novoRotulo`)

## 0.9.0 — 09/11/2026

**Campo imagem, fonte própria e seletor de mês**

- **Campo `image`** nas entidades: logo, foto ou ícone gravado no próprio registro (data URL). A tela reduz para no
  máximo 256 px antes de enviar; aceita PNG, JPG, WebP, GIF e SVG (até ~150 KB). Aparece como miniatura na
  listagem; fica fora da exportação/importação e no log aparece só "(alterada)"
- **Fonte própria** (Configurações → Fonte → "Usar uma fonte própria"): o administrador envia o arquivo regular e,
  opcionalmente, o negrito (.woff2, .woff, .otf ou .ttf, até 600 KB), dá um nome (ex.: ABC Oracle) e escolhe a
  opção. Os arquivos ficam no sistema e são servidos em `/api/settings/fonte/:peso` (público, com cache); o tipo é
  conferido pelo conteúdo. Remover o arquivo regular volta para a fonte do tema
- **Seletor de mês** (`MonthPicker`, estilo Mobills): ‹ Janeiro 2025 › e, ao clicar, o ano com os 12 meses para
  pular direto, além dos atalhos (este mês, últimos 30 dias, ano inteiro, todo o período). Usado no período das
  listagens e disponível para as telas do sistema
- **Texto de PDF** (`server/src/services/pdf.ts`, `linhasPdf`): lê o PDF e devolve as linhas na ordem da página
  (pedaços agrupados pela altura; espaço largo entre colunas). Base para importar faturas, extratos e outros
  documentos. Dependência nova: `unpdf`
- Correção: na exportação para Excel, datas saíam como "31/01/2025 03:00" (fuso); agora só a data

## 0.8.0 — 09/11/2026

**Fonte e tamanho do texto**

- **Fonte do sistema** (Configurações → Fonte, administrador): a do tema (Vibrante = Nunito, Minimalista = Inter),
  Inter, Nunito, Roboto, Open Sans, Lato, Source Sans ou a fonte do aparelho. Prévia de cada uma na tela; o
  navegador baixa só a escolhida (`web/src/lib/fontes.ts`), e "do aparelho" não baixa nada
- **Tamanho do texto por usuário** (menu do usuário: A pequeno · A normal · A grande): escala 93,75% / 100% / 112,5%
  de tudo o que é medido em rem. Gravado no usuário (`usuarios.tamanho_texto`, via `PUT /api/auth/perfil`) e
  lembrado no navegador para a tela de login
- Larguras do menu lateral e altura do topo em rem: acompanham o tamanho do texto

## 0.7.0 — 09/11/2026

**Temas e aparência**

- Tokens de design no CSS (`--surface`, `--text`, `--border`, `--positive`, `--negative`, `--radius`, `--shadow-card`,
  `--sidebar-*`…): as telas usam só tokens, e o tema troca os valores
- **Tema do sistema** (Configurações → Tema, definido pelo administrador): **Vibrante** (o visual de sempre) ou
  **Minimalista** (fundo neutro, menu lateral claro, tipografia Inter, cartões sem cor, título da página na barra
  do topo)
- **Aparência por usuário** (menu do usuário): Automático (segue o aparelho), Claro ou Escuro. Fica gravada no
  usuário (`usuarios.aparencia`, via `PUT /api/auth/perfil`) e lembrada no navegador para a tela de login
- Abas no rodapé no celular: itens de menu com `tab: true` (até 4) + botão "Menu"
- `inlineEdit` em campo booleano (`true` ou função por registro): liga/desliga direto na listagem, sem abrir o
  registro; grava pelo CRUD (permissão de editar, hooks e log valem igual)
- `web/src/lib/themeVars.ts`: `cssVar()`, `chartTheme()` e `useThemeVersion()` para gráficos acompanharem o tema e
  o modo escuro; `web/src/lib/media.ts`: `useMedia()`/`useIsDesktop()`
- Etiquetas coloridas (`ValueBadge`) recebem a cor na variável `--badge`: bloco cheio no Vibrante, tom suave no
  Minimalista

## 0.6.0 — 08/11/2026

- `hidden` no campo: coluna técnica gravada e devolvida pela API, preenchida pelos hooks, fora das telas
  (formulário, listagem, colunas, filtros, exportação, importação); filtrável pela URL
- `createOnly` no campo: só no formulário de criação; ignorado nas atualizações
- `server/src/app/maintenance.ts` (`appMaintenance`): manutenção diária da aplicação, no boot e a cada 24 h
- **Correção:** datas sem hora apareciam um dia antes nas telas em fusos negativos (Brasil): `fmtDate` lia
  `2026-10-28` como meia-noite UTC

## 0.5.1 — 08/11/2026

**Preparação para sistemas derivados do frame (repositório próprio com `upstream` = frame-app)**

- Migrações da aplicação em `server/src/app/migrations/` (o `db:diff` grava lá); as do núcleo continuam em
  `server/src/db/migrations/`. As duas rodam juntas, em ordem de data
- Nome e versão do sistema em `shared/src/app/info.ts`; o `package.json` fica com a versão do frame.
  `/api/health` informa as duas (`version` e `frame`)
- `docs/app/` (README, CHANGELOG e CLAUDE.md do sistema), importado pelo `CLAUDE.md` da raiz
- README: como criar um sistema a partir do frame e mantê-lo atualizado
- `default: 'hoje'` (data) e `default: 'agora'` (data e hora), calculados na hora de abrir o formulário/gravar
- `activeField` na entidade: registros inativos somem dos selects de relação (menos o valor atual), mas continuam
  nos filtros da listagem (`/opcoes?todos=1`)
- Nome e ícone padrão das Configurações vêm de `app/info.ts` (`nome`, `icone`)
- Formulário novo aceita valores iniciais pela URL (`/lancamentos/novo?tipo=Receita&conta_id=3`), para atalhos
- `shared` exporta a pasta `app/` inteira (tipos e constantes do sistema); testes do frame não supõem aplicação vazia

## 0.5.0 — 08/11/2026

**Fase 2B: master-detail, anexos, importação e telas plugáveis**

- Sub-tabelas (`details` / `detailOf`): linhas editadas no formulário do registro e gravadas juntas numa transação;
  somas no "pai" (`sum`), mínimo de linhas (`min`), erros por linha; no celular, cada linha vira um card
- Campos calculados (`compute`): a tela mostra enquanto digita e a API recalcula ao gravar
- Sub-tabela segue as permissões do "pai" e fica fora do menu "+ Novo", do dashboard e da matriz de permissões
- Anexos por registro (`anexos: true`): enviar (botão ou arrastar), abrir PDF/imagem, baixar, excluir, com log;
  arquivos em `UPLOAD_DIR`, limite `UPLOAD_MAX_MB`; apagados junto com o registro
- Importação de planilha `.xlsx`/`.csv` com mapeamento de colunas, prévia validada linha a linha, conversão do formato
  brasileiro, nomes de relações e planilha modelo com instruções
- Telas plugáveis: `registerScreens` (lista/form próprios por entidade), `registerPage` (páginas novas com permissão)
  e slots `before`/`after` na listagem e no formulário genéricos
- Demonstração: orçamentos com itens e anexos, movimentos com resumo do período, categorias em cards e página
  "Resumo por categoria"
- Dashboard não conta registros que estão na lixeira
- Migração nova do núcleo: `20261109000000_anexos` (aplicada sozinha no `npm run dev`)

## 0.4.0 — 08/11/2026

**Fase 2A: motor de CRUD maduro (listagem, campos e lixeira)**

- Tipos de campo novos: `document` (CPF/CNPJ com dígito verificador), `phone`, `color`, `multiselect`, `percent`;
  `money` com máscara BRL, `min`/`max` e `signColors` (negativo em vermelho, positivo em verde)
- Listagem: ordenação clicando no cabeçalho, painel de filtros gerado pelos campos (seleção múltipla, faixa de
  datas e valores, "contém"), chips de filtros ativos, seletor de período (`periodField`) que abre no mês atual,
  linha de totais (`total: 'sum'`), itens por página, colunas visíveis por usuário
- Exportar a listagem para Excel (.xlsx) ou CSV com os mesmos filtros e colunas da tela
- Seleção de linhas e ações em lote (editar um campo, excluir, restaurar), cada registro com as mesmas regras e log
- Lixeira (`lixeira: true`): excluir envia para a lixeira, que tem tela própria para restaurar ou excluir de vez;
  esvaziamento automático configurável ("Esvaziar lixeira após N dias")
- Formulário em seções (`section`) e selects dependentes (`dependsOn`: categoria conforme o tipo)
- `defaultSort` e `group` (grupo na matriz de permissões) por entidade
- Módulo de demonstração (`DEMO=true` no `server/.env`): clientes, categorias e movimentos de exemplo com todos os
  recursos acima, em tabelas `demo_*` criadas fora das migrações
- Rotas novas: `GET /api/:entidade/exportar`, `POST /api/:entidade/lote`, `POST /api/:entidade/:id/restaurar`

## 0.3.0 — 08/11/2026

**Núcleo genérico (o frame não tem mais nada de "sistema de chamados")**

- Separação núcleo × aplicação: `shared/src/app/`, `server/src/app/` e `web/src/app/` são o lugar do sistema
  construído sobre o frame (entidades, menu, dashboard, hooks, rotas, dados de exemplo)
- Removidos chamados, clientes, abertura de chamados, busca por protocolo e notificações derivadas
- Dashboard genérico: total de cada cadastro que o usuário pode ver + atividade recente
- Botão "+ Novo" no menu, com o que o usuário pode criar
- Versão do sistema no menu e em `/api/health`; aviso de "nova versão disponível" em produção
- Página "Meu perfil": editar nome, alterar senha, ver e encerrar sessões abertas
- Configurações: link da Central de Ajuda e estilo do menu (colorido ou claro)
- Menu reorganizado: Dashboard · itens da aplicação · Administração (Usuários, Perfis, Logs, Backup)
- Migrações reescritas numa migração única do núcleo (`npm run db:reset` necessário em bancos antigos)
- `auto: 'code'` com `prefix` substitui o antigo `auto: 'protocol'`
- Limite de tentativas por IP passa a contar só falhas de login

**Fase 1: segurança e acesso**

- Login com sessão em cookie `httpOnly`, "manter conectado", troca e recuperação de senha
- Perfis de acesso com matriz recurso × ação; hooks por entidade; logs com usuário, IP e antes/depois
- helmet/CSP, proteção de origem (CSRF), limite de tentativas, `db:admin`

## 0.2.0 — 07/11/2026

**Fase 0: fundação de engenharia**: TypeScript, npm workspaces, Knex com migrações e `db:diff`, validação Zod
compartilhada, `.env` validado, testes, ESLint/Prettier, pre-commit e CI.

## 0.1.0 — 07/11/2026

Frame inicial em JavaScript: navegação, CRUD dirigido por configuração, dashboard, logs, backup e configurações.
