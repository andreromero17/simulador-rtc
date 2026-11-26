# Simulador RTC — Reforma Tributária do Consumo (sistema sobre o frame)

## O que faz

Compara a carga de tributos sobre o consumo de **empresas de serviços** hoje (PIS, Cofins, ISS ou DAS do Simples)
com a de cada ano da transição da reforma (CBS, IBS e ISS residual, 2027–2033), usando o faturamento por cliente e
os custos por fornecedor de 2026 importados de planilha. Foco inicial: serviços (Simples Anexos III/IV/V, Lucro
Presumido e Lucro Real).

## Fontes oficiais embarcadas

- `shared/src/app/rtc/cclasstrib.json` e `server/src/app/rtc/catalogo.json` são gerados das migrações Flyway de
  `github.com/ReceitaFederal/calculadora-rtc-regime-regular` (CLASSIFICACAO_TRIBUTARIA, PERCENTUAL_REDUCAO,
  CLASSIF_NBS_INDOP_LC, LISTA_SERVICOS_LC_116). Para atualizar: montar o SQLite aplicando `flyway/sql` em ordem e rodar
  o script de exportação (ver `docs/app/README.md`). Não editar os JSON à mão.
- Tabelas do Simples (2026 e LC 214 Anexos XX–XXII, 2027–2033): `shared/src/app/rtc/simples.ts` — o teste garante que
  cada partilha soma 100%.

## Entidades

`empresas`, `parceiros` (clientes e fornecedores; o **regime** decide quem toma crédito), `receitas`, `custos`,
`categorias_custo` (crédito PIS/Cofins hoje × IBS/CBS novo, fator R) e `cenarios` + `cenarios_anos` (alíquotas de
referência por ano). Categorias e cenários vêm na migração `20261121171009_dados_referencia`.

## Regras (motor puro em `shared/src/app/rtc/motor.ts`)

- Base IBS/CBS = valor do serviço − ISS até 2032 (igual à base unificada da NFS-e da RF); IBS/CBS por fora.
- 2027–2028: CBS = referência − 0,1 p.p., IBS 0,1%. 2029–2032: ISS × 0,9/0,8/0,7/0,6 e IBS × 0,1/0,2/0,3/0,4.
  2033: só IBS/CBS. 2026 (teste compensável) = sistema atual.
- Reduções pelo cClassTrib da receita (hook `receitas` sugere pelo NBS/item da LC 116 e o padrão da empresa).
- PIS/Cofins de hoje: padrão do regime (Presumido 0,65%+3% cumulativo; Real 1,65%+7,6% não cumulativo com crédito),
  ou regime e alíquotas informados na empresa (`pisCofinsDaEmpresa`). Crédito de PIS/Cofins só no não cumulativo.
- Duas estratégias de preço: `preco` (cliente paga o mesmo total) e `liquido` (empresa mantém a receita líquida).
- Créditos: fornecedor do regime regular → IBS/CBS embutido no preço pago (fornecedor mantém o preço); fornecedor do
  Simples → parcela CBS/IBS do DAS de um fornecedor típico (Anexo III, RBT12 R$ 500 mil, premissa).
- Cliente do regime regular credita o IBS/CBS destacado; Simples puro/MEI/PF/órgão público/não informado não.
- Regime dos clientes/fornecedores (`server/src/app/rtc/cnpj.ts`): Simples/MEI atual → ECF (dados abertos da RFB, via
  Minha Receita) → inferência (órgão público, S.A. aberta, CNAE 64/65, capital ≥ R$ 50 mi). Regime informado à mão ou
  na planilha (`regime_fonte` começa com "Informado") não é trocado pela consulta, salvo Simples/MEI.
- Simples: puro (CBS/IBS no DAS) × híbrido (DAS sem CBS/IBS + regime regular); a API devolve as duas opções.

## O que NÃO pode mudar sem decisão

- O motor é a fonte única do cálculo (servidor e testes). Telas só exibem.
- Mudança de regra = teste novo em `shared/test/rtc.test.ts` com o valor calculado à mão.
- Alíquotas de 2027+ são parâmetros (cenários), nunca constantes no código.
