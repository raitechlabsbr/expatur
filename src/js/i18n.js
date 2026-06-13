/**
 * i18n.js — Sistema multi-idioma Expatur (FR ↔ PT-BR)
 *
 * Abordagem: DOM text replacement com MutationObserver
 * - Substitui texto nos nós do DOM sem modificar o app.js
 * - Cobre conteúdo estático (HTML) e dinâmico (gerado por JS)
 * - Persiste a escolha em localStorage
 */

// ── Língua activa ─────────────────────────────────────────────────────────────
export let currentLang = localStorage.getItem('expatur_lang') || 'fr';

// ── Dicionário de traduções FR → PT-BR ────────────────────────────────────────
const T = {
  // ── Sidebar ────────────────────────────────────────────────────────────────
  'Accueil':                    'Início',
  'Ticketing':                  'Emissão',
  'Bookings':                   'Reservas',
  'Fornecedores':               'Fornecedores',
  'Vendedores':                 'Vendedores',
  'Disponibilidades':           'Disponibilidades',
  'Tarefas':                    'Tarefas',
  'Clientes':                   'Clientes',
  'Financeiro':                 'Financeiro',
  'Main':                       'Menu',
  'Admin':                      'Admin',
  'Gestion utilisateurs':       'Gestão de utilizadores',
  // ── Permissões / atribuição (Fase 6 — A1/A9) ─────────────────────────────
  'Assignation':                'Atribuição',
  'Modules':                    'Módulos',
  'Visibilité':                 'Visibilidade',
  'Seuls les miens':            'Somente os meus',
  'Moi + équipe':               'Eu + equipe',
  'Tous':                       'Todos',
  'Lecture seule — seul l’utilisateur suprême gère les accès.': 'Somente leitura — apenas o utilizador supremo gere os acessos.',
  'Déconnexion':                'Desconectar',
  'Expatur Backoffice · v2026': 'Expatur Backoffice · v2026',
  'Bienvenu(e)':                'Bem-vindo(a)',

  // ── Ticketing tabs ─────────────────────────────────────────────────────────
  'Itinéraire':                 'Itinerário',
  'Client':                     'Cliente',
  'Tarification':               'Tarifação',
  'Paiement':                   'Pagamento',
  'Tickets':                    'Bilhetes',
  'Documents':                  'Documentos',
  'Tâches':                     'Tarefas',
  'Finance':                    'Finanças',

  // ── Status canônico do deal (Fase 2/3 — spec 1.1/3.1) ─────────────────────
  'Quote':                      'Cotação',
  'En attente de paiement':     'Aguardando Pagamento',
  'En émission':                'Em Emissão',
  'Émis':                       'Emitido',
  'Forcer le statut':           'Forçar o status',
  'Aucun dossier':              'Nenhum dossiê',
  'Timeline & Commentaires':    'Linha do tempo & Comentários',
  'Timeline du statut':         'Linha do tempo do status',
  'Commentaires':               'Comentários',
  'Envoyer':                    'Enviar',
  'Aucune transition enregistrée.': 'Nenhuma transição registrada.',
  'Aucun commentaire.':         'Nenhum comentário.',

  // ── Auto-save (Fase 4 — spec 2.1) ──────────────────────────────────────────
  'Enregistrement…':            'Salvando…',
  'Enregistré':                 'Salvo',
  'Erreur d’enregistrement':    'Erro ao salvar',

  // ── Itinéraire / Trip type ─────────────────────────────────────────────────
  'Aller simple':               'Só ida',
  'Aller-Retour':               'Ida e volta',
  'Aller-retour':               'Ida e volta',
  'Multi-villes':               'Multi-destinos',
  'Multi-destinations':         'Multi-destinos',
  'VOL ALLER':                  'VOO IDA',
  'Vol Aller':                  'Voo Ida',
  'VOL RETOUR':                 'VOO VOLTA',
  'Vol Retour':                 'Voo Volta',
  'Départ (IATA)':              'Partida (IATA)',
  'Arrivée (IATA)':             'Chegada (IATA)',
  'Date de départ':             'Data de partida',
  'Date de retour':             'Data de retorno',
  'Rechercher':                 'Pesquisar',
  'Confirmer l\'itinéraire':    'Confirmar itinerário',
  'Résultats en cache':         'Resultados em cache',
  'Aucun vol trouvé':           'Nenhum voo encontrado',
  '+ Ajouter un vol':           '+ Adicionar voo',

  // ── Tarification ──────────────────────────────────────────────────────────
  'Tarification':               'Tarifação',
  'Adultes (ADT)':              'Adultos (ADT)',
  'Enfants (CHD)':              'Crianças (CHD)',
  'Bébés (INF)':                'Bebés (INF)',
  'Bagages':                    'Bagagens',
  'kg / pers.':                 'kg / pess.',
  'Classe de voyage':           'Classe de viagem',
  'Devise':                     'Moeda',
  'Note tarifaire (facultatif)':'Nota tarifária (opcional)',
  'Émis le':                    'Emitido em',
  'Valable jusqu\'au':          'Válido até',
  'Prix / Adulte (+12 ans)':    'Preço / Adulto (+12 anos)',
  'Prix / Enfant (-12 ans)':    'Preço / Criança (-12 anos)',
  'Prix / Bébé (-2 ans)':       'Preço / Bebé (-2 anos)',
  'Remise (facultatif)':        'Desconto (opcional)',
  'Nom de l\'offre / promotion':'Nome da oferta / promoção',
  'Ligne libre':                'Linha livre',
  'Lignes personnalisées':      'Linhas personalizadas',
  'VALEUR DE LA FACTURE DIFFÉRENT': 'VALOR DA FATURA DIFERENTE',
  'Montant de la facture':      'Valor da fatura',
  '+ Ajouter une ligne':        '+ Adicionar linha',
  'Générer le devis':           'Gerar orçamento',
  'Télécharger PDF':            'Descarregar PDF',
  'Cost Calculator & P&L':      'Calculadora de Custos & P&L',
  'Coût total':                 'Custo total',
  '+ Ajouter une ligne':        '+ Adicionar linha',

  // ── Client ─────────────────────────────────────────────────────────────────
  'Informations client':        'Informações do cliente',
  'INFORMATIONS CLIENT':        'INFORMAÇÕES DO CLIENTE',
  'PESQUISAR NA BASE DE CLIENTES': 'PESQUISAR NA BASE DE CLIENTES',
  'Nome, email ou telefone...': 'Nome, email ou telefone...',
  'LIMPAR':                     'LIMPAR',
  'Identité':                   'Identidade',
  'IDENTITÉ':                   'IDENTIDADE',
  'Civilité':                   'Tratamento',
  'CIVILITÉ':                   'TRATAMENTO',
  'Prénom':                     'Nome próprio',
  'PRÉNOM':                     'NOME',
  'Nom':                        'Apelido',
  'NOM':                        'APELIDO',
  'Date de naissance':          'Data de nascimento',
  'Nationalité':                'Nacionalidade',
  'N° Passeport':               'Nº Passaporte',
  'Expiration passeport':       'Validade passaporte',
  'Contact & Adresse':          'Contacto & Endereço',
  'CONTACT & ADRESSE':          'CONTACTO & ENDEREÇO',
  'Email':                      'E-mail',
  'Téléphone':                  'Telefone',
  'WhatsApp':                   'WhatsApp',
  'Adresse':                    'Endereço',
  'Code postal':                'Código postal',
  'Ville':                      'Cidade',
  'Pays':                       'País',
  'Notes client':               'Notas do cliente',
  'NOTES CLIENT':               'NOTAS DO CLIENTE',
  'SCANNER LE PASSEPORT':       'DIGITALIZAR PASSAPORTE',
  'SAVE CHANGES':               'GUARDAR ALTERAÇÕES',

  // ── Paiement ───────────────────────────────────────────────────────────────
  'Virement / PIX / Cash':      'Transferência / PIX / Dinheiro',
  'Carte Stripe':               'Cartão Stripe',
  'Montant total du devis':     'Valor total do orçamento',
  'Mode de paiement':           'Modo de pagamento',
  'Mode':                       'Modo',
  'Date d\'encaissement':       'Data de recebimento',
  'Virement bancaire':          'Transferência bancária',
  'Informations client':        'Informações do cliente',
  'Nom complet':                'Nome completo',
  'Articles de la facture':     'Artigos da fatura',
  'Description':                'Descrição',
  'Prix unit.':                 'Preço unit.',
  'Total':                      'Total',
  'Mémo / Note (optionnel)':    'Memo / Nota (opcional)',
  'Conditions de paiement':     'Condições de pagamento',
  'Délai de règlement':         'Prazo de pagamento',
  'Date d\'échéance':           'Data de vencimento',
  'Paiement en plusieurs versements': 'Pagamento em prestações',
  'Nombre de factures':         'Número de faturas',
  'Authentification':           'Autenticação',
  'Mot de passe':               'Palavra-passe',
  'ENVOYER LA FACTURE PAR EMAIL AU CLIENT': 'ENVIAR FATURA POR EMAIL AO CLIENTE',
  'FERMER':                     'FECHAR',
  'CRÉER ET ENVOYER LA FACTURE':'CRIAR E ENVIAR FATURA',
  'VOIR LA FACTURE →':          'VER A FATURA →',
  '⬇ Télécharger PDF facture':  '⬇ Descarregar PDF fatura',
  'ÉMETTRE LE BILLET →':        'EMITIR BILHETE →',

  // ── Tickets / Billet ───────────────────────────────────────────────────────
  'Passagers':                  'Passageiros',
  'PASSAGERS':                  'PASSAGEIROS',
  'Scan Passeport':             'Digitalizar Passaporte',
  'SCAN PASSEPORT':             'DIGITALIZAR PASSAPORTE',
  'Itinéraire':                 'Itinerário',
  'ITINÉRAIRE':                 'ITINERÁRIO',
  'PNR (TOUS PASSAGERS)':       'PNR (TODOS OS PASSAGEIROS)',
  'Propagation automatique à tous les passagers': 'Propagação automática a todos os passageiros',
  'Franchise bagages':          'Franquia de bagagem',
  'FRANCHISE BAGAGES':          'FRANQUIA DE BAGAGEM',
  'Nom de famille':             'Apelido',
  'NOM DE FAMILLE':             'APELIDO',
  'Prénom':                     'Nome',
  'PRÉNOM':                     'NOME',
  'Date de naiss.':             'Data nasc.',
  'DATE DE NAISS.':             'DATA NASC.',
  'N° E-TICKET':                'Nº E-TICKET',
  'Réf. de réservation':        'Ref. de reserva',
  'RÉF. DE RÉSERVATION':        'REF. DE RESERVA',
  'Documents passagers':        'Documentos dos passageiros',
  'DOCUMENTS PASSAGERS':        'DOCUMENTOS DOS PASSAGEIROS',
  'Observations par passager':  'Observações por passageiro',
  'OBSERVATIONS PAR PASSAGER':  'OBSERVAÇÕES POR PASSAGEIRO',
  'Visible sur le PDF de confirmation de ce passager': 'Visível no PDF de confirmação deste passageiro',
  'VISIBLE SUR LE PDF DE CONFIRMATION DE CE PASSAGER': 'VISÍVEL NO PDF DE CONFIRMAÇÃO DESTE PASSAGEIRO',
  '💾 Sauvegarder le deal':     '💾 Guardar negócio',
  'Sauvegarder le deal':        'Guardar negócio',
  'SAUVEGARDER LE DEAL':        'GUARDAR NEGÓCIO',
  'Sauvegarder':                'Guardar',
  'SAUVEGARDER':                'GUARDAR',
  'Générer PDF confirmations':  'Gerar PDF confirmações',
  'GÉNÉRER PDF CONFIRMATIONS':  'GERAR PDF CONFIRMAÇÕES',
  'Émettre':                    'Emitir',
  'ÉMETTRE':                    'EMITIR',
  'Glissez un ou plusieurs passeports ici': 'Arraste um ou vários passaportes aqui',
  'ou cliquez pour choisir':    'ou clique para escolher',

  // ── Documents ──────────────────────────────────────────────────────────────
  'TÉLÉCHARGER CONFIRMATION':   'DESCARREGAR CONFIRMAÇÃO',
  '✉ ENVOYER PAR EMAIL':        '✉ ENVIAR POR EMAIL',
  'PAIEMENT STRIPE':            'PAGAMENTO STRIPE',
  'Facture payée':              'Fatura paga',
  'DOSSIER COMPLET':            'DOSSIER COMPLETO',
  'Créer dossier complet PDF':  'Criar dossier completo PDF',
  '📎 Créer dossier complet PDF': '📎 Criar dossier completo PDF',

  // ── Tâches ─────────────────────────────────────────────────────────────────
  'IMPORTER EXCEL':             'IMPORTAR EXCEL',
  'TOUT EFFACER':               'APAGAR TUDO',
  'CHECK-IN':                   'CHECK-IN',
  'NOTAS FISCAIS':              'NOTAS FISCAIS',
  'AJOUTER UNE TÂCHE MANUELLEMENT': 'ADICIONAR TAREFA MANUALMENTE',
  'DESCRIPTION':                'DESCRIÇÃO',
  'CATÉGORIE':                  'CATEGORIA',
  'ÉCHÉANCE (OPTIONNEL)':       'PRAZO (OPCIONAL)',
  '+ AJOUTER':                  '+ ADICIONAR',
  'Nouvelle tâche...':          'Nova tarefa...',
  '— Choisir —':                '— Escolher —',

  // ── Financeiro ─────────────────────────────────────────────────────────────
  'VUE D\'ENSEMBLE':            'VISÃO GERAL',
  'RECEBIMENTOS':               'RECEBIMENTOS',
  'DESPESAS':                   'DESPESAS',
  'CRÉDITOS':                   'CRÉDITOS',
  'FORNECEDORES':               'FORNECEDORES',
  'AUDITORIA':                  'AUDITORIA',
  'SEM PAGAMENTO REGISTADO':    'SEM PAGAMENTO REGISTADO',
  'Nenhum pagamento ou fatura gerada para este dossier.': 'Nenhum pagamento ou fatura gerada para este dossier.',
  'RESUMO FINANCEIRO DO DOSSIER': 'RESUMO FINANCEIRO DO DOSSIER',
  'TOTAL VENDAS':               'TOTAL VENDAS',
  'TOTAL CUSTO':                'TOTAL CUSTO',
  'TOTAL RECEBIDO':             'TOTAL RECEBIDO',
  'TOTAL PAGO':                 'TOTAL PAGO',
  'SALDO DEVEDOR CLIENT':       'SALDO DEVEDOR CLIENTE',
  'SALDO DEVEDOR FORN.':        'SALDO DEVEDOR FORN.',
  'MARGEM':                     'MARGEM',
  'Margem bruta':               'Margem bruta',
  '% margem sobre venda':       '% margem sobre venda',
  'AÇÕES RÁPIDAS':              'AÇÕES RÁPIDAS',
  '+ REGISTRAR PAGAMENTO RECEBIDO': '+ REGISTRAR PAGAMENTO RECEBIDO',
  '+ REGISTRAR PAGAMENTO A FORNECEDOR': '+ REGISTRAR PAGAMENTO A FORNECEDOR',
  '+ CRIAR CRÉDITO / AVOIR':    '+ CRIAR CRÉDITO / AVOIR',
  '↺ SINCRONIZAR DA TARIFICAÇÃO': '↺ SINCRONIZAR DA TARIFAÇÃO',

  // ── Welcome / Accueil ──────────────────────────────────────────────────────
  '+ Nouveau dossier':          '+ Novo dossier',
  'Tâches':                     'Tarefas',
  'Vols de la semaine':         'Voos da semana',
  'AUJOURD\'HUI':               'HOJE',
  'DEMAIN':                     'AMANHÃ',
  'PROCHAINS JOURS':            'PRÓXIMOS DIAS',
  'HIER':                       'ONTEM',

  // ── Login ──────────────────────────────────────────────────────────────────
  'Backoffice':                 'Backoffice',
  'Email':                      'E-mail',
  'Mot de passe':               'Palavra-passe',
  'Rester connecté pendant 3 heures': 'Manter ligado durante 3 horas',
  'Connexion sécurisée →':      'Ligação segura →',
  'Connexion…':                 'A ligar…',
  'Veuillez entrer votre email et votre mot de passe.': 'Por favor insira o seu email e palavra-passe.',

  // ── Common buttons & labels ────────────────────────────────────────────────
  'Annuler':                    'Cancelar',
  'Fermer':                     'Fechar',
  'Sauvegarder':                'Guardar',
  'Enregistrer':                'Registar',
  'Confirmer':                  'Confirmar',
  'Supprimer':                  'Eliminar',
  'Modifier':                   'Editar',
  'Ajouter':                    'Adicionar',
  'Retour':                     'Voltar',
  'Suivant':                    'Seguinte',
  'Ouvrir':                     'Abrir',
  'Fermer':                     'Fechar',
  'Importer':                   'Importar',
  'Exporter':                   'Exportar',
  'Rechercher':                 'Pesquisar',
  'Filtrer':                    'Filtrar',

  // ── Economy/class labels ───────────────────────────────────────────────────
  'Economy':                    'Económica',
  'Premium Economy':            'Premium Económica',
  'Business':                   'Executiva',
  'First / Première':           'Primeira Classe',

  // ── Currency ───────────────────────────────────────────────────────────────
  'Euro (€)':                   'Euro (€)',
  'Real (R$)':                  'Real (R$)',
  'Dollar ($)':                 'Dólar ($)',
  'Dirham (MAD)':               'Dirham (MAD)',
  'Peso dominicain (DOP)':      'Peso dominicano (DOP)',
  'Livre Sterling (£)':         'Libra Esterlina (£)',
};

// ── Nós de texto a ignorar ────────────────────────────────────────────────────
const SKIP_TAGS = new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','CODE','PRE','SVG']);

// ── Traduzir um único nó de texto ─────────────────────────────────────────────
function _translateTextNode(node) {
  if (!node || node.nodeType !== 3) return;
  const parent = node.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return;
  // Só traduzir texto "simples" (sem mistura com elementos filhos complexos)
  const text = node.textContent.trim();
  if (!text || text.length < 2) return;

  if (currentLang === 'pt' && T[text]) {
    if (node.textContent.trim() !== T[text]) {
      node._origText = node._origText || node.textContent;
      node.textContent = node.textContent.replace(text, T[text]);
    }
  } else if (currentLang === 'fr' && node._origText) {
    node.textContent = node._origText;
    node._origText = null;
  }
}

// ── Traduzir um elemento e os seus filhos ─────────────────────────────────────
function _translateElement(el) {
  if (!el || SKIP_TAGS.has(el.tagName)) return;

  // Traduzir placeholder
  if (el.placeholder && T[el.placeholder]) {
    if (!el._origPlaceholder) el._origPlaceholder = el.placeholder;
    el.placeholder = currentLang === 'pt' ? T[el.placeholder] : el._origPlaceholder;
  }

  // Traduzir title
  if (el.title && T[el.title]) {
    if (!el._origTitle) el._origTitle = el.title;
    el.title = currentLang === 'pt' ? T[el.title] : el._origTitle;
  }

  // Percorrer nós de texto directos
  el.childNodes.forEach(function(child) {
    if (child.nodeType === 3) {
      _translateTextNode(child);
    }
  });
}

// ── Traduzir todo o documento ─────────────────────────────────────────────────
function _translateAll() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(_translateTextNode);

  // Placeholders e titles
  document.querySelectorAll('[placeholder],[title]').forEach(_translateElement);
}

// ── Restaurar texto original (FR) sem recarregar a página ────────────────────
function _restoreAll() {
  // 1. Restaurar todos os nós de texto que têm _origText guardado
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        return node._origText ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function(node) {
    node.textContent = node._origText;
    node._origText = null;
  });

  // 2. Restaurar placeholders e titles
  document.querySelectorAll('[placeholder],[title]').forEach(function(el) {
    if (el._origPlaceholder) {
      el.placeholder = el._origPlaceholder;
      el._origPlaceholder = null;
    }
    if (el._origTitle) {
      el.title = el._origTitle;
      el._origTitle = null;
    }
  });
}

// ── MutationObserver para conteúdo dinâmico ───────────────────────────────────
let _observer = null;
let _pendingTranslation = null;

function _startObserver() {
  if (_observer) return;
  _observer = new MutationObserver(function(mutations) {
    if (currentLang === 'fr') return; // sem trabalho em FR
    clearTimeout(_pendingTranslation);
    _pendingTranslation = setTimeout(function() {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            // Elemento adicionado — traduzir os seus nós de texto
            const walker = document.createTreeWalker(
              node, NodeFilter.SHOW_TEXT, null);
            const ns = [];
            while (walker.nextNode()) ns.push(walker.currentNode);
            ns.forEach(_translateTextNode);
          } else if (node.nodeType === 3) {
            _translateTextNode(node);
          }
        });
      });
    }, 80); // pequeno debounce para agrupar mudanças de DOM
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

// ── API pública ───────────────────────────────────────────────────────────────
export function setLanguage(lang) {
  if (lang !== 'fr' && lang !== 'pt') return;
  currentLang = lang;
  window.currentLang = lang;   // lido por deal-status.js (labels canônicos)
  localStorage.setItem('expatur_lang', lang);

  // Actualizar botões do selector
  document.querySelectorAll('.lang-selector-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  if (lang === 'pt') {
    _translateAll();
    _startObserver();
  } else {
    // FR: reverter traduções no DOM sem recarregar a página
    // (location.reload() reiniciava a autenticação → logout indesejado)
    _restoreAll();
    // Parar o observer — já não há nada para traduzir
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
  }
}

// Expor globalmente para os onclick no HTML
window.setLanguage = setLanguage;
window.currentLang = currentLang;

// ── Inicialização ─────────────────────────────────────────────────────────────
export function initI18n() {
  // Aplicar língua guardada ao carregar
  if (currentLang === 'pt') {
    // Aguardar o DOM estar pronto antes de traduzir
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        _translateAll();
        _startObserver();
      });
    } else {
      // Pequeno delay para conteúdo dinâmico carregar
      setTimeout(function() {
        _translateAll();
        _startObserver();
      }, 300);
    }
  }
}
