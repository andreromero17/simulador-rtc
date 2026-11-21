// =============================================================================
// Simples Nacional — anexos de serviços (III, IV e V) da LC 123/2006.
//  • 2026: tabelas vigentes (PIS/Cofins/ISS na partilha).
//  • 2027 em diante: tabelas da LC 214/2025 (Anexos XX, XXI e XXII), com CBS no lugar de
//    PIS/Cofins e o IBS ganhando espaço do ISS até 2033.
// Percentuais em pontos percentuais (6 = 6%). Partilha soma 100 em cada faixa.
// =============================================================================

export type TributoSN = 'irpj' | 'csll' | 'cofins' | 'pis' | 'cbs' | 'cpp' | 'iss' | 'ibs';
export type AnexoServico = 'III' | 'IV' | 'V';
export type Partilha = Partial<Record<TributoSN, number>>;

export interface FaixaSN {
  /** Limite superior da receita bruta em 12 meses */
  ate: number;
  aliquota: number;
  deduzir: number;
  partilha: Partilha;
}

/**
 * Regra da 5ª faixa: quando a alíquota efetiva passa de `gatilho`, o ISS (e, na transição, parte do IBS) fica
 * FIXO em pontos percentuais e o restante (alíquota efetiva − soma dos fixos) é repartido por `excedente`.
 */
export interface QuintaFaixa {
  gatilho: number;
  fixos: Partilha;
  excedente: Partilha;
}

export interface TabelaSN {
  faixas: FaixaSN[];
  quinta?: QuintaFaixa;
}

const LIMITES = [180_000, 360_000, 720_000, 1_800_000, 3_600_000, 4_800_000];

const montar = (aliquotas: number[], deduzir: number[], partilhas: Partilha[], quinta?: QuintaFaixa): TabelaSN => ({
  faixas: LIMITES.map((ate, i) => ({ ate, aliquota: aliquotas[i]!, deduzir: deduzir[i]!, partilha: partilhas[i]! })),
  quinta,
});

const p = (cols: TributoSN[], vals: number[]): Partilha =>
  Object.fromEntries(cols.map((c, i) => [c, vals[i]!]).filter(([, v]) => v !== 0)) as Partilha;

// ---------------------------------------------------------------- Anexo III
const III_ALIQ = [6, 11.2, 13.5, 16, 21, 33];
const III_DED = [0, 9_360, 17_640, 35_640, 125_640, 648_000];
const III_ALIQ_2027 = [6, 11.2, 13.5, 16, 21, 32.9];
const C_ANTIGO: TributoSN[] = ['irpj', 'csll', 'cofins', 'pis', 'cpp', 'iss'];
const C_NOVO: TributoSN[] = ['irpj', 'csll', 'cbs', 'cpp', 'iss', 'ibs'];

const III_2026 = montar(
  III_ALIQ,
  III_DED,
  [
    p(C_ANTIGO, [4, 3.5, 12.82, 2.78, 43.4, 33.5]),
    p(C_ANTIGO, [4, 3.5, 14.05, 3.05, 43.4, 32]),
    p(C_ANTIGO, [4, 3.5, 13.64, 2.96, 43.4, 32.5]),
    p(C_ANTIGO, [4, 3.5, 13.64, 2.96, 43.4, 32.5]),
    p(C_ANTIGO, [4, 3.5, 12.82, 2.78, 43.4, 33.5]),
    p(C_ANTIGO, [35, 15, 16.03, 3.47, 30.5, 0]),
  ],
  {
    gatilho: 14.92537,
    fixos: { iss: 5 },
    excedente: { irpj: 6.02, csll: 5.26, cofins: 19.28, pis: 4.18, cpp: 65.26 },
  },
);

const III_2027 = montar(
  III_ALIQ_2027,
  III_DED,
  [
    p(C_NOVO, [4, 3.5, 15.43, 43.4, 33.5, 0.17]),
    p(C_NOVO, [4, 3.5, 16.91, 43.4, 32, 0.19]),
    p(C_NOVO, [4, 3.5, 16.42, 43.4, 32.5, 0.19]),
    p(C_NOVO, [4, 3.5, 16.42, 43.4, 32.5, 0.19]),
    p(C_NOVO, [4, 3.5, 15.43, 43.4, 33.5, 0.17]),
    p(C_NOVO, [35.09, 15.04, 19.29, 30.58, 0, 0]),
  ],
  { gatilho: 14.92537, fixos: { iss: 5 }, excedente: { irpj: 6.02, csll: 5.26, cbs: 23.2, cpp: 65.26, ibs: 0.26 } },
);

/** Anexo III de 2029 a 2032: ISS × IBS por faixa e o ISS/IBS fixos da 5ª faixa */
function iiiTransicao(issIbs: [number, number][], fixos: [number, number]): TabelaSN {
  const cbs = [15.6, 17.1, 16.6, 16.6, 15.6];
  return montar(
    III_ALIQ,
    III_DED,
    [
      ...issIbs.map(([iss, ibs], i) => p(C_NOVO, [4, 3.5, cbs[i]!, 43.4, iss, ibs])),
      p(C_NOVO, [35, 15, 19.5, 30.5, 0, 0]),
    ],
    {
      gatilho: 14.92537,
      fixos: { iss: fixos[0], ibs: fixos[1] },
      excedente: { irpj: 6.02, csll: 5.26, cbs: 23.46, cpp: 65.26 },
    },
  );
}

const III_2033 = montar(III_ALIQ, III_DED, [
  p(C_NOVO, [4, 3.5, 15.6, 43.4, 0, 33.5]),
  p(C_NOVO, [4, 3.5, 17.1, 43.4, 0, 32]),
  p(C_NOVO, [4, 3.5, 16.6, 43.4, 0, 32.5]),
  p(C_NOVO, [4, 3.5, 16.6, 43.4, 0, 32.5]),
  p(C_NOVO, [4, 3.5, 15.6, 43.4, 0, 33.5]),
  p(C_NOVO, [35, 15, 19.5, 30.5, 0, 0]),
]);

// ---------------------------------------------------------------- Anexo IV (CPP fora do DAS)
const IV_ALIQ = [4.5, 9, 10.2, 14, 22, 33];
const IV_ALIQ_2027 = [4.5, 9, 10.2, 14, 22, 32.9];
const IV_DED = [0, 8_100, 12_420, 39_780, 183_780, 828_000];
const C4_ANTIGO: TributoSN[] = ['irpj', 'csll', 'cofins', 'pis', 'iss'];
const C4_NOVO: TributoSN[] = ['irpj', 'csll', 'cbs', 'iss', 'ibs'];
const IV_IRPJ_CSLL: [number, number][] = [
  [18.8, 15.2],
  [19.8, 15.2],
  [20.8, 15.2],
  [17.8, 19.2],
  [18.8, 19.2],
];

const IV_2026 = montar(
  IV_ALIQ,
  IV_DED,
  [
    p(C4_ANTIGO, [18.8, 15.2, 17.67, 3.83, 44.5]),
    p(C4_ANTIGO, [19.8, 15.2, 20.55, 4.45, 40]),
    p(C4_ANTIGO, [20.8, 15.2, 19.73, 4.27, 40]),
    p(C4_ANTIGO, [17.8, 19.2, 18.9, 4.1, 40]),
    p(C4_ANTIGO, [18.8, 19.2, 18.08, 3.92, 40]),
    p(C4_ANTIGO, [53.5, 21.5, 20.55, 4.45, 0]),
  ],
  { gatilho: 12.5, fixos: { iss: 5 }, excedente: { irpj: 31.33, csll: 32, cofins: 30.13, pis: 6.54 } },
);

const IV_2027 = montar(
  IV_ALIQ_2027,
  IV_DED,
  [
    p(C4_NOVO, [18.8, 15.2, 21.26, 44.5, 0.24]),
    p(C4_NOVO, [19.8, 15.2, 24.73, 40, 0.27]),
    p(C4_NOVO, [20.8, 15.2, 23.74, 40, 0.26]),
    p(C4_NOVO, [17.8, 19.2, 22.75, 40, 0.25]),
    p(C4_NOVO, [18.8, 19.2, 21.76, 40, 0.24]),
    p(C4_NOVO, [53.71, 21.59, 24.7, 0, 0]),
  ],
  { gatilho: 12.5, fixos: { iss: 5 }, excedente: { irpj: 31.33, csll: 32, cbs: 36.27, ibs: 0.4 } },
);

function ivTransicao(issIbs: [number, number][], fixos: [number, number] | null): TabelaSN {
  const cbs = [21.5, 25, 24, 23, 22];
  return montar(
    IV_ALIQ,
    IV_DED,
    [
      ...issIbs.map(([iss, ibs], i) => p(C4_NOVO, [IV_IRPJ_CSLL[i]![0], IV_IRPJ_CSLL[i]![1], cbs[i]!, iss, ibs])),
      p(C4_NOVO, [53.5, 21.5, 25, 0, 0]),
    ],
    fixos
      ? { gatilho: 12.5, fixos: { iss: fixos[0], ibs: fixos[1] }, excedente: { irpj: 31.33, csll: 32, cbs: 36.67 } }
      : undefined,
  );
}

// ---------------------------------------------------------------- Anexo V
const V_ALIQ = [15.5, 18, 19.5, 20.5, 23, 30.5];
const V_ALIQ_2027 = [15.5, 18, 19.5, 20.5, 23, 30.4];
const V_DED = [0, 4_500, 9_900, 17_100, 62_100, 540_000];
const V_BASE: [number, number, number][] = [
  // irpj, csll, cpp
  [25, 15, 28.85],
  [23, 15, 27.85],
  [24, 15, 23.85],
  [21, 15, 23.85],
  [23, 12.5, 23.85],
];
const V_ISS_TOTAL = [14, 17, 19, 21, 23.5];
const V_CBS = [17.15, 17.15, 18.15, 19.15, 17.15];

const V_2026 = montar(V_ALIQ, V_DED, [
  p(C_ANTIGO, [25, 15, 14.1, 3.05, 28.85, 14]),
  p(C_ANTIGO, [23, 15, 14.1, 3.05, 27.85, 17]),
  p(C_ANTIGO, [24, 15, 14.92, 3.23, 23.85, 19]),
  p(C_ANTIGO, [21, 15, 15.74, 3.41, 23.85, 21]),
  p(C_ANTIGO, [23, 12.5, 14.1, 3.05, 23.85, 23.5]),
  p(C_ANTIGO, [35, 15.5, 16.44, 3.56, 29.5, 0]),
]);

const V_2027 = montar(V_ALIQ_2027, V_DED, [
  p(C_NOVO, [25, 15, 16.96, 28.85, 14, 0.19]),
  p(C_NOVO, [23, 15, 16.96, 27.85, 17, 0.19]),
  p(C_NOVO, [24, 15, 17.95, 23.85, 19, 0.2]),
  p(C_NOVO, [21, 15, 18.94, 23.85, 21, 0.21]),
  p(C_NOVO, [23, 12.5, 16.96, 23.85, 23.5, 0.19]),
  p(C_NOVO, [35.1, 15.54, 19.78, 29.58, 0, 0]),
]);

/** Anexo V de 2029 em diante: o IBS recebe `fracao` do percentual que era do ISS */
function vTransicao(fracao: number): TabelaSN {
  return montar(V_ALIQ, V_DED, [
    ...V_BASE.map(([irpj, csll, cpp], i) => {
      const total = V_ISS_TOTAL[i]!;
      const ibs = Math.round(total * fracao * 100) / 100;
      return p(C_NOVO, [irpj, csll, V_CBS[i]!, cpp, Math.round((total - ibs) * 100) / 100, ibs]);
    }),
    p(C_NOVO, [35, 15.5, 20, 29.5, 0, 0]),
  ]);
}

// ---------------------------------------------------------------- tabela por ano
const TABELAS: Record<AnexoServico, (ano: number) => TabelaSN> = {
  III: (ano) => {
    if (ano <= 2026) return III_2026;
    if (ano <= 2028) return III_2027;
    if (ano === 2029)
      return iiiTransicao(
        [
          [30.15, 3.35],
          [28.8, 3.2],
          [29.25, 3.25],
          [29.25, 3.25],
          [30.15, 3.35],
        ],
        [4.5, 0.5],
      );
    if (ano === 2030)
      return iiiTransicao(
        [
          [26.8, 6.7],
          [25.6, 6.4],
          [26, 6.5],
          [26, 6.5],
          [26.8, 6.7],
        ],
        [4, 1],
      );
    if (ano === 2031)
      return iiiTransicao(
        [
          [23.45, 10.05],
          [22.4, 9.6],
          [22.75, 9.75],
          [22.75, 9.75],
          [23.45, 10.05],
        ],
        [3.5, 1.5],
      );
    if (ano === 2032)
      return iiiTransicao(
        [
          [20.1, 13.4],
          [19.2, 12.8],
          [19.5, 13],
          [19.5, 13],
          [20.1, 13.4],
        ],
        [3, 2],
      );
    return III_2033;
  },
  IV: (ano) => {
    if (ano <= 2026) return IV_2026;
    if (ano <= 2028) return IV_2027;
    const fr = ano >= 2033 ? 1 : (ano - 2028) / 10;
    const iss5 = [44.5, 40, 40, 40, 40];
    const issIbs = iss5.map((t) => {
      const ibs = Math.round(t * fr * 100) / 100;
      return [Math.round((t - ibs) * 100) / 100, ibs] as [number, number];
    });
    const fixos: [number, number] | null = ano >= 2033 ? null : [5 - fr * 5, fr * 5];
    return ivTransicao(issIbs, fixos);
  },
  V: (ano) => {
    if (ano <= 2026) return V_2026;
    if (ano <= 2028) return V_2027;
    return vTransicao(ano >= 2033 ? 1 : (ano - 2028) / 10);
  },
};

export const tabelaSimples = (anexo: AnexoServico, ano: number): TabelaSN => TABELAS[anexo](ano);

export interface ResultadoDas {
  faixa: number;
  aliquotaNominal: number;
  /** Alíquota efetiva (%) */
  aliquotaEfetiva: number;
  /** Alíquota efetiva repartida por tributo (pontos percentuais da receita) */
  porTributo: Partilha;
  /** Receita acima do limite de R$ 4,8 milhões: excluída do Simples */
  excedeLimite: boolean;
  /** 6ª faixa (acima do sublimite de R$ 3,6 milhões): ISS e IBS saem do DAS */
  acimaSublimite: boolean;
}

/** Alíquota efetiva do DAS e repartição por tributo para a receita bruta dos últimos 12 meses */
export function calcularDas(anexo: AnexoServico, ano: number, rbt12: number): ResultadoDas {
  const tab = tabelaSimples(anexo, ano);
  const rb = Math.max(rbt12, 0.01);
  let idx = tab.faixas.findIndex((f) => rb <= f.ate);
  const excedeLimite = idx === -1;
  if (idx === -1) idx = tab.faixas.length - 1;
  const faixa = tab.faixas[idx]!;
  const efetiva = idx === 0 ? faixa.aliquota : (Math.max((rb * faixa.aliquota) / 100 - faixa.deduzir, 0) / rb) * 100;
  let porTributo: Partilha = {};
  if (idx === 4 && tab.quinta && efetiva > tab.quinta.gatilho) {
    const fixos = tab.quinta.fixos;
    const somaFixos = Object.values(fixos).reduce((a, b) => a + (b ?? 0), 0);
    porTributo = { ...fixos };
    for (const [t, pct] of Object.entries(tab.quinta.excedente) as [TributoSN, number][])
      porTributo[t] = (porTributo[t] ?? 0) + ((efetiva - somaFixos) * pct) / 100;
  } else {
    for (const [t, pct] of Object.entries(faixa.partilha) as [TributoSN, number][])
      porTributo[t] = (efetiva * pct) / 100;
  }
  return {
    faixa: idx + 1,
    aliquotaNominal: faixa.aliquota,
    aliquotaEfetiva: efetiva,
    porTributo,
    excedeLimite,
    acimaSublimite: idx === 5,
  };
}
