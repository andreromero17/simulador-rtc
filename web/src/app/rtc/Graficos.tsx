// Gráficos da simulação (Chart.js, cores do tema)
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import type { ResultadoAno } from '@frame/shared';
import { chartTheme, cssVar, useThemeVersion } from '../../lib/themeVars';
import { brl, brlCurto, pct } from './util';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
);

const serie = (i: number) => cssVar(`--serie-${i}`) || '#888';

/** Composição dos tributos sobre consumo por ano (barras empilhadas) + carga efetiva (linha, eixo à direita) */
export function GraficoComposicao({ anos }: { anos: ResultadoAno[] }) {
  const versao = useThemeVersion();
  const t = chartTheme();
  const rotulos = anos.map((a) => (a.atual ? `${a.ano} (hoje)` : String(a.ano)));
  const pilha = (label: string, valores: number[], cor: string) => ({
    type: 'bar' as const,
    label,
    data: valores,
    backgroundColor: cor,
    stack: 'trib',
    borderRadius: 3,
    maxBarThickness: 46,
    yAxisID: 'y',
  });
  const datasets = [
    pilha(
      'PIS/Cofins',
      anos.map((a) => a.debitos.pis + a.debitos.cofins),
      serie(2),
    ),
    pilha(
      'ISS',
      anos.map((a) => a.debitos.iss),
      serie(4),
    ),
    pilha(
      'DAS (parte consumo)',
      anos.map((a) => a.debitos.dasConsumo),
      serie(5),
    ),
    pilha(
      'CBS',
      anos.map((a) => a.debitos.cbs),
      serie(1),
    ),
    pilha(
      'IBS',
      anos.map((a) => a.debitos.ibs),
      serie(7),
    ),
    pilha(
      '(−) Créditos',
      anos.map((a) => -(a.creditos.pisCofins + a.creditos.cbs + a.creditos.ibs)),
      serie(3),
    ),
    {
      type: 'line' as const,
      label: 'Carga efetiva (%)',
      data: anos.map((a) => Number(a.cargaConsumo.toFixed(2))),
      borderColor: t.text,
      backgroundColor: t.text,
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.2,
      yAxisID: 'y1',
    },
  ].filter((d) => d.type === 'line' || (d.data as number[]).some((v) => Math.abs(v) > 0.5));

  return (
    <div style={{ height: '20rem' }}>
      <Chart
        type="bar"
        key={versao}
        aria-label="Tributos sobre o consumo por ano"
        data={{ labels: rotulos, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { color: t.text, boxWidth: 12, font: { family: t.font } } },
            tooltip: {
              callbacks: {
                label: (c) =>
                  c.dataset.yAxisID === 'y1'
                    ? `${c.dataset.label}: ${pct(Number(c.raw))}`
                    : `${c.dataset.label}: ${brl(Number(c.raw))}`,
              },
            },
          },
          scales: {
            x: { stacked: true, ticks: { color: t.text }, grid: { display: false } },
            y: {
              stacked: true,
              ticks: { color: t.text, callback: (v) => brlCurto(Number(v)) },
              grid: { color: t.grid },
            },
            y1: {
              position: 'right',
              beginAtZero: true,
              ticks: { color: t.text, callback: (v) => `${v}%` },
              grid: { display: false },
            },
          },
        }}
      />
    </div>
  );
}

/** Resultado (receita líquida − custos) e custo dos clientes por ano */
export function GraficoResultado({
  anos,
  alternativa,
}: {
  anos: ResultadoAno[];
  alternativa?: { nome: string; anos: ResultadoAno[] };
}) {
  const versao = useThemeVersion();
  const t = chartTheme();
  const linha = (label: string, data: number[], cor: string, tracejada = false) => ({
    type: 'line' as const,
    label,
    data,
    borderColor: cor,
    backgroundColor: cor,
    borderWidth: 2,
    borderDash: tracejada ? [6, 4] : undefined,
    pointRadius: 3,
    tension: 0.2,
  });
  const datasets = [
    linha(
      'Resultado antes do IR',
      anos.map((a) => a.resultado),
      serie(1),
    ),
  ];
  if (alternativa)
    datasets.push(
      linha(
        `Resultado — ${alternativa.nome}`,
        alternativa.anos.map((a) => a.resultado),
        serie(2),
        true,
      ),
    );
  return (
    <div style={{ height: '16rem' }}>
      <Chart
        type="line"
        key={versao}
        aria-label="Resultado por ano"
        data={{ labels: anos.map((a) => (a.atual ? `${a.ano} (hoje)` : String(a.ano))), datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { color: t.text, boxWidth: 12 } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${brl(Number(c.raw))}` } },
          },
          scales: {
            x: { ticks: { color: t.text }, grid: { display: false } },
            y: { ticks: { color: t.text, callback: (v) => brlCurto(Number(v)) }, grid: { color: t.grid } },
          },
        }}
      />
    </div>
  );
}
