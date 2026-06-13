
# Checklist de Funcionalidades — Backoffice Expatur

Fonte: `doc1` (especificações v1.3 + Anexos 1-2) · `doc2` (Anexo 3) · `doc3` (Anexo 4) · `doc4` (R.D./Suriname).
Plano de fases: [PLANO_IMPLEMENTACAO.md](PLANO_IMPLEMENTACAO.md) · Branch: `feature/backoffice-specs`

**Como usar**: ao concluir cada fase, marcar `[x]` nos itens entregues (com a fase entre parênteses).
`[x]` = implementado e testado · `[ ]` = pendente. Itens que já existiam no sistema antes deste
projeto estão marcados com *(pré-existente)*.

Última atualização: 2026-06-13 · Fases concluídas: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9

---

## DOC 1 — PARTE I: Especificações Principais (v1.3)

### 1. Deals — Status & Fluxo Geral → Fase 2 ✅
- [x] 1.1 Quatro estados canônicos: `quote`, `awaiting_payment`, `ticketing`, `ticketed` (labels Quote/Cotação, Aguardando Pagamento, Em Emissão, Emitido) (Fase 2 — `deal-status.js`, labels FR/PT em `window.DEAL_STATUS`)
- [x] 1.2 Navegação para Ticketing cria deal novo automaticamente com número de pedido *(pré-existente)*
- [x] 1.2 Deal nasce com status `quote` persistido (Fase 2 — `data.status` no jsonb + coluna `dossiers.status`)
- [x] 1.3 Transição quote → awaiting_payment (PAYOUT + invoice emitida via ÉMETTRE FACTURE) (Fase 2 — watcher de `expatur_em_invoice_*`/`expatur_booked_*`)
- [x] 1.3 Transição awaiting_payment → ticketing (pagamento total ou parcial em Finance) + redirecionar/exibir aba TICKETS (Fase 2 — watcher de `expatur_payments_*`; redireciona se o deal estiver aberto no Ticketing, senão toast)
- [x] 1.3 Transição ticketing → ticketed (campos preenchidos + ÉMETTRE) (Fase 2 — hook em `emettreBillet` + watcher de `billetFrozen_*`)
- [x] Migrar vocabulário legado da coluna `dossiers.status` (Fase 2 — migração em lote no login, 1×/navegador; jsonb migra lazy no 1º save de cada dossier)

### 2. Auto-Save Global → Fase 4 ✅
- [x] Auto-save na troca de abas do Ticketing + sync background com Supabase *(pré-existente)*
- [x] 2.1 Save automático contínuo por campo (sem ação manual) em todos os estágios do deal (Fase 4 — `autosave.js`, listeners delegados em input/change)
- [x] 2.1 Debounce 500ms–1s para campos de texto livre (Fase 4 — 800ms)
- [x] 2.1 Save imediato no onChange para select/toggle/checkbox/date picker (Fase 4)
- [x] 2.1 Indicador visual: "Salvando…" / "Salvo" / "Erro ao salvar" (Fase 4 — pill fixo, FR com tradução PT via i18n)
- [x] 2.2 Cobertura: campos do deal, abas (Tickets/Payout), invoice e pagamentos (Fase 4 — painéis do Ticketing + modais billet/emissão; invoice/pagamentos já salvavam na ação e agora reportam falha de sync)
- [x] 2.3 Em falha: alertar usuário e manter dados locais até confirmação (Fase 4 — storage.js rastreia chaves que falharam, alerta via toast/indicador e re-tenta no evento online + a cada 30s; localStorage preserva tudo)

### 3. Menu Booking — Visualização de Deals → Fase 3 ✅
- [x] 3.1 Visualização Kanban *(pré-existente; colunas alinhadas na Fase 3)*
- [x] 3.1 Visualização Lista/Tabela *(pré-existente)*
- [x] 3.1 Colunas do Kanban = Quote | Aguardando Pagamento | Em Emissão | Emitido (Fase 3 — labels FR/PT via i18n; agrupamento pelo status canônico persistido)
- [x] 3.2 Card: origem/destino (Fase 3 — bloco DEP → ARR calculado dos trechos do dossier)
- [x] 3.2 Card: tipo de viagem (ida e volta, somente ida, múltiplos destinos) (Fase 3)
- [x] 3.2 Card: logo da companhia aérea (Fase 3 — base assets/airlines + placeholder, A8)
- [x] 3.2 Card: número do dossier clicável (abre o deal no Ticketing) (Fase 3)
- [x] 3.2 Card: PNR (Fase 3 — masterPnr/PNR por trecho/pax do registro de billet)
- [x] 3.2 Card: valor total do deal (Fase 3 — sempre visível, com fallback pax × preço − desconto)
- [x] 3.3 Clicar no card abre o deal com os dados salvos *(corrigido em 2026-06-12 — deals fantasma)*
- [x] 3.3 Número do dossier visualmente distinguível como clicável (sublinhado/cor) (Fase 3)
- [x] 3.4 Rota Ticketing sem parâmetro cria deal novo; abrir deal existente NÃO instancia novo *(pré-existente)*

### 4. Ticketing — Upload & Gestão de Documentos de Viagem → Fase 5 ✅
- [x] Scan de passaporte com extração de dados (worker) *(pré-existente)*
- [x] 4.1 Extrair nome completo do PAX do passaporte e nomear o arquivo automaticamente (Fase 5 — "NOM PRENOM PASSPORT.ext" no Tickets/Scan *(pré-existente)* e no Scan da aba Client *(novo)*)
- [x] 4.1 Arquivar automaticamente o documento no perfil do cliente (sem ação manual) (Fase 5 — upload ao bucket + doc_files no "Appliquer" do scan)
- [x] 4.1 Vínculo do documento pelo deal aberto E pelo nome extraído (Fase 5 — colunas dossier_ref/client_ref + pax_name)
- [x] 4.1 Regra aplicada a todos os pontos de upload (Fase 5 — anexos da aba Documents, arquivos por pax da aba Tickets, Scan Passport da aba Client; corrigidos handlers da aba Documents que estavam quebrados — sem export no window e elemento doc-annexe-card inexistente)
- [x] 4.2 Upload via HTTPS/TLS *(site já servido via HTTPS)*
- [x] 4.2 Armazenamento em storage criptografado (Fase 5 — bucket privado `documents`, criptografia em repouso do Supabase Storage)
- [x] 4.2 Acesso restrito por perfil de usuário (Fase 5 — RLS somente autenticados; granularidade por módulo chega com as permissões da Fase 6)
- [x] 4.2 Nenhum documento acessível via URL pública direta (Fase 5 — download só por signed URL de 120s)
- [x] 4.2 Log de acesso: quem acessou/baixou cada documento, com timestamp (Fase 5 — doc_access_log a cada download; leitura só pelo supremo)

### 5. Dashboard — Welcome Page → Fase 8 ✅
- [x] 5.1 Widget TÂCHES existe no dashboard *(pré-existente)*
- [x] 5.1 TÂCHES em 3 colunas: Hoje / Amanhã / Prochains Jours (7 dias) (Fase 8 — `dashboard.js`, fonte canônica `window.getAllTasks`)
- [x] 5.1 Pendentes no topo; completadas abaixo, acinzentadas com check (Fase 8)
- [x] 5.1 Clicar no card abre popup/modal com a tarefa completa SEM redirecionar (Fase 8 — `window.openTaskDetail`)
- [x] 5.2 Widget VOLS DE LA SEMAINE existe *(pré-existente)*
- [x] 5.2 Vols: somente deals ticketed com PNR confirmado, semana corrente (Fase 8 — status canônico `DEAL_STATUS` + PNR de `expatur_billet_*`, semana lun→dim)
- [x] 5.2 Card do voo: origem, destino, data, PNR e companhia (Fase 8 — logo IATA quando disponível)

### 6. Menu Tarefas → Fase 8 ✅
- [x] 6.1 Visualização em lista, ordenável e filtrável *(pré-existente)*
- [x] 6.2 Visualização Kanban com 4 funis: Hoje / Amanhã / Essa Semana / Próximas Semanas (Fase 8 — `tasks-kanban.js`, toggle Liste/Kanban persistido; atrasadas caem em Hoje, sem data em Semaines suivantes)
- [x] 6.2 Filtro por categoria transversal a todos os funis (Fase 8 — dropdown alimentado pelas categorias presentes)
- [x] 6.2 Limpar filtro volta à visualização completa (Fase 8 — "Effacer le filtre" / opção Toutes)
- [x] 6.2 Card kanban simples: apenas nome + categoria (Fase 8 — clique abre o detalhe sem sair da página)

### 7. Menu Disponibilidade — Página B2B → Fase 8 ✅
- [x] 7.1 Integrar/embutir www.expaturtravel.com/b2b no menu Disponibilidade (Fase 8 — iframe em `section-disponibilidades` + fallback "Ouvrir dans un nouvel onglet" e aviso se o site bloquear via X-Frame-Options)

### 8. Módulo Finance — Interconexão Ticketing ↔ Financeiro
- [x] 8.1 Lógica de invoices, pagamentos e parcelamentos *(pré-existente — premissa: não recriar)*
- [x] 8.2 Invoice emitida em Ticketing reflete no Menu Financeiro *(pré-existente)*
- [x] 8.2 Pagamento no Financeiro atualiza o deal em Ticketing *(pré-existente)*
- [x] 8.3/8.4 deal_id como chave entre invoice, pagamento e dossier *(pré-existente)*
- [x] 8.2 Pagamento registrado dispara transição de status awaiting_payment → ticketing (Fase 2)

### 9. Interconexão entre Módulos → Fases 2-3 (vínculos) e 8 (visões)
- [x] 9.1 Vendedor discriminado em Ticketing via dropdown *(pré-existente)*
- [x] 9.2 Fornecedor vinculado via Cost Calculator *(pré-existente; Fournisseur dinâmico — Fase 1)*
- [ ] 9.2 Visão do fornecedor: dossiers, PNR, rota, data de emissão e valor por fornecedor
- [ ] 9.3 Visão do vendedor: deals associados com valor, comissão e status
- [ ] 9.4 Visão do cliente: reservas/serviços vinculados aos deals (nº dossier, tipo, datas, status, valor)
- [x] 9.4 Documentos arquivados acessíveis no perfil do cliente (Fase 5 — bloco "Documents archivés" no modal do menu Clientes, busca por dossier e por nome)
- [x] 9.5 Tarefas geradas mantêm referência ao deal de origem *(pré-existente)*
- [ ] 9.5 Navegar da tarefa diretamente ao deal correspondente

### 10. Backup Diário → Fase 10
- [ ] 10.1 Backup diário do banco completo (deals, clientes, fornecedores, tarefas, invoices, pagamentos)
- [ ] 10.1 Backup dos documentos de viagem (Storage)
- [ ] 10.1 Backup de configurações e logs de acesso/auditoria
- [ ] 10.2 Diário em horário de baixo tráfego (~02h), retenção ≥30 dias
- [ ] 10.2 Armazenado fora do servidor principal, criptografado em repouso
- [ ] 10.2 Verificação de integridade (checksum) + alerta ao admin em falha
- [ ] 10.3 Procedimento de restauração documentado e testado (restaurar por data)

---

## DOC 1 — PARTE II: Anexo 1

### A1. Painel de Gestão de Usuários → Fase 6 ✅
- [x] Painel de gestão de usuários existe (roles admin/agent) *(pré-existente)*
- [x] A1.1 Dois níveis por role (decisão 2026-06-13: sem usuário supremo) — `admin` (topo, acesso total + gerencia acessos + lê o Journal) e `agent` (padrão). Backend `is_admin()` na migration 007; app em `permissions.js` via `window.__perm.isAdmin`
- [x] A1.1 Apenas admin gerencia acessos (Fase 6 — painel só editável por admin, agents em modo leitura; reforço no backend pela trigger das migrations 006+007)
- [x] A1.2 Checkboxes por módulo: access_ticketing, access_bookings, access_fornecedores, access_vendedores, access_disponibilidades, access_tarefas, access_clientes, access_financeiro (Fase 6 — colunas migration 003; UI no painel Gestion utilisateurs)
- [x] A1.2 Usuário sem acesso não vê o menu na sidebar (Fase 6 — `applyMenuPermissions`; Financeiro segue restrito a admin/supremo por regra de negócio)
- [x] A1.2 Permissões aplicadas em tempo real (sem relogin) (Fase 6 — Supabase Realtime no canal profiles reaplica os menus do usuário ao vivo)

### A2. Log Geral de Alterações → Fase 7 ✅
- [x] A2.1 Logar: criação/status/atribuição de deals, invoices/pagamentos, uploads/exclusões de documentos, permissões, login/logout (Fase 7 — `window.__logEvent` chamado por deal-status/permissions/documents/auth; invoice e pagamento deduplicados para não poluir o log). *Edição genérica de campos do deal já cobre auto-save (2.x); eventos não-críticos restantes podem ser somados conforme necessidade.*
- [x] A2.2 Estrutura: timestamp UTC, user_id/email, action_type, module, entity_id, field_changed, old_value, new_value, ip_address (Fase 7 — tabela migration 004; `system-log.js` preenche todos os campos; IP via lookup best-effort cacheado por sessão)
- [x] A2.3 Acesso ao log apenas pelo admin, com filtros (usuário, módulo, tipo, datas, entity_id) (Fase 7 — painel Journal no Gestion utilisateurs; RLS de leitura por `is_supreme()`→`is_admin()` na migration 007)
- [x] A2.3 Log imutável (sem update/delete) — *garantido por RLS na migration 004*

### A3. Timeline de Alterações + Comments no Deal → Fase 2 ✅
- [x] A3.1 Timeline cronológica decrescente de transições de status (anterior, novo, data/hora, usuário), somente leitura (Fase 2 — toda transição grava em `deal_timeline`; fallback offline no `statusHistory` do jsonb)
- [x] A3.2 Seção de comentários (texto, autor, data/hora), ordem cronológica estilo chat, imutáveis (Fase 2 — `deal_comments`, sem UI de edição/exclusão + RLS sem update/delete)
- [x] A3.3 Painel direito colapsável na tela de Ticketing, visível apenas em deals ticketed+ (Fase 2 — botão "🕑 Historique" + drawer)

### A4. Rota no Card Kanban → Fase 3 ✅
- [x] A4.1 Trecho simples: IATA origem → IATA destino (Fase 3)
- [x] A4.2 Multicidade: trecho a trecho na ordem cadastrada, separados por `;`, truncar em 2 trechos + "…" (Fase 3)
- [x] A4.2 Rota calculada dinamicamente dos trechos do deal (sem campo manual) (Fase 3 — fields dep/arr + multiLegs; segments como fallback)

---

## DOC 1 — PARTE III: Anexo 2

### A5. Menu PROGRAMAS → Fase 1 ✅
- [x] A5.1 Menu PROGRAMAS na sidebar (Fase 1)
- [x] A5.1 Seed dos 11 programas: Smiles, Copa, Latam Pass, Latam Tabela Fixa, Air France, APM, Azul Fidelidade, QR Privilege Club, Consolidator, VISA/E.T.A, Volta Cancelada (Fase 1 — migration 001)
- [x] A5.2 Adicionar novo programa (Fase 1)
- [x] A5.2 Modificar programa existente (Fase 1)
- [x] A5.2 Deletar programa com confirmação; com emissões vinculadas exige confirmação dupla e preserva histórico (Fase 1)
- [x] A5.3 Dropdown do Cost Calculator alimentado pela tabela programs — fonte única no banco, sem lista hardcoded (Fase 1)
- [x] A5.3 Alterações no menu refletem imediatamente no Cost Calculator (Fase 1)
- [x] A5.4 Cada emissão registra programa, volume, C.P.M, taxas, extra e subtotal vinculados ao deal (Fase 1)
- [x] A5.5 Estrutura por emissão: programa, volume, cpm, taxas, extra, sous-total, deal/dossier, data de emissão, vendedor (Fase 1 — migration 001)
- [x] A5.6 Dashboard top-5 programas por volume de milhas, atualizado a cada render (Fase 1)
- [x] A5.7 Tabela completa ordenável: nome, qtd. passagens emitidas, volume total de milhas; programas sem emissão exibem 0 (Fase 1)
- [x] A5.8 Detalhe do programa: lista de passagens emitidas (dossier clicável → abre deal, volume, PNR, fournisseur), ordenável, filtro por período, somente leitura (Fase 1)

### A6. Busca e Criação de Cliente em Ticketing → Fase 9 ✅
- [x] Busca de clientes na aba Cliente *(pré-existente)*
- [x] A6.1 Primeira opção fixa e destacada: "+ Créer un nouveau client" antes de qualquer resultado (Fase 9 — `client-picker.js`, aparece ao focar/buscar)
- [x] A6.2 Campos de preenchimento ocultos por padrão; aparecem só ao clicar em criar (Fase 9 — form oculto em deal sem cliente; scan de passaporte também revela o form)
- [x] A6.3 Cliente existente carrega em modo somente leitura, com ícone de lápis para habilitar edição (Fase 9 — campos `readonly`/`disabled` + botão ✏️)

---

## DOC 2 — Anexo 3

### A7. Cost Calculator & P&L — Dropdowns → Fase 1 (parcial) e Fase 2/3
- [ ] A7.1 Dropdown TRECHO alimentado exclusivamente pelos trechos da aba Itinéraire do deal corrente (rota, voo, data), sem entrada manual; vazio quando não há trechos; reflete alterações sem reload
- [x] A7.2 Dropdown FOURNISSEUR alimentado pelo banco de Fornecedores *(pré-existente)* + grupo Programas (Fase 1)
- [x] A7.3 SOUS-TOTAL calculado automaticamente em tempo real *(pré-existente)*

### A8. Base de Logos de Companhias Aéreas → Fase 3
- [x] A8.1 Base separada em workspace.expaturtravel.com/assets/airlines mantida fora do banco *(pré-existente)*
- [x] A8.2 Logos alimentam os PDFs de confirmação e cotações *(pré-existente)*
- [x] A8.2/A8.3 Logos nos cards do Kanban via IATA code, com placeholder genérico quando indisponível (Fase 3 — base local `/assets/airlines/{code}.svg` + fallback `makeAirlineLogoFallbackDataUrl`)

### A9. Log de Criação de Deals & Atribuição → Fases 2 e 6
- [x] A9.1 Deal registra: criado por, data/hora UTC, atribuído a, histórico de atribuições, histórico de status (integrado à timeline A3) (Fase 2 — `createdBy`/`assignedTo`/`assignmentHistory`/`statusHistory` no jsonb + colunas `created_by`/`assigned_to`)
- [x] A9.2 Atribuição automática ao criador na criação do deal (Fase 2 — + linha em `deal_assignments`)
- [x] A9.3 Reatribuição manual: supremo sempre; usuário com permissão só dos próprios; sem permissão não reatribui (Fase 6 — seletor "Assigné à" no painel do deal; gating por `window.__perm` em `deal-status.js`)
- [x] A9.3 Toda reatribuição registrada (quem, para quem, quando) (Fase 6 — linha em `deal_assignments` + `assignmentHistory` no jsonb; tabela criada na migration 002)
- [x] A9.4 Visibilidade de deals por usuário: Somente meus / Meus + equipe / Todos — aplicada no backend (RLS) (Fase 6 — seletor no painel; RLS `can_see_dossier` da migration 003 filtra a hidratação automaticamente)
- [x] A9.5 Painel de usuários com "Pode atribuir deals" (checkbox) e "Visibilidade de deals" (seletor) (Fase 6)

---

## DOC 3 — Anexo 4

### A10. Multi-City — "Juntar os Segmentos" → Fase 9 ✅
- [x] A10.1 Checkbox JUNTAR OS SEGMENTOS na aba TICKETS, visível apenas em multi-city (Fase 9 — "Joindre les segments" no billet modal)
- [x] A10.2 Comportamento desmarcado: reserva/ticket/PNR individuais por trecho *(pré-existente — comportamento atual)*
- [x] A10.3 Marcado: colapsa para UM conjunto único (reserva, ticket, PNR) vinculado a todos os trechos (Fase 9 — billet renderiza em modo single/master PNR quando ligado)
- [x] A10.4/A10.5 PDF de confirmação com layout único: 1 cabeçalho PAX + PNR/TKT únicos + trechos sequenciais (Fase 9 — `body.dataset.isMultiCity='0'` → gerador usa o layout single)
- [x] A10.6 Flag juntar_segmentos persistida no deal com auto-save, acessível ao gerador de PDF (Fase 9 — `merge-segments.js`: `fields['juntar-segmentos']` no dossier, sync via storage.js)

---

## DOC 4 — R.D. & Suriname (estado documentado do código + requisitos)

### Seções 1-4 e 6 — Regras de automação *(pré-existentes — doc gerado do código)*
- [x] 1.1-1.2 R.D.: linha automática ICF/QR no orçamento + nota de rodapé (1 pax / 2+ pax)
- [x] 1.3-1.4 R.D.: tarefas automáticas (QR code R.D, Volta Cancelada 36h) + aba Documentos QR entrada/saída
- [x] 2.x Suriname: linhas VFS + ICF/QR, nota de rodapé, tarefas Visa/ICF (7 dias, por trecho PBM), cartas Border Control + uploads
- [x] 3.x PBM: Cost Calculator VISA/E.T.A (33 USD × pax × câmbio ao vivo, editável) + Volta Cancelada (R$150 × pax)
- [x] 6.1 Check-in automático por trecho (AF/KL+IAH/CAY 30h · AT/G3/LA 48h · demais 24h, fuso SP)
- [x] 6.2 Volta Cancelada: gatilhos (tarificação/Cost Calc, CMN, partida R.D.) com dedupe, prazo 36h
- [x] 6.2 ⚠️ Correção: gatilho = qualquer trecho partindo de CMN (Fase 2 — tarefa automática e linha do Cost Calculator; QR Privilege Club continua restrito a CMN→GRU+GRU→MCP)

### Seção 5 — Persistência dos documentos → Fase 5 ✅
- [x] 5.2 Upload da aba Documentos enviado ao servidor e vinculado ao booking-ref (Fase 5 — `documents.js`)
- [x] 5.2 Metadados salvos (nome, passageiro, tipo, chave) (Fase 5 — doc_files)
- [x] 5.2 Ao reabrir dossier, documentos carregados automaticamente (Fase 5 — hidratação dos slots + bloco "Documents archivés" com download/exclusão)
- [x] 5.2 Exclusão remove o arquivo do servidor além do DOM (Fase 5 — Storage remove + delete em doc_files)

---

## Infraestrutura (Fase 0) ✅
- [x] Migration 001 — programs + program_emissions + seed (aplicada 2026-06-12)
- [x] Migration 002 — status/created_by/assigned_to em dossiers, deal_timeline, deal_comments, deal_assignments (aplicada 2026-06-12)
- [x] Migration 003 — permissões em profiles, is_supreme(), RLS de visibilidade (aplicada 2026-06-12)
- [x] Migration 004 — system_log + doc_access_log imutáveis (aplicada 2026-06-12)
- [x] Migration 005 — doc_files + bucket privado documents (aplicada 2026-06-12; bucket validado)
- [x] Migration 006 — trigger enforce de edição de permissões (aplicada 2026-06-13)
- [x] Migration 007 — modelo de dois níveis por role (is_admin(), is_supreme alias) (aplicada 2026-06-13; substitui o conceito de supremo das 003/006)
