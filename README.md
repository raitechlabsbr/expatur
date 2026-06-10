# Expatur Backoffice

Backoffice da agência de viagens Expatur: ticketing (devis → booking → emissão),
gestão de clientes, tarefas, fornecedores, vendedores e financeiro (incl. saldo
e faturas Stripe).

**Stack:** Vite + JavaScript vanilla · Supabase (auth + base de dados) ·
Cloudflare Workers (Stripe e busca de voos) · PM2 + `serve` em produção.
Não há nenhum backend próprio além do Supabase — o antigo backend PHP foi
totalmente removido (ver `legacy/`).

## Desenvolvimento

```bash
npm install
cp .env.example .env     # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:3000
```

## Estrutura

```
index.html               Shell + todo o HTML estático da app
src/js/app.js            Lógica de negócio (extraída do monólito original;
                         contém os "patches" v3.x encadeados — editar com cuidado)
src/js/main.js           Entry point (ordem de imports importa)
src/js/storage.js        Persistência: localStorage nativo + sync Supabase
                         (tabelas dedicadas + catch-all kv_store)
src/js/auth.js           Autenticação Supabase (sobrepõe as funções do app.js)
src/js/ui-fixes.js       Correções de UX (PAYOUT, abas, Stripe auto-sync…)
src/styles/              CSS (main.css é o consolidado)
public/assets/           Assets locais (logos de companhias, base de aeroportos)
supabase/                schema.sql + scripts SQL (executar no SQL Editor)
scripts/setup-users.mjs  Criação de utilizadores (precisa da SUPABASE_SERVICE_KEY)
deploy/deploy.sh         Build + rsync + PM2 na VPS
legacy/                  Arquivo histórico (monólito original) — NÃO usar
```

## Supabase

1. Executar `supabase/schema.sql` no SQL Editor (inclui o fix de RLS de
   `profiles` via função `is_admin()` security definer).
2. Opcional: `supabase/audit_log.sql` (aba Audit do painel Admin).
3. Criar utilizadores: `node scripts/setup-users.mjs` com
   `SUPABASE_SERVICE_KEY` no `.env.local` (nunca commitar).

Roles: `admin` (acesso total, aba Finance do Ticketing e menu Financeiro) e
`agent` (tudo exceto Finance/Financeiro). O role vem de
`user_metadata.role`, com fallback na tabela `profiles`.

## Serviços externos (Cloudflare Workers, conta administration-a14)

| Worker | Função |
|---|---|
| `expatur-balance` | Saldo Stripe (Financeiro) |
| `expatur-factures` | Criação/status de faturas Stripe (Paiement) |
| `expatur-stripe` | Operações Stripe live (pagamentos) |
| `expatur-serp` | Proxy SerpAPI (busca de voos) |

As chaves secretas (Stripe, SerpAPI) vivem nos workers, nunca no browser.

## Deploy

```bash
./deploy/deploy.sh   # build + rsync para a VPS + restart PM2 (porta 3100)
```
