# Plano de Implementação — Especificações Consolidadas

> Checklist vivo, item a item, em [CHECKLIST_FUNCIONALIDADES.md](CHECKLIST_FUNCIONALIDADES.md) —
> atualizar a cada fase concluída.

Fonte: `docs/doc1` (especificações principais v1.3 + Anexos 1-2), `docs/doc2` (Anexo 3),
`docs/doc3` (Anexo 4), `docs/doc4` (regras R.D./Suriname — documentação do código atual + requisito de persistência).
Branch de trabalho: `feature/backoffice-specs`.

---

## 1. Estado atual do sistema (levantamento)

Arquitetura: SPA (Vite, `src/js/app.js` ~63k linhas) · dados no `localStorage` espelhados no
Supabase via `storage.js` (tabelas `dossiers`, `dossier_list`, `clients`, `clients_db`, `tasks`,
`kv_store`, `profiles`, `audit_log`) · deploy estático via PM2 porta 4100.

| Spec | Já existe? | Observações |
|---|---|---|
| 1.x Status do deal | ⚠️ Parcial | Kanban v3.127 usa `devis/invoiced/ticketing/ticketed`; spec exige `quote/awaiting_payment/ticketing/ticketed` com transições PAYOUT→pagamento→emissão. Fluxo PAYOUT/emissão existe, mas sem status canônico persistido nem timeline. |
| 2.x Auto-save global | ⚠️ Parcial | Save na troca de aba (`quotingSwitch`) + sync background Supabase. Falta save contínuo por campo (debounce) e indicador "Salvando…/Salvo/Erro". |
| 3.x Menu Booking | ⚠️ Parcial | Kanban + Tabela existem. Cards sem logo de companhia, sem dossier clicável estilizado, colunas com nomes antigos; rota A4 multicity não implementada no card. |
| 4.x Upload documentos | ❌ | Arquivos só em memória (`card._files`) — perdidos no reload (confirmado no doc4 §5). Scan passaporte extrai dados (worker Cloudflare) mas não arquiva no perfil do cliente. |
| 5.x Dashboard | ⚠️ Parcial | Widgets TÂCHES (`welcome-tasks-today`) e Vols de la semaine existem. Verificar: 3 colunas Hoje/Amanhã/Próximos, popup modal sem redirecionar (bug citado na spec). |
| 6.x Menu Tarefas | ⚠️ Parcial | Lista existe (`tarefasRender`). Kanban 4 funis + filtro por categoria não existe. |
| 7.x Disponibilidade B2B | ❌ | Página atual é grade de agentes (`disp-agents-grid`); spec pede a página B2B `www.expaturtravel.com/b2b`. |
| 8.x Finance ↔ Ticketing | ✅ | Já implementado — premissa da spec é "não recriar, apenas integrar". Manter. |
| 9.x Interconexão módulos | ⚠️ Parcial | Vendedor (dropdown) e fornecedor (Cost Calculator) existem; visões consolidadas por fornecedor/vendedor/cliente parciais. |
| 10.x Backup diário | ❌ | Inexistente. |
| A1 Permissões por menu | ❌ | `profiles` tem só `role agent/admin`. Sem checkboxes por módulo, sem usuário supremo. |
| A2 Log geral | ⚠️ Mínimo | `audit_log` básico (action, actor, target). Falta old/new value, módulo, IP, imutabilidade, painel com filtros. |
| A3 Timeline + comments | ❌ | Revisions internas do kanban existem, mas sem timeline de status nem comentários no painel direito. |
| A4 Rota no card | ❌ | Card atual mostra 1 trecho. |
| A5 Menu PROGRAMAS | ❌ | `MILES_ISSUERS` hardcoded em `app.js:460` com os mesmos 11 nomes do seed da spec. |
| A6 Busca de cliente | ⚠️ Parcial | Busca existe; falta opção fixa "+ Créer un nouveau client" no topo, campos ocultos por padrão, modo leitura + lápis. |
| A7 Dropdowns Cost Calc | ❌ | TRECHO e FOURNISSEUR não são alimentados por Itinéraire/banco. |
| A8 Logos companhias | ⚠️ Parcial | Base `assets/airlines` existe e alimenta PDFs. Falta usar nos cards do Kanban com placeholder. |
| A9 Atribuição/visibilidade | ❌ | Sem created_by/assigned_to, sem visibilidade por usuário, sem RLS por dono. |
| A10 Juntar os Segmentos | ❌ | Inexistente (checkbox, colapso de campos, PDF de confirmação com layout único). |
| Doc4 §1-4, 6 (R.D./Suriname) | ✅ | O doc4 documenta o comportamento já implementado (gatilhos SDQ/PUJ/STI/POP/PBM, tarefas automáticas, Cost Calc VISA/E.T.A). Exceção: gatilho Volta Cancelada deve ser "qualquer trecho partindo de CMN" (código atual exige CMN→GRU) — corrigir. |

## 2. Decisões de UI/UX (mantendo o padrão visual atual)

- **PROGRAMAS**: novo item na sidebar (seção MAIN, abaixo de Fornecedores) — é uma entidade de
  negócio de primeiro nível com dashboard próprio, igual a Fornecedores/Vendedores. Página com
  dashboard top-5 no topo + tabela + drawer de detalhe (mesmo padrão do detalhe de Bookings).
- **FOURNISSEUR no Cost Calculator**: dropdown único com grupos `<optgroup>` "Programas" e
  "Fornecedores" (decisão A7.2 deixada ao dev — grupos preservam contexto sem duplicar menus).
- **Timeline + Comments**: painel direito colapsável dentro do Ticketing (não um menu novo) —
  conforme A3.3, visível só a partir de `ticketed`.
- **Log geral (A2)**: nova aba "Journal" dentro do painel Gestion utilisateurs (visível só para o
  supremo) — evita menu novo para função administrativa.
- **Tarefas Kanban**: toggle Lista/Kanban no topo da página Tarefas, mesmo padrão do toggle
  Kanban/Tableau já existente em Bookings.
- **Disponibilidade B2B**: iframe embutido da página `www.expaturtravel.com/b2b` na seção
  existente, com fallback de link externo.
- **Permissões**: o painel Gestion utilisateurs ganha colunas/checkboxes por módulo + atribuição +
  visibilidade, aplicadas em tempo real (Supabase Realtime no canal `profiles`).
- **Status do deal**: vocabulário interno `quote/awaiting_payment/ticketing/ticketed` persistido
  no dossier (`data.status`) e em coluna própria de `dossiers` (para RLS/queries); labels FR/PT
  conforme spec. O mapeamento do kanban v3.127 é substituído pelo canônico.

## 3. Checklist de implementação (fases)

- [x] **Fase 0 — Fundações**: migrations (programs, program_emissions, deal_comments,
      deal_timeline, system_log, doc_files + bucket, colunas em dossiers, permissões em profiles,
      RLS), seed dos 11 programas. *Pré-requisito de todas as demais.* ✅ 2026-06-12
- [x] **Fase 1 — Menu PROGRAMAS** (A5, A7.2): CRUD, dashboard top-5, tabela, detalhe com emissões,
      FOURNISSEUR dinâmico, registro de emissões no ticketed. ✅ 2026-06-12
- [x] **Fase 2 — Status canônico + timeline + comments** (1.x, A3, A9.1-2): transições com efeitos
      colaterais (redirecionar TICKETS no pagamento), deal_timeline, painel direito, created_by/
      assigned_to automáticos. ✅ 2026-06-12 — `src/js/deal-status.js`
- [x] **Fase 3 — Booking Kanban/Lista** (3.x, A4, A8): colunas renomeadas, card completo com logo
      IATA + placeholder, rota multicity truncada, dossier clicável. ✅ 2026-06-12 — bloco v3.128
      do `app.js` atualizado in-place (o watcher de re-render usa o closure interno).
- [ ] **Fase 4 — Auto-save global + indicador** (2.x).
- [ ] **Fase 5 — Documentos persistentes + scan→cliente** (4.x, doc4 §5): Storage privado,
      doc_files, nomeação automática por PAX, arquivamento no cliente, log de acesso.
- [ ] **Fase 6 — Permissões/atribuição/visibilidade** (A1, A9.3-5): supremo, checkboxes por menu
      em tempo real, can_assign_deals, deal_visibility com RLS no backend.
- [ ] **Fase 7 — Log geral** (A2): system_log imutável + painel Journal com filtros.
- [ ] **Fase 8 — Dashboard/Tarefas/Disponibilidade** (5, 6, 7): widget TÂCHES 3 colunas + modal
      (corrigir redirecionamento), Vols de la semaine (ticketed + PNR), Tarefas Kanban 4 funis +
      filtro categoria, B2B embed.
- [ ] **Fase 9 — Juntar os Segmentos + busca de cliente** (A10, A6): checkbox multicity, PDF com
      layout único, flag persistida; search bar com "+ Créer un nouveau client" e modo leitura/lápis.
- [ ] **Fase 10 — Backup diário** (10.x): cron na VPS, export criptografado, checksum, retenção
      30d, alerta em falha, restauração documentada.
- [x] **Correção doc4**: gatilho Volta Cancelada = qualquer trecho partindo de CMN (hoje CMN→GRU).
      ✅ 2026-06-12 — junto com a Fase 2.

## 4. Ordem e dependências

```
Fase 0 ─┬─ Fase 1 (programs)
        ├─ Fase 2 (status/timeline/comments) ── Fase 3 (kanban usa status canônico)
        ├─ Fase 5 (doc_files/bucket)
        ├─ Fase 6 (profiles/RLS) ── Fase 7 (system_log usa supremo)
        └─ Fase 4, 8, 9, 10 (independentes entre si)
```

## 5. Migrations

Arquivos em `supabase/migrations/NNN_*.sql`, numerados na ordem de aplicação. Como o projeto não
tem acesso DDL via API (apenas anon/service key REST), **aplicar no SQL Editor do Supabase
Dashboard**, na ordem. Cada arquivo é idempotente (`if not exists` / `on conflict`).

## 6. Critérios de teste por fase

Cada fase fecha com: build ok, teste manual guiado (roteiro entregue junto), correções, commit na
branch. Merge para `main` + deploy só com o conjunto validado.
