# Simulador RTC no AWS Lightsail

Passo a passo para colocar o simulador no ar para o time fiscal validar. Usa o kit de produção do frame
(`deploy/`): Postgres, a aplicação, Caddy (HTTPS automático) e backup diário, tudo em Docker num servidor só.
Detalhes do dia a dia (logs, backup, restauração) em `deploy/LEIAME.md`.

Tempo total: uns 40 minutos, metade esperando instalação e compilação.

---

## 1. Criar a instância (console do Lightsail)

1. **Create instance**
   - **Região:** a mais próxima do Brasil que aparecer na lista (se não houver São Paulo, Virgínia/`us-east-1`).
   - **Plataforma:** Linux/Unix → **OS Only → Ubuntu 24.04 LTS**.
   - **Launch script** ("Add launch script"): cole o conteúdo inteiro de `scripts/rtc/lightsail-inicial.sh`. Ele
     ajusta o fuso, cria swap, instala o Docker e as atualizações de segurança automáticas.
   - **Plano:** **2 GB de RAM** (dual-core). Com 1 GB a compilação não cabe.
   - **Nome:** `simulador-rtc`.
2. **Networking** da instância:
   - **Create static IP** e associe à instância (o IP não muda ao reiniciar).
   - **IPv4 Firewall:** mantenha SSH (22), adicione **HTTP (80)** e **HTTPS (443)**. Recomendado: em SSH, marque
     "Restrict to IP address" com o IP do escritório/casa.
3. **Snapshots** da instância: ligue o **snapshot automático diário** (cópia do servidor inteiro).

## 2. Endereço

- **Com domínio** (recomendado), ex.: `simulador.lighthouseit.com.br`: crie no DNS um registro **A** apontando para o
  IP estático. Confira com `nslookup simulador.lighthouseit.com.br`.
- **Sem domínio por enquanto:** use `<ip-com-hífens>.sslip.io` (ex.: IP `3.129.231.124` →
  `3-129-231-124.sslip.io`). O HTTPS funciona do mesmo jeito; dá para trocar depois.

## 3. Entrar no servidor

No console, botão **Connect using SSH** (abre um terminal no navegador). Confira se a preparação terminou:

```bash
tail -3 /var/log/preparacao-servidor.log     # tem que terminar com PRONTO (leva uns 5 minutos)
exit                                          # saia e entre de novo (para o grupo docker valer)
```

## 4. Código no servidor

O repositório é privado: crie uma **chave de implantação** (só leitura) no servidor.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "deploy@simulador-rtc"
cat ~/.ssh/github_deploy.pub
```

No GitHub: **andreromero17/simulador-rtc → Settings → Deploy keys → Add deploy key**, cole a linha e deixe
"Allow write access" **desmarcado**. Depois:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
ssh -o StrictHostKeyChecking=accept-new -T git@github.com    # "successfully authenticated" = ok
git clone git@github.com:andreromero17/simulador-rtc.git ~/app
```

## 5. Configuração

```bash
cd ~/app
cp deploy/.env.exemplo deploy/.env
openssl rand -hex 24          # copie: vai ser a senha do Postgres
nano deploy/.env
```

Altere no arquivo:

| Linha                           | Valor                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `DOMINIO`                       | `simulador.lighthouseit.com.br` (ou o `...sslip.io`)                                   |
| `APP_URL`                       | `https://` + o mesmo endereço                                                          |
| `POSTGRES_DB` / `POSTGRES_USER` | `simulador`                                                                            |
| `POSTGRES_PASSWORD`             | a senha gerada acima                                                                   |
| `SMTP_*`                        | e-mail para convites e "esqueci a senha" (Gmail: senha de app). Pode ficar para depois |
| `ADMIN_2FA_OBRIGATORIO`         | `true` (administradores com verificação em duas etapas)                                |

Salve (`Ctrl+O`, `Enter`, `Ctrl+X`) e crie o atalho `dc`:

```bash
echo "alias dc='docker compose -f ~/app/deploy/docker-compose.yml --env-file ~/app/deploy/.env'" >> ~/.bashrc
source ~/.bashrc
```

## 6. Subir

```bash
dc up -d --build      # primeira vez: 5 a 10 minutos (compila)
dc ps                 # db, app, caddy e backup rodando
dc logs -f app        # "API rodando em ..." = no ar (Ctrl+C sai do log)
```

Crie o administrador (anote a senha provisória):

```bash
dc exec app node dist/cli.js admin andre.romero@lighthouseit.com.br "André Romero"
```

Abra `https://<DOMINIO>`, entre, troque a senha e configure a verificação em duas etapas (app autenticador).

## 7. Preparar para o time fiscal

1. **Configurações:** nome "Simulador RTC", logo e cores da Lighthouse.
2. **Empresas:** cadastre a Lighthouse (regime, ISS de Porto Alegre, PIS/Cofins se tiver regime ou alíquota
   diferente do padrão).
3. **Importar planilhas** → arquivo do NetSuite (com o CNPJ dos clientes) → **Consultar CNPJs** → ajuste o regime
   (Real/Presumido) dos principais clientes.
4. **Acessos:** em **Administração → Usuários**, crie um usuário para cada pessoa do fiscal com o perfil adequado
   (somente leitura para quem só valida). Com SMTP configurado, prefira **Membros → Convidar**, que manda o link por
   e-mail. Sem SMTP, crie o usuário com senha provisória e passe por um canal seguro.

## Atualizar depois de mudanças no código

Depois do `git push` para o `main`:

```bash
~/app/deploy/atualizar.sh     # baixa, recompila, aplica migrações e sobe (1 a 3 minutos fora do ar)
```

## Segurança — os dados são reais

- Acesso só com login; administradores com duas etapas; tudo em HTTPS.
- O Postgres não fica exposto na internet (só a aplicação o acessa).
- Backup diário do banco em `~/app/deploy/backups` (14 dias) + snapshot diário da instância.
- Quer limitar ainda mais? No firewall do Lightsail, restrinja também o **HTTPS (443)** aos IPs da Lighthouse:
  só quem estiver na rede (ou VPN) da empresa abre o sistema.
