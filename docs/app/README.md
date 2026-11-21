# Simulador RTC

Simulador dos impactos da Reforma Tributária do Consumo (LC 214/2025) para empresas de serviços, construído sobre o
frame. Compara PIS/Cofins/ISS (ou DAS) de 2026 com CBS/IBS de 2027 a 2033.

## Rodar

```bash
npm run setup        # instala, migra e cria 5 empresas de exemplo com 2026 completo
npm run dev          # http://localhost:5173  (admin@sistema.com / admin123)
```

## Uso

1. **Empresas** → regime, alíquota de ISS do município, cClassTrib padrão e, no Simples, anexo (ou fator R) e opção
   puro/híbrido.
2. **Importar planilhas** → `.xlsx` com abas `Receitas` e `Custos` (baixe a planilha modelo). Clientes e fornecedores
   são criados pelo CNPJ; depois, **Consultar CNPJs** traz Simples/MEI de base pública (BrasilAPI / Minha Receita).
   Lucro Real × Presumido não é público: ajuste os clientes relevantes à mão.
3. **Simulação** → cenário de alíquotas, estratégia de preço, ano a ano, por cliente, por categoria de custo e
   Simples puro × híbrido.
4. **Parâmetros** → cenários (alíquotas de referência por ano) e categorias de custo (o que gera crédito).

## Cenários que vêm prontos (nov/2026)

| Cenário                      | CBS 2027–28 | CBS 2029+ | IBS ref. |
| ---------------------------- | ----------- | --------- | -------- |
| SERT/CGIBS — 27,91% (padrão) | 11,3%       | 9,21%     | 18,70%   |
| Teto da LC 214 — 26,5%       | 11,3%       | 8,8%      | 17,7%    |
| Conservador                  | 11,3%       | 11,3%     | 18,7%    |

CBS 2027 = cálculo do TCU (28/10/2026), pendente de resolução do Senado (prazo 15/12/2026). Atualize o cenário
quando a resolução sair.

## Atualizar a base oficial da Receita

```bash
git clone https://github.com/ReceitaFederal/calculadora-rtc-regime-regular rf
python3 scripts/rtc/montar_base.py rf/flyway/sql /tmp/calc.db
python3 scripts/rtc/exportar_catalogo.py /tmp/calc.db shared/src/app/rtc/cclasstrib.json server/src/app/rtc/catalogo.json
```

## Variáveis de ambiente (opcionais)

- `RTC_CNPJ_FONTES` — URLs de consulta de CNPJ separadas por vírgula, com `{cnpj}` (padrão: BrasilAPI e Minha Receita).
