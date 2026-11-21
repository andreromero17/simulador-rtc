# Changelog do sistema

Versões do sistema construído sobre o frame (a versão fica em `shared/src/app/info.ts`).
As versões do frame estão no `CHANGELOG.md` da raiz.

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
