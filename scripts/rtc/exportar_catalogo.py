# Exporta cClassTrib (com reduções) e o catálogo LC 116 → NBS → cClassTrib para o simulador
import sqlite3, json, sys
c = sqlite3.connect(sys.argv[1]); out_shared, out_server = sys.argv[2], sys.argv[3]
D = '2027-01-01'
def red(cltr_id, tb):
    r = c.execute("""select PERE_VALOR from PERCENTUAL_REDUCAO where PERE_CLTR_ID=? and PERE_TBTO_ID=?
       and PERE_INICIO_VIGENCIA<=? and (PERE_FIM_VIGENCIA is null or PERE_FIM_VIGENCIA>=?) order by PERE_INICIO_VIGENCIA desc""",(cltr_id,tb,D,D)).fetchone()
    return r[0] if r else 0.0
cl = []
for cid, cod, desc, tipo, nom, cst in c.execute("""select ct.CLTR_ID, ct.CLTR_CD, ct.CLTR_DESCRICAO, ct.CLTR_TIPO_ALIQUOTA, ct.CLTR_NOMENCLATURA, s.SITR_CD
   from CLASSIFICACAO_TRIBUTARIA ct join SITUACAO_TRIBUTARIA s on s.SITR_ID=ct.CLTR_SITR_ID
   where ct.CLTR_FIM_VIGENCIA is null and ct.CLTR_TIPO_ALIQUOTA <> 'Alíquotas Combinadas (Ad Valorem e Ad Rem)'
   order by ct.CLTR_CD""").fetchall():
    sem = tipo == 'Sem alíquota'
    cl.append(dict(codigo=cod, cst=cst, descricao=desc.strip(), tipoAliquota=tipo,
                   reducaoCbs=0 if sem else red(cid,2), reducaoIbs=0 if sem else red(cid,3), semIncidencia=sem))
lc = [dict(item=i, descricao=d.split(' (Redação')[0].strip()) for i,d in c.execute("select LSLC_CD, LSLC_DESCRICAO from LISTA_SERVICOS_LC_116 where LSLC_FIM_VIGENCIA is null and LSLC_CD<>''")]
def key(i): return [int(x) if x.isdigit() else 0 for x in i.split('.')]
lc.sort(key=lambda x: key(x['item']))
mp = {}
for item, nbs, nd, cod in c.execute("""select x.CNIL_LSLC_CD, x.CNIL_NBS_CD, n.NBS_DESCRICAO, ct.CLTR_CD from CLASSIF_NBS_INDOP_LC x
   join NBS n on n.NBS_CD=x.CNIL_NBS_CD join CLASSIFICACAO_TRIBUTARIA ct on ct.CLTR_ID=x.CNIL_CLTR_ID
   where x.CNIL_FIM_VIGENCIA is null and x.CNIL_IN_PS_ONEROSA=1 and x.CNIL_IN_ADQ_EXTERIOR=0"""):
    k=(item,nbs)
    e = mp.setdefault(k, dict(item=item, nbs=nbs, descricao=nd.strip(), cclasstrib=[]))
    if cod not in e['cclasstrib']: e['cclasstrib'].append(cod)
servicos = sorted(mp.values(), key=lambda e:(key(e['item']), e['nbs']))
ver = c.execute("select * from VERSAO_BASE_DADO order by 1 desc limit 1").fetchone()
meta = dict(fonte='github.com/ReceitaFederal/calculadora-rtc-regime-regular (migrações Flyway)', versaoBase=f'{ver[3]} de {str(ver[1])[:10]} — {ver[2]}')
json.dump(dict(meta=meta, cclasstrib=cl), open(out_shared,'w',encoding='utf-8'), ensure_ascii=False, indent=0)
json.dump(dict(meta=meta, itensLc116=lc, servicos=servicos), open(out_server,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
print(len(cl), len(lc), len(servicos), meta)
