import type { ResultadoConsultaCnpj } from '@frame/shared';

/** Resumo da consulta: quantos vieram da ECF, quem respondeu e o que deu errado */
export function resumoConsulta(r: ResultadoConsultaCnpj) {
  const fontes = Object.entries(r.porFonte)
    .map(([f, n]) => `${f}: ${n}`)
    .join(', ');
  return [
    `${r.consultados} CNPJ(s) consultado(s), ${r.comEcf} com o regime da ECF.`,
    fontes && `Responderam — ${fontes}.`,
    r.naoEncontrados ? `${r.naoEncontrados} não encontrado(s).` : '',
    r.falhas ? `${r.falhas} sem resposta.` : '',
    r.problemas.length ? `Problemas: ${r.problemas.join('; ')}.` : '',
    r.restantes ? `Faltam ${r.restantes}: clique de novo.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
