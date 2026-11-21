import express, { Router } from 'express';
import { z } from 'zod';
import { CCLASSTRIB, CCLASSTRIB_META, OPCOES_SIMPLES } from '@frame/shared';
import { requirePermission, userOf } from '../auth/middleware';
import type { Db } from '../db/knex';
import { badRequest } from '../utils/http';
import { buscarServicos, CATALOGO_META, ITENS_LC116, sugerirCClassTrib, candidatos } from './rtc/catalogo';
import { atualizarParceiros } from './rtc/cnpj';
import { parceirosDaEmpresa } from './rtc/parceiros';
import { importar, modeloPlanilha, previaImportacao } from './rtc/importacao';
import { rodarSimulacao } from './rtc/simulacao';

/**
 * Rotas do simulador (montadas em /api, depois do login, no espaço da sessão):
 *   GET  /api/rtc/simulacao?empresa_id=&cenario_id=&estrategia=preco|liquido&cliente_real_credita=1&opcao_simples=
 *   GET  /api/rtc/catalogo?q=                 busca no catálogo oficial LC 116 → NBS → cClassTrib
 *   GET  /api/rtc/cclasstrib                  tabela de cClassTrib (com reduções)
 *   GET  /api/rtc/importar/modelo             planilha modelo (.xlsx)
 *   POST /api/rtc/importar?empresa_id=&previa=1&substituir=1   corpo = arquivo .xlsx
 *   GET  /api/rtc/parceiros?empresa_id=        clientes e fornecedores da empresa, com totais de 2026
 *   POST /api/rtc/parceiros/consultar         { ids?: number[] } consulta CNPJs (regime Simples/MEI)
 */
export function appRouter(db: Db) {
  const router = Router();
  const arquivo = express.raw({ type: () => true, limit: '20mb' });

  const simulacaoQuery = z.object({
    empresa_id: z.coerce.number().int().positive(),
    cenario_id: z.coerce.number().int().positive().optional(),
    estrategia: z.enum(['preco', 'liquido']).optional(),
    cliente_real_credita: z.enum(['0', '1']).optional(),
    opcao_simples: z.enum(OPCOES_SIMPLES).optional(),
  });

  router.get('/rtc/simulacao', requirePermission('receitas', 'ver'), async (req, res) => {
    const q = simulacaoQuery.safeParse(req.query);
    if (!q.success) throw badRequest('Parâmetros inválidos: informe a empresa');
    const r = await rodarSimulacao(db, {
      empresaId: q.data.empresa_id,
      cenarioId: q.data.cenario_id,
      opcaoSimples: q.data.opcao_simples,
      premissas: {
        ...(q.data.estrategia ? { estrategiaPreco: q.data.estrategia } : {}),
        ...(q.data.cliente_real_credita ? { clienteRealCreditaPisCofins: q.data.cliente_real_credita === '1' } : {}),
      },
    });
    res.json(r);
  });

  router.get('/rtc/catalogo', requirePermission('receitas', 'ver'), (req, res) => {
    const q = String(req.query.q ?? '');
    res.json({ meta: CATALOGO_META, itens: ITENS_LC116, servicos: buscarServicos(q, 100) });
  });

  router.get('/rtc/sugestao', requirePermission('receitas', 'ver'), (req, res) => {
    const nbs = String(req.query.nbs ?? '');
    const item = String(req.query.item ?? '');
    res.json({
      sugerido: sugerirCClassTrib(nbs, item, String(req.query.padrao ?? '')),
      possiveis: candidatos(nbs, item),
    });
  });

  router.get('/rtc/cclasstrib', requirePermission('receitas', 'ver'), (_req, res) => {
    res.json({ meta: CCLASSTRIB_META, cclasstrib: CCLASSTRIB });
  });

  router.get('/rtc/importar/modelo', requirePermission('receitas', 'criar'), async (_req, res) => {
    const cats = (await db('categorias_custo').orderBy('nome').select('nome')).map((c) => String(c.nome));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-simulador-rtc.xlsx"');
    res.send(await modeloPlanilha(cats));
  });

  router.post(
    '/rtc/importar',
    requirePermission('receitas', 'criar'),
    requirePermission('custos', 'criar'),
    requirePermission('parceiros', 'criar'),
    arquivo,
    async (req, res) => {
      const empresaId = Number(req.query.empresa_id);
      if (!empresaId) throw badRequest('Escolha a empresa');
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (req.query.previa === '1') {
        res.json(await previaImportacao(db, empresaId, buf));
        return;
      }
      const nome = String(req.query.nome ?? 'planilha.xlsx').slice(0, 120);
      res.json(
        await importar({ db, user: userOf(req), ip: req.ip }, empresaId, buf, nome, req.query.substituir === '1'),
      );
    },
  );

  router.get('/rtc/parceiros', requirePermission('parceiros', 'ver'), async (req, res) => {
    const empresaId = Number(req.query.empresa_id);
    if (!empresaId) throw badRequest('Escolha a empresa');
    res.json(await parceirosDaEmpresa(db, empresaId));
  });

  router.post('/rtc/parceiros/consultar', requirePermission('parceiros', 'editar'), async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(Number).filter(Boolean) : undefined;
    res.json(await atualizarParceiros(db, { ids, limite: 30 }));
  });

  return router;
}
