# Changelog do sistema

Versões do sistema construído sobre o frame (a versão fica em `shared/src/app/info.ts`).
As versões do frame estão no `CHANGELOG.md` da raiz.

## 0.5.1 — 2026-11-27

- Consulta de CNPJ: com limite de requisições (429) ou instabilidade (5xx) na Minha Receita, espera e repete antes de
  cair para a BrasilAPI (que não traz a ECF). A origem do regime passa a dizer qual serviço respondeu ("via ...").

## 0.5.0 — 2026-11-26

- Consulta de CNPJ traz o regime declarado na ECF (Lucro Real, Presumido, Arbitrado, imune/isenta) do último ano
  publicado pela Receita nos dados abertos, via Minha Receita (agora a fonte principal; BrasilAPI de reserva).
  Ordem: Simples/MEI atual → ECF → inferências → não identificado.

## 0.4.0 — 2026-11-23

- Consulta de CNPJ infere o regime quando há sinal forte: administração pública → Órgão público; S.A. de capital
  aberto, instituição financeira/seguradora (CNAE 64/65) e capital social a partir de R$ 50 milhões → Lucro Real.
  Nova coluna `parceiros.regime_fonte` mostra a origem (consulta, inferência, planilha ou à mão); regime informado à
  mão ou na planilha não é trocado pela consulta (salvo Simples/MEI). Botão "Consultar de novo".
- Receitas e custos mostram o CNPJ/CPF e o regime do cliente/fornecedor na listagem; a coluna Empresa saiu (a tela já
  filtra pela empresa ativa).

## 0.3.1 — 2026-11-21

- Importação: reimportar com o CNPJ/CPF completa o cliente/fornecedor que foi criado antes só pelo nome (sem duplicar)
  e preenche o regime de quem estava "Não informado". Mais nomes de coluna aceitos para o documento ("CNPJ do cliente",
  "CNPJ/CPF", "Documento", "ID fiscal", "Tax ID", "CNPJ do fornecedor"...).

## 0.3.0 — 2026-11-21

- PIS/Cofins de hoje parametrizável na empresa: regime (conforme o regime / cumulativo / não cumulativo) e alíquotas de
  PIS e Cofins (vazio = padrão). Cobre o Lucro Real com receita de TI no cumulativo e benefícios de alíquota reduzida;
  o crédito sobre insumos só existe no não cumulativo e usa a alíquota da empresa. Migração `pis_cofins_empresa`.

## 0.2.1 — 2026-11-21

- Receitas e custos sem a importação genérica do frame (que exigia clientes já cadastrados): o botão "Importar
  planilha" leva à importação do simulador, que cria clientes e fornecedores pelo CNPJ ou pelo nome.
- Importação aceita arquivo de aba única (ex.: exportação do NetSuite), lido como Receitas ou Custos conforme a escolha
  na tela; na disputa entre colunas, "Descrição" ganha de "Memorando".

## 0.2.0 — 2026-11-21

- Empresa ativa: Receitas, Custos e despesas e Clientes/fornecedores mostram só os dados da empresa escolhida no
  topo (a mesma da Simulação e da Importação, lembrada entre as telas). O "Novo" já vem com a empresa preenchida.
- Clientes/fornecedores: visão "Desta empresa" (com faturado e comprado em 2026 e consulta de CNPJ só dos pendentes)
  e "Cadastro geral" (todos). Rota `GET /api/rtc/parceiros?empresa_id=`.

## 0.1.1 — 2026-11-21

- Item da LC 116 aceita o código de tributação nacional da NFS-e com 6 dígitos (`010101`, `01.01.01`, `010101 - descrição`),
  também como coluna "Código de tributação nacional" na importação.

## 0.1.0 — 2026-11-21

- Primeira versão do Simulador RTC sobre o frame 0.31.0.
- Motor de cálculo (shared): Simples Anexos III/IV/V 2026 e LC 214 (2027–2033), Lucro Presumido, Lucro Real com
  créditos de PIS/Cofins, regime regular de IBS/CBS com reduções por cClassTrib, transição do ISS, Simples puro × híbrido,
  estratégias de preço (preço mantido × receita líquida mantida), impacto por cliente e por categoria de custo.
- Base oficial da Receita embarcada: 170 cClassTrib com reduções e 995 combinações item LC 116 × NBS.
- Importação de planilha (.xlsx, abas Receitas e Custos) com criação de clientes/fornecedores pelo CNPJ e substituição
  do período; consulta de CNPJ (Simples/MEI) em base pública.
- Telas: dashboard por empresa, simulação, importação, catálogo de serviços; cenários e categorias editáveis.
- Cinco empresas de exemplo no seed (software, clínica, contabilidade, estúdio, engenharia).
