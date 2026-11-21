# Monta o SQLite da calculadora oficial aplicando as migrações Flyway em ordem (uso: montar_base.py <flyway/sql> <saida.db>)
import sqlite3, sys, os, re, glob
base = sys.argv[1]; out = sys.argv[2]
if os.path.exists(out): os.remove(out)
con = sqlite3.connect(out)
FK = os.environ.get("FK","0")  # as migrações oficiais dependem de FKs desligadas fora do Flyway
def run(f):
    sql = open(f, encoding='utf-8').read()
    try:
        con.executescript(("PRAGMA foreign_keys=OFF;\n" if FK=="0" else "") + sql)
    except Exception as e:
        print("ERRO", os.path.basename(f), e)
run(f"{base}/criacao/beforeMigrate.sql")
run(f"{base}/criacao/B0001__sistema_tributario_completo.sql")
vs = sorted(glob.glob(f"{base}/manutencao/V*.sql"), key=lambda p: int(re.search(r'V(\d+)', os.path.basename(p)).group(1)))
for v in vs: run(v)
run(f"{base}/criacao/afterMigrate.sql")
con.commit()
for (n,) in con.execute("select name from sqlite_master where type='table' order by name"):
    c = con.execute(f'select count(*) from "{n}"').fetchone()[0]
    print(n, c)
