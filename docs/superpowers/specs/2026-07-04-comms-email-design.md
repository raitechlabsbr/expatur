# Design — Feature COMMS (email de confirmação)

> Porte da feature **COMMS** do `docs/monolito.html` (produção) para a plataforma refatorada.
> Envia ao cliente o email de confirmação de reserva (FR/EN/ES) com os PDFs por passageiro.
> Parte do trabalho de convergência (ver [../../AUDITORIA_CONVERGENCIA.md](../../AUDITORIA_CONVERGENCIA.md)
> §5). Branch: a criar · Data: 2026-07-04.

## 1. Contexto e objetivo

O monólito tem um botão **COMMS** no billet que abre um popup para compor e enviar o email de
confirmação ao cliente: autofill do dossier/billet, cards de voo, linhas por passageiro, modos de
envio (fundido / dividido / um-por-pax), idioma FR/EN/ES, intro editável, bagagem, e-ticket,
horários com timezone e JSON-LD (marcação de voo do Gmail). No envio, gera **um PDF por pax**,
codifica em base64 e **POSTa para um endpoint PHP** (`workspace.expaturtravel.com/finance/send_email.php`,
cookie auth), com **BCC para administration@expaturtravel.com**.

A plataforma refatorada **não tem** a feature (gap confirmado na auditoria, §5: ~28 funções
só-monólito) e **abandonou o backend PHP** (memória: "bridges PHP desativados"; é Supabase-only).

Objetivo: reproduzir o COMMS na plataforma com **fidelidade total à UX/UI de produção**, trocando
apenas o backend de envio: de PHP para uma **Supabase Edge Function + Resend**.

## 2. Decisões (validadas com o usuário)

1. **Backend de envio:** **Supabase Edge Function** (`send-email`) que chama a **Resend API**. Não
   reaproveita o PHP; alinha com "Supabase único backend" e o modelo de auth (JWT).
2. **Provedor:** **Resend** (API HTTP, anexos base64, BCC nativo, inline via `cid:`).
3. **Escopo:** **port fiel completo** do popup (todas as ~28 funções e o fluxo inteiro), como foi
   feito na feature Vols. Nada é cortado.
4. **From:** `administration@expaturtravel.com` (mesmo endereço do rodapé/BCC de produção).
5. **Auditoria:** cada envio bem-sucedido grava um evento no `system_log` (fase 4).

## 3. Arquitetura e fluxo

```
[Billet] botão COMMS
   └─> openCommsPopup()  → _commsAutofill() (lê dossier + billet)
        └─> agente edita (idioma, intro, bagagem, modo de envio)
             └─> Envoyer  → _commsSend()
                  1. gera PDFs por pax (generateBilletPDFs → _lastBilletPDFBlobs)   [já existe]
                  2. base64 dos PDFs + imagens inline (logos)
                  3. monta HTML (_commsBuildEmailHTML) por pax/fundido/dividido
                  4. p/ cada envio: supabase.functions.invoke('send-email', { body })
                                     (JWT do agente anexado automaticamente)
                       └─> Edge Function → Resend API → email ao cliente (+ BCC admin)
                  5. sucesso → window.__logEvent('EMAIL_CONFIRMATION', 'comms', {...})
```

**Único componente novo de backend:** a Edge Function. Todo o resto é código cliente portado.

## 4. Edge Function `supabase/functions/send-email/`

Primeira Edge Function do projeto (cria a convenção `supabase/functions/<nome>/index.ts`, Deno).

- **Entrada** (JSON): `{ to, bcc, subject, html, attachments:[{filename, mimeType, contentBase64}],
  inlineImages:[{cid, mimeType, contentBase64}], ref }`.
- **Auth:** `verify_jwt` habilitado — só chamadas autenticadas (agentes logados) enviam. O cliente
  usa `supabase.functions.invoke`, que anexa o `Authorization: Bearer <access_token>` da sessão.
- **Envio:** traduz o payload para a Resend API (`POST https://api.resend.com/emails`):
  `from` = `FROM_EMAIL` (env, default `administration@expaturtravel.com`), `to`, `bcc`, `subject`,
  `html`, `attachments` (base64 direto), imagens inline referenciadas por `cid:` no HTML.
- **Secrets/env:** `RESEND_API_KEY` (obrigatório), `FROM_EMAIL` (opcional). Via
  `supabase secrets set`.
- **Saída:** `{ ok:true, id }` ou `{ ok:false, error }` (status 200 sempre, erro no corpo — o
  cliente já trata `res.ok`).
- **CORS:** responder ao preflight `OPTIONS` e ecoar os headers necessários (chamada do browser).

## 5. Módulo cliente `src/js/comms.js`

Port fiel das funções COMMS do monólito (inventário do §5 da auditoria):
`openCommsPopup`/`closeCommsPopup`, `_commsAutofill`, `_commsBuildEmailHTML`, `_commsFlightCardHTML`,
`_commsSend`, `_commsBuildJsonLd`, baggage sync (`_commsBagSync`/`_commsCabinSync`/`_commsHoldSync`
/unit toggles), `_commsFmtEtkt`, timezone helpers (`_commsIso`/`_commsTzSuffix`/`_commsIsoTz`),
`_commsOnSendModeChange`/`_commsBuildDivideFields`, `_commsToggleIntro`, `_commsSyncPnrToTicketing`,
`_commsEsc`, e o helper `_blobToBase64` (não existe na plataforma — portar junto).

**Única divergência vs monólito** (o "port não-cego"): em `_commsSend`, trocar o
`fetch('…/send_email.php', {credentials:'include'})` por
`supabase.functions.invoke('send-email', { body: payload })`, tratando `data.ok`/`error`. Mantém
merge/divide/por-pax, BCC admin, geração de PDF e toda a lógica de idioma inalterados.

Importado em `src/js/main.js` (depende de `supabase-client.js`, `app.js` para
`generateBilletPDFs`/`buildPreview`/`_lastBilletPDFBlobs`, e de `system-log.js` para `__logEvent`).

**Nota de convergência (backlog conhecido da auditoria §4.3):** `blSyncPnr` e `pushLeg` do billet
têm dependências do COMMS (campo `cm-ref`, `depName`/`arrName` do template). Ao portar o COMMS,
reavaliar se essas pontas passam a fazer sentido — **fora do escopo desta feature**, mas anotado.

## 6. UI (preservar UX/UI)

- **Botão COMMS** no bloco de ações do billet, junto de `#bl-emettre-btn` (mesmo estilo
  `bl-action-navy` do monólito), `onclick="openCommsPopup()"`.
- **Popup** `#comms-popup`: portar o HTML do monólito (campos `cm-*`: name, email, ref, issued,
  intro, cabin/hold bag, toggles FR/EN/ES `cm-lang-btn`, checkboxes `cm-merge`/`cm-divide`, área de
  cards de voo, botão `#cm-send-btn`, `#cm-status`). Inserir em `index.html`.
- Estilo herdado do design system atual (billet/popup existentes).

## 7. i18n FR/EN/ES

As strings `T('cm_*')` (subject, help, labels do popup e do email) portadas para o sistema de
tradução usado pelo monólito no COMMS. O idioma do email segue o toggle do popup
(`window._pdfLang`), e o preview/PDF é re-renderizado nesse idioma antes de gerar (fidelidade ao
comportamento do monólito: evita nomes de aeroporto no idioma errado no PDF).

## 8. Segurança & auditoria

- Edge Function com `verify_jwt` → só agentes autenticados enviam.
- `RESEND_API_KEY` nunca vai ao cliente (fica como secret da function).
- Cada envio OK → `window.__logEvent('EMAIL_CONFIRMATION', 'comms', { entity_id: ref, new_value:
  destinatário, field_changed: 'lang='+idioma+' pax='+nPax })` (formato do `logEvent` da fase 4).
  Falhas não gravam (ou gravam como erro — decidir no plano; default: só sucesso).

## 9. Pré-requisitos operacionais (usuário/ops — fora do código)

1. Verificar o domínio `expaturtravel.com` no Resend (registros SPF/DKIM no DNS).
2. Gerar a API key do Resend.
3. `supabase secrets set RESEND_API_KEY=...` (e opcional `FROM_EMAIL=...`).
4. `supabase functions deploy send-email`.
Sem isso a function não envia — é o análogo do "aplicar a migration" da feature Vols.

## 10. Critérios de teste

1. `npm run build` verde.
2. Deploy da Edge Function; `supabase functions invoke` de fumaça responde `{ok}`.
3. Runtime: no billet, abrir COMMS, autofill correto (pax, voos, ref, datas).
4. Enviar **single** (1 pax) → cliente recebe email FR com o PDF anexado; BCC admin recebe.
5. Enviar **fundido** (>1 pax) → 1 email com todos os pax + todos os PDFs; sufixo bagagem `/pers`
   (FR/ES) ou `/pax` (EN) só no fundido.
6. Enviar **dividido/por-pax** → 1 email por pax, só o PDF daquele pax, sem sufixo.
7. Trocar idioma EN/ES → email e PDF saem no idioma certo.
8. Cada envio OK aparece no `system_log`.
9. Sessão não autenticada → a function recusa (JWT).

## 11. Arquivos e integração

- `supabase/functions/send-email/index.ts` — Edge Function (Deno) + Resend.
- `src/js/comms.js` — módulo do port (popup, build, send via `functions.invoke`, auditoria).
- `index.html` — botão COMMS no billet + `#comms-popup`.
- `src/js/main.js` — importar `comms.js`.
- `supabase/functions/README.md` (ou nota no README de migrations) — como fazer deploy + secrets.

## 12. Fora de escopo

- Convergência de `blSyncPnr`/`pushLeg` (dependências COMMS) — anotado no §5, feature própria.
- Templates de email para outros fins (só a confirmação de reserva entra aqui).
- Fila/retry de envio assíncrono — envio é síncrono no clique, como na produção.
- Gestão de bounce/status de entrega do Resend (webhooks) — fora de escopo.
