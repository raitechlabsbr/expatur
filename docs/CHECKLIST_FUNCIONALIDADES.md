# Checklist de Funcionalidades — Backoffice Expatur

Fonte: `doc1` (especificações v1.3 + Anexos 1-2) · `doc2` (Anexo 3) · `doc3` (Anexo 4) · `doc4` (R.D./Suriname).
Plano de fases: [PLANO_IMPLEMENTACAO.md](PLANO_IMPLEMENTACAO.md) · Branch: `feature/backoffice-specs`

**Como usar**: ao concluir cada fase, marcar `[x]` nos itens entregues (com a fase entre parênteses).
`[x]` = implementado e testado · `[ ]` = pendente. Itens que já existiam no sistema antes deste
projeto estão marcados com *(pré-existente)*.

Última atualização: 2026-06-12 · Fases concluídas: 0, 1

---

## DOC 1 — PARTE I: Especificações Principais (v1.3)

### 1. Deals — Status & Fluxo Geral → Fase 2
- [ ] 1.1 Quatro estados canônicos: `quote`, `awaiting_payment`, `ticketing`, `ticketed` (labels Quote/Cotação, Aguardando Pagamento, Em Emissão, Emitido)
- [x] 1.2 Navegação para Ticketing cria deal novo automaticamente com número de pedido *(pré-existente)*
- [ ] 1.2 Deal nasce com status `quote` persistido
- [ ] 1.3 Transição quote → awaiting_payment (PAYOUT + invoice emitida via ÉMETTRE FACTURE)
- [ ] 1.3 Transição awaiting_payment → ticketing (pagamento total ou parcial em Finance) + redirecionar/exibir aba TICKETS
- [ ] 1.3 Transição ticketing → ticketed (campos preenchidos + ÉMETTRE) — *a geração de tarefas pós-emissão já existe (pré-existente)*
- [ ] Migrar vocabulário legado da coluna `dossiers.status` (`draft` → `quote` etc.)

### 2. Auto-Save Global → Fase 4
- [x] Auto-save na troca de abas do Ticketing + sync background com Supabase *(pré-existente)*
- [ ] 2.1 Save automático contínuo por campo (sem ação manual) em todos os estágios do deal
- [ ] 2.1 Debounce 500ms–1s para campos de texto livre
- [ ] 2.1 Save imediato no onChange para select/toggle/checkbox/date picker
- [ ] 2.1 Indicador visual: "Salvando…" / "Salvo" / "Erro ao salvar"
- [ ] 2.2 Cobertura: campos do deal, abas (Tickets/Payout), invoice e pagamentos
- [ ] 2.3 Em falha: alertar usuário e manter dados locais até confirmação (sem perda silenciosa)

### 3. Menu Booking — Visualização de Deals → Fase 3
- [x] 3.1 Visualização Kanban *(pré-existente; alinhar colunas na Fase 3)*
- [x] 3.1 Visualização Lista/Tabela *(pré-existente)*
- [ ] 3.1 Colunas do Kanban = Quote | Aguardando Pagamento | Em Emissão | Emitido
- [ ] 3.2 Card: origem/destino
- [ ] 3.2 Card: tipo de viagem (ida e volta, somente ida, múltiplos destinos)
- [ ] 3.2 Card: logo da companhia aérea
- [ ] 3.2 Card: número do dossier clicável (abre o deal no Ticketing)
- [ ] 3.2 Card: PNR
- [ ] 3.2 Card: valor total do deal
- [x] 3.3 Clicar no card abre o deal com os dados salvos *(corrigido em 2026-06-12 — deals fantasma)*
- [ ] 3.3 Número do dossier visualmente distinguível como clicável (sublinhado/cor)
- [x] 3.4 Rota Ticketing sem parâmetro cria deal novo; abrir deal existente NÃO instancia novo *(pré-existente)*

### 4. Ticketing — Upload & Gestão de Documentos de Viagem → Fase 5
- [x] Scan de passaporte com extração de dados (worker) *(pré-existente)*
- [ ] 4.1 Extrair nome completo do PAX do passaporte e nomear o arquivo automaticamente
- [ ] 4.1 Arquivar automaticamente o documento no perfil do cliente (sem ação manual)
- [ ] 4.1 Vínculo do documento pelo deal aberto E pelo nome extraído
- [ ] 4.1 Regra aplicada a todos os pontos de upload (Scan Passport, Tickets/Scan, aba cliente)
- [x] 4.2 Upload via HTTPS/TLS *(site já servido via HTTPS)*
- [ ] 4.2 Armazenamento em storage criptografado (bucket privado Supabase) — *bucket criado (migration 005)*
- [ ] 4.2 Acesso restrito por perfil de usuário
- [ ] 4.2 Nenhum documento acessível via URL pública direta
- [ ] 4.2 Log de acesso: quem acessou/baixou cada documento, com timestamp — *tabela criada (migration 004)*

### 5. Dashboard — Welcome Page → Fase 8
- [x] 5.1 Widget TÂCHES existe no dashboard *(pré-existente)*
- [ ] 5.1 TÂCHES em 3 colunas: Hoje / Amanhã / Prochains Jours (7 dias)
- [ ] 5.1 Pendentes no topo; completadas abaixo, acinzentadas com check
- [ ] 5.1 Clicar no card abre popup/modal com a tarefa completa SEM redirecionar (corrigir bug de navegação)
- [x] 5.2 Widget VOLS DE LA SEMAINE existe *(pré-existente)*
- [ ] 5.2 Vols: somente deals ticketed com PNR confirmado, semana corrente
- [ ] 5.2 Card do voo: origem, destino, data, PNR e companhia

### 6. Menu Tarefas → Fase 8
- [x] 6.1 Visualização em lista, ordenável e filtrável *(pré-existente)*
- [ ] 6.2 Visualização Kanban com 4 funis: Hoje / Amanhã / Essa Semana / Próximas Semanas
- [ ] 6.2 Filtro por categoria transversal a todos os funis
- [ ] 6.2 Limpar filtro volta à visualização completa
- [ ] 6.2 Card kanban simples: apenas nome + categoria

### 7. Menu Disponibilidade — Página B2B → Fase 8
- [ ] 7.1 Integrar/embutir www.expaturtravel.com/b2b no menu Disponibilidade

### 8. Módulo Finance — Interconexão Ticketing ↔ Financeiro
- [x] 8.1 Lógica de invoices, pagamentos e parcelamentos *(pré-existente — premissa: não recriar)*
- [x] 8.2 Invoice emitida em Ticketing reflete no Menu Financeiro *(pré-existente)*
- [x] 8.2 Pagamento no Financeiro atualiza o deal em Ticketing *(pré-existente)*
- [x] 8.3/8.4 deal_id como chave entre invoice, pagamento e dossier *(pré-existente)*
- [ ] 8.2 Pagamento registrado dispara transição de status awaiting_payment → ticketing → Fase 2

### 9. Interconexão entre Módulos → Fases 2-3 (vínculos) e 8 (visões)
- [x] 9.1 Vendedor discriminado em Ticketing via dropdown *(pré-existente)*
- [x] 9.2 Fornecedor vinculado via Cost Calculator *(pré-existente; Fournisseur dinâmico — Fase 1)*
- [ ] 9.2 Visão do fornecedor: dossiers, PNR, rota, data de emissão e valor por fornecedor
- [ ] 9.3 Visão do vendedor: deals associados com valor, comissão e status
- [ ] 9.4 Visão do cliente: reservas/serviços vinculados aos deals (nº dossier, tipo, datas, status, valor)
- [ ] 9.4 Documentos arquivados acessíveis no perfil do cliente → Fase 5
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

### A1. Painel de Gestão de Usuários → Fase 6
- [x] Painel de gestão de usuários existe (roles admin/agent) *(pré-existente)*
- [ ] A1.1 Usuário supremo administration@expaturtravel.com com acesso irrestrito — *função is_supreme() criada (migration 003); falta criar o usuário no auth e a lógica no app*
- [ ] A1.1 Apenas o supremo gerencia acessos; ninguém altera os acessos dele
- [ ] A1.2 Checkboxes por módulo: access_ticketing, access_bookings, access_fornecedores, access_vendedores, access_disponibilidades, access_tarefas, access_clientes, access_financeiro — *colunas criadas (migration 003); falta UI*
- [ ] A1.2 Usuário sem acesso não vê o menu na sidebar
- [ ] A1.2 Permissões aplicadas em tempo real (sem relogin)

### A2. Log Geral de Alterações → Fase 7
- [ ] A2.1 Logar: criação/edição/exclusão de deals, mudanças de status, invoices, pagamentos, uploads, tarefas, perfis, permissões, login/logout, toda escrita via interface
- [ ] A2.2 Estrutura: timestamp UTC, user_id/email, action_type, module, entity_id, field_changed, old_value, new_value, ip_address — *tabela criada (migration 004); falta instrumentação*
- [ ] A2.3 Acesso ao log apenas pelo supremo, com filtros (usuário, módulo, tipo, datas, entity_id)
- [x] A2.3 Log imutável (sem update/delete) — *garantido por RLS na migration 004*

### A3. Timeline de Alterações + Comments no Deal → Fase 2
- [ ] A3.1 Timeline cronológica decrescente de transições de status (anterior, novo, data/hora, usuário), somente leitura — *tabela criada (migration 002); falta registrar + UI*
- [ ] A3.2 Seção de comentários (texto, autor, data/hora), ordem cronológica estilo chat, imutáveis — *tabela criada (migration 002); falta UI*
- [ ] A3.3 Painel direito colapsável na tela de Ticketing, visível apenas em deals ticketed+

### A4. Rota no Card Kanban → Fase 3
- [ ] A4.1 Trecho simples: IATA origem → IATA destino
- [ ] A4.2 Multicidade: trecho a trecho na ordem cadastrada, separados por `;`, truncar em 2 trechos + "…"
- [ ] A4.2 Rota calculada dinamicamente dos trechos do deal (sem campo manual)

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

### A6. Busca e Criação de Cliente em Ticketing → Fase 9
- [x] Busca de clientes na aba Cliente *(pré-existente)*
- [ ] A6.1 Primeira opção fixa e destacada: "+ Créer un nouveau client" antes de qualquer resultado
- [ ] A6.2 Campos de preenchimento ocultos por padrão; aparecem só ao clicar em criar
- [ ] A6.3 Cliente existente carrega em modo somente leitura, com ícone de lápis para habilitar edição

---

## DOC 2 — Anexo 3

### A7. Cost Calculator & P&L — Dropdowns → Fase 1 (parcial) e Fase 2/3
- [ ] A7.1 Dropdown TRECHO alimentado exclusivamente pelos trechos da aba Itinéraire do deal corrente (rota, voo, data), sem entrada manual; vazio quando não há trechos; reflete alterações sem reload
- [x] A7.2 Dropdown FOURNISSEUR alimentado pelo banco de Fornecedores *(pré-existente)* + grupo Programas (Fase 1)
- [x] A7.3 SOUS-TOTAL calculado automaticamente em tempo real *(pré-existente)*

### A8. Base de Logos de Companhias Aéreas → Fase 3
- [x] A8.1 Base separada em workspace.expaturtravel.com/assets/airlines mantida fora do banco *(pré-existente)*
- [x] A8.2 Logos alimentam os PDFs de confirmação e cotações *(pré-existente)*
- [ ] A8.2/A8.3 Logos nos cards do Kanban via IATA code ({IATA_CODE}.png), com placeholder genérico quando indisponível

### A9. Log de Criação de Deals & Atribuição → Fases 2 e 6
- [ ] A9.1 Deal registra: criado por, data/hora UTC, atribuído a, histórico de atribuições, histórico de status (integrado à timeline A3) → Fase 2
- [ ] A9.2 Atribuição automática ao criador na criação do deal → Fase 2
- [ ] A9.3 Reatribuição manual: supremo sempre; usuário com permissão só dos próprios; sem permissão não reatribui → Fase 6
- [ ] A9.3 Toda reatribuição registrada (quem, para quem, quando) — *tabela deal_assignments criada (migration 002)*
- [ ] A9.4 Visibilidade de deals por usuário: Somente meus / Meus + equipe / Todos — aplicada no backend (RLS) — *policies criadas (migration 003); falta UI e hidratação filtrada* → Fase 6
- [ ] A9.5 Painel de usuários com "Pode atribuir deals" (checkbox) e "Visibilidade de deals" (seletor) → Fase 6

---

## DOC 3 — Anexo 4

### A10. Multi-City — "Juntar os Segmentos" → Fase 9
- [ ] A10.1 Checkbox JUNTAR OS SEGMENTOS na aba TICKETS, visível apenas em multi-city
- [x] A10.2 Comportamento desmarcado: reserva/ticket/PNR individuais por trecho *(pré-existente — comportamento atual)*
- [ ] A10.3 Marcado: colapsa para UM conjunto único (reserva, ticket, PNR) vinculado a todos os trechos
- [ ] A10.4/A10.5 PDF de confirmação com layout único: 1 cabeçalho PAX + PNR/TKT únicos + trechos sequenciais
- [ ] A10.6 Flag juntar_segmentos persistida no deal com auto-save, acessível ao gerador de PDF

---

## DOC 4 — R.D. & Suriname (estado documentado do código + requisitos)

### Seções 1-4 e 6 — Regras de automação *(pré-existentes — doc gerado do código)*
- [x] 1.1-1.2 R.D.: linha automática ICF/QR no orçamento + nota de rodapé (1 pax / 2+ pax)
- [x] 1.3-1.4 R.D.: tarefas automáticas (QR code R.D, Volta Cancelada 36h) + aba Documentos QR entrada/saída
- [x] 2.x Suriname: linhas VFS + ICF/QR, nota de rodapé, tarefas Visa/ICF (7 dias, por trecho PBM), cartas Border Control + uploads
- [x] 3.x PBM: Cost Calculator VISA/E.T.A (33 USD × pax × câmbio ao vivo, editável) + Volta Cancelada (R$150 × pax)
- [x] 6.1 Check-in automático por trecho (AF/KL+IAH/CAY 30h · AT/G3/LA 48h · demais 24h, fuso SP)
- [x] 6.2 Volta Cancelada: gatilhos (tarificação/Cost Calc, CMN, partida R.D.) com dedupe, prazo 36h
- [ ] 6.2 ⚠️ Correção: gatilho deve ser qualquer trecho partindo de CMN (código atual: apenas CMN→GRU) → Fase 2

### Seção 5 — Persistência dos documentos → Fase 5
- [ ] 5.2 Upload da aba Documentos enviado ao servidor e vinculado ao booking-ref
- [ ] 5.2 Metadados salvos (nome, passageiro, tipo, chave) — *tabela doc_files criada (migration 005)*
- [ ] 5.2 Ao reabrir dossier, documentos carregados automaticamente (nome + exclusão ativos)
- [ ] 5.2 Exclusão remove o arquivo do servidor além do DOM

---

## Infraestrutura (Fase 0) ✅
- [x] Migration 001 — programs + program_emissions + seed (aplicada 2026-06-12)
- [x] Migration 002 — status/created_by/assigned_to em dossiers, deal_timeline, deal_comments, deal_assignments (aplicada 2026-06-12)
- [x] Migration 003 — permissões em profiles, is_supreme(), RLS de visibilidade (aplicada 2026-06-12)
- [x] Migration 004 — system_log + doc_access_log imutáveis (aplicada 2026-06-12)
- [x] Migration 005 — doc_files + bucket privado documents (aplicada 2026-06-12; bucket validado)
