// Formatação e dados compartilhados pelas telas do simulador
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ListResponse, Row } from '@frame/shared';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

export const pct = (v: number | null | undefined, casas = 2) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

export const brl = (v: number | null | undefined, casas = 0) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : (Math.abs(v) < 0.5 / 10 ** casas ? 0 : v).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      });

/** R$ 1,2 mi · R$ 350 mil */
export const brlCurto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return brl(v);
};

export const variacao = (novo: number, base: number) => (base ? ((novo - base) / Math.abs(base)) * 100 : null);

export function useEmpresas() {
  const toast = useToast();
  const [empresas, setEmpresas] = useState<Row[] | null>(null);
  useEffect(() => {
    api
      .get<ListResponse>('/empresas?pageSize=500&sort=nome&dir=asc')
      .then((r) => setEmpresas(r.rows))
      .catch((e) => {
        toast.error(errorMessage(e));
        setEmpresas([]);
      });
  }, [toast]);
  return empresas;
}

const CHAVE = 'rtc.empresa';

/**
 * Empresa ativa: uma só para todas as telas do simulador (lembrada no navegador). A URL pode trazer outra
 * (`?<param>=id`, ex.: um link) — ela passa a ser a ativa. Com `fixarNaUrl`, a tela sempre mostra o parâmetro na URL:
 * as listagens usam `empresa_id`, que é o próprio filtro do CRUD (e preenche a empresa no "Novo").
 */
export function useEmpresaEscolhida(empresas: Row[] | null, param = 'empresa', fixarNaUrl = false) {
  const [params, setParams] = useSearchParams();
  const daUrl = Number(params.get(param)) || null;
  const lembrada = Number(localStorageGet(CHAVE)) || null;
  const existe = (x: number | null) => !!x && !!empresas?.some((e) => e.id === x);
  const id = (existe(daUrl) && daUrl) || (existe(lembrada) && lembrada) || empresas?.[0]?.id || null;

  useEffect(() => {
    if (!id) return;
    if (lembrada !== id) localStorageSet(CHAVE, String(id));
    if (fixarNaUrl && daUrl !== id) {
      const p = new URLSearchParams(params);
      p.set(param, String(id));
      p.delete('page');
      setParams(p, { replace: true });
    }
  }, [id, lembrada, daUrl, fixarNaUrl, param, params, setParams]);

  const escolher = (novo: number) => {
    localStorageSet(CHAVE, String(novo));
    const p = new URLSearchParams(params);
    p.set(param, String(novo));
    p.delete('page');
    setParams(p, { replace: true });
  };
  return { id, escolher, params, setParams };
}

function localStorageGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
