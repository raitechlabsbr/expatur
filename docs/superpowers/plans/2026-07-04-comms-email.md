# Plano de Implementação — Feature COMMS (email de confirmação)

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`).

**Objetivo:** Portar a feature COMMS (email de confirmação FR/EN/ES com PDFs por pax) do
`docs/monolito.html` para a plataforma, trocando o backend de envio de PHP para uma **Supabase Edge
Function + Resend**.

**Arquitetura:** O código do popup/geração de email é **port fiel** (transcrição verbatim de
blocos conhecidos do monólito para `src/js/comms.js`), com UMA divergência cirúrgica: o envio, que
no monólito posta num PHP, passa a chamar `supabase.functions.invoke('send-email')`. A Edge Function
`send-email` (novo e único backend) recebe o payload e envia via Resend API. Cada envio OK é
auditado no `system_log`.

**Tech Stack:** Vanilla JS (ES modules, bridges `window.*`), Vite (`npm run build`), Supabase
(`@supabase/supabase-js` já instalado; cliente em `src/js/supabase-client.js`), Supabase Edge
Functions (Deno/TypeScript), Resend API.

## Global Constraints

- **Sem test runner.** Verificação = `npm run build` verde + checagem runtime no browser + smoke da
  Edge Function via `supabase functions invoke`. Não inventar vitest/jest.
- **Port fiel completo** — reproduzir o popup e o email do monólito sem cortes (decisão do usuário).
- **Fonte de verdade do código portado:** `docs/monolito.html`, nos intervalos de linha citados em
  cada task. Portar **verbatim**, mudando só o que a task manda explicitamente.
- **Única divergência de backend:** o envio usa `supabase.functions.invoke('send-email', {body})`
  (não o PHP `workspace.expaturtravel.com/finance/send_email.php`).
- **From:** `administration@expaturtravel.com` (env `FROM_EMAIL` da function, com esse default).
- **BCC:** sempre `administration@expaturtravel.com`.
- **Auth da function:** `verify_jwt` — só chamadas autenticadas enviam.
- **Auditoria:** cada envio OK → `window.__logEvent('EMAIL_CONFIRMATION', 'comms', {...})`.
- **i18n isolado:** o COMMS carrega seu próprio dicionário `cm_*` FR/EN/ES + `T`/`window._pdfLang`
  locais em `comms.js` (NÃO usar o `T` objeto de `src/js/i18n.js` — mecanismos incompatíveis).
- **UI em francês** (rótulos idênticos ao monólito). Comentários de código em português.
- **Não regenerar `app.js`** com extract.py (não se aplica aqui — COMMS é módulo novo).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `supabase/functions/send-email/index.ts` | Edge Function (Deno) → Resend | Criar |
| `supabase/functions/README.md` | Como fazer deploy + secrets | Criar |
| `src/js/comms.js` | Módulo: i18n local, popup, autofill, build do email, send via Edge Function, auditoria | Criar |
| `index.html` | Botão COMMS no billet + `#comms-popup` | Modificar |
| `src/js/main.js` | Importar `comms.js` | Modificar |

---

## Task 1: Edge Function `send-email` (Resend)

Primeira Edge Function do projeto. Deliverable independente: uma function que, dado o payload,
envia via Resend e responde `{ok}`. Testável por `supabase functions invoke` (smoke) sem tocar no
front-end.

**Files:**
- Create: `supabase/functions/send-email/index.ts`
- Create: `supabase/functions/README.md`

**Interfaces:**
- Consumes: secret `RESEND_API_KEY`, env opcional `FROM_EMAIL`.
- Produces (contrato consumido pela Task 3): `POST` com JSON
  `{ to:string, bcc?:string, subject:string, html:string,
     attachments?:[{filename,mimeType,contentBase64}],
     inlineImages?:[{cid,mimeType,contentBase64}], ref?:string }`
  → resposta JSON `{ ok:true, id }` ou `{ ok:false, error }` (HTTP 200).

- [ ] **Step 1: Escrever a Edge Function**

Create `supabase/functions/send-email/index.ts`:

```ts
// Edge Function: send-email — envia o email de confirmação (COMMS) via Resend.
// Recebe HTML + anexos PDF (base64) + imagens inline (cid). verify_jwt ativo:
// só agentes autenticados chamam. Secret: RESEND_API_KEY. From: FROM_EMAIL.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "administration@expaturtravel.com";
  if (!RESEND_API_KEY) return json({ ok: false, error: "RESEND_API_KEY ausente" });

  let p: any;
  try { p = await req.json(); } catch { return json({ ok: false, error: "JSON inválido" }); }
  if (!p || !p.to || !p.subject || !p.html) {
    return json({ ok: false, error: "campos obrigatórios: to, subject, html" });
  }

  // Resend: anexos base64 diretos; imagens inline viram anexos com content_id (cid:).
  const attachments = [
    ...(Array.isArray(p.attachments) ? p.attachments : []).map((a: any) => ({
      filename: a.filename,
      content: a.contentBase64,
    })),
    ...(Array.isArray(p.inlineImages) ? p.inlineImages : []).map((im: any) => ({
      filename: im.cid,
      content: im.contentBase64,
      content_id: im.cid,
    })),
  ];

  const payload: Record<string, unknown> = {
    from: FROM_EMAIL,
    to: [p.to],
    subject: p.subject,
    html: p.html,
  };
  if (p.bcc) payload.bcc = [p.bcc];
  if (attachments.length) payload.attachments = attachments;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: data?.message || `HTTP ${r.status}` });
    return json({ ok: true, id: data?.id });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) });
  }
});
```

- [ ] **Step 2: Escrever o README de deploy**

Create `supabase/functions/README.md`:

```markdown
# Edge Functions

## send-email (COMMS)
Envia o email de confirmação de reserva via Resend.

### Pré-requisitos (uma vez)
1. Verificar o domínio `expaturtravel.com` no Resend (registros SPF/DKIM no DNS).
2. Gerar a API key do Resend.
3. Definir os secrets no projeto Supabase:
   ```
   supabase secrets set RESEND_API_KEY=re_xxx
   supabase secrets set FROM_EMAIL=administration@expaturtravel.com   # opcional (é o default)
   ```

### Deploy
```
supabase functions deploy send-email
```
`verify_jwt` fica ativo por padrão — só chamadas autenticadas (com o JWT do agente) enviam.

### Smoke test
```
supabase functions invoke send-email --no-verify-jwt \
  --body '{"to":"seu@email.com","subject":"Teste COMMS","html":"<p>ok</p>"}'
```
(Remova `--no-verify-jwt` para testar com o JWT real.)
```

- [ ] **Step 3: Verificação estática (não há build JS aqui)**

O `index.ts` é Deno — não entra no `vite build`. Verificação estática:

Run: `grep -n "api.resend.com/emails\|verify_jwt\|FROM_EMAIL\|content_id" supabase/functions/send-email/index.ts supabase/functions/README.md`
Expected: confirma o endpoint do Resend, o default do From, `content_id` para inline, e a nota de `verify_jwt` no README.

- [ ] **Step 4: Deploy + secrets (ação do usuário)**

Pausa para o usuário: verificar domínio no Resend, `supabase secrets set RESEND_API_KEY=...`, e
`supabase functions deploy send-email`. Rodar o smoke test do README. Sem isso, a Task 3 compila
mas não envia de verdade. (Análogo ao "aplicar a migration" da feature Vols.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-email/index.ts supabase/functions/README.md
git commit -m "feat(comms): Edge Function send-email (Resend) + docs de deploy"
```

---

## Task 2: `comms.js` — popup, i18n local, autofill e build do email (sem envio)

Port fiel de todo o COMMS **exceto** o `_commsSend`, mais o popup/botão na UI. Deliverable: clicar
**COMMS** no billet abre o popup, o autofill preenche pax/voos/ref/bagagem, e o toggle FR/EN/ES
re-renderiza. O botão **Envoyer** ainda não envia (a função `_commsSend` entra na Task 3).

**Files:**
- Create: `src/js/comms.js`
- Modify: `index.html` (botão COMMS junto de `#bl-emettre-btn`; bloco `#comms-popup`)
- Modify: `src/js/main.js` (import)

**Interfaces:**
- Consumes (já existem na plataforma): `window._blGetAllLegs`, `window.generateBilletPDFs`,
  `window._lastBilletPDFBlobs`, `window.getAirlineLogoCode`, `window.buildPreview`,
  `window.tripType`, os campos DOM do billet (`bl-*`, `cli-*`, `booking-ref`, `travel-class`).
- Produces (consumido pela Task 3 e pela UI):
  - `window.openCommsPopup()`, `window.closeCommsPopup()`, `window._commsRender()`,
    `window._commsSetLang(lang)`, `window._commsAutofill()`, `window._commsBuildEmailHTML(opts?)`,
    `window._commsSyncPnrToTicketing(v)`, e os handlers do popup (`_commsCabinSync`,
    `_commsHoldSync`, `_commsOnSendModeChange`, `_commsToggleIntro`, etc.).
  - `window._pdfLang` (string 'fr'|'en'|'es'), `window._commsData` (objeto com `pax`, `flights`,
    `bookings`, `tripType`, `travelClass`).
  - `_blobToBase64(blob)` (helper interno; a Task 3 o usa).
  - O botão **Envoyer** (`#cm-send-btn`) chama `window._commsSend()` (definida na Task 3; o guard
    `&&`/typeof evita erro enquanto isso).

- [ ] **Step 1: Criar `src/js/comms.js` com o i18n local e o scaffold**

Cabeçalho do módulo com o dicionário de traduções e o mecanismo `T`/`_pdfLang` locais. Copiar os
valores das chaves **exatamente** dos três dicionários do monólito (`docs/monolito.html`: bloco FR
~linha 6711, EN ~6743, ES ~6775). As chaves que o COMMS usa (24, enumeradas abaixo) são:
`cm_intro, cm_header_sub, cm_flight_details, cm_baggage, cm_cabin, cm_hold, cm_recap, cm_recipient,
cm_ref_label, cm_confirmed, cm_direct, cm_stop, cm_stops, cm_subject, cm_pax_count, cm_help,
cm_rights, cm_vol_aller, cm_vol_retour, cm_vol_n, issued_on, passengers, passengers_one,
travel_class`.

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// COMMS — email de confirmação de reserva (FR/EN/ES). Port fiel do monólito.
// Backend de envio: Supabase Edge Function `send-email` (Resend) — ver Task 3.
// i18n isolado: dicionário próprio + T()/_pdfLang locais (NÃO usa i18n.js).
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

// Dicionário do COMMS. Valores copiados VERBATIM de docs/monolito.html
// (FR ~6711, EN ~6743, ES ~6775). Enumerar as 24 chaves listadas no plano.
const _COMMS_I18N = {
  fr: { /* copiar os pares chave:valor FR do monólito para as 24 chaves */ },
  en: { /* idem EN */ },
  es: { /* idem ES */ },
};
if (typeof window._pdfLang !== 'string') window._pdfLang = 'fr';
// T local: resolve a chave no idioma corrente; devolve a própria chave se faltar.
function T(k) {
  const lang = window._pdfLang || 'fr';
  return (_COMMS_I18N[lang] && _COMMS_I18N[lang][k]) || (_COMMS_I18N.fr && _COMMS_I18N.fr[k]) || k;
}
window._commsData = window._commsData || { pax: [], flights: [] };
```

> **Nota ao implementador:** preencha os três objetos `fr/en/es` copiando os valores reais das 24
> chaves dos dicionários do monólito. NÃO invente traduções — abra `docs/monolito.html` nos ranges
> citados e transcreva. Se uma das 4 chaves gerais (`issued_on`, `passengers`, `passengers_one`,
> `travel_class`) estiver em outra parte do mesmo dicionário `fr/en/es`, pegue de lá.

- [ ] **Step 2: Portar as funções do COMMS (verbatim, exceto `_commsSend`)**

Portar de `docs/monolito.html` para `comms.js`, **verbatim**, o bloco contíguo de funções COMMS
**linhas 12237–13126** (de `var _commsData = {...}` até logo ANTES de `async function _commsSend`)
e **13286 em diante NÃO** (o que vem depois não é COMMS). Também portar `_commsSyncPnrToTicketing`
(linhas **9187–9199**). Isso inclui: `_commsAirlineName` + `_COMMS_AIRLINE_NAMES`, `openCommsPopup`,
`closeCommsPopup`, `_commsEsc`, `_commsAutofill`, `_commsBuildDivideFields`, `_commsOnSendModeChange`,
bag sync (`_commsBagSync`/`_commsCabinSync`/`_commsHoldSync` + unit changes), `_commsToggleSection`
/`_commsToggleIntro`, `_commsFmtEtkt`, timezone helpers (`_commsTimeHHMM`/`_commsDatePart`/
`_commsIso`/`_commsTzSuffix`/`_commsIsoTz`), `_commsBuildJsonLd`, `_commsBuildEmailHTML`,
`_commsFlightCardHTML`, `_commsRender`, `_commsSetLang`.

Ajustes obrigatórios ao portar (só estes):
1. As chamadas `T('...')` já funcionam com o `T` local do Step 1 — não alterar.
2. `_commsData` já é declarado no Step 1 (`window._commsData`) — ao portar `var _commsData = {...}`,
   **remover a re-declaração** e usar o global (evita sombra). Trocar `var _commsData` pela
   inicialização condicional já feita no Step 1.
3. Manter todos os `window._commsX = _commsX` (bridges) como no monólito.
4. Onde o monólito usa `window._pdfLang`, manter — é o mesmo global do Step 1.

- [ ] **Step 3: Adicionar o botão COMMS e o popup no `index.html`**

No `index.html`, junto ao bloco de ações do billet (perto de `#bl-emettre-btn`, ~linha 1903),
inserir o botão (verbatim do monólito, linha 3447):

```html
      <button class="btn btn-sm bl-action-navy" onclick="openCommsPopup()" style="background:#06203b !important;color:#fff !important;border:none;font-size:0.68rem;padding:0.42rem 0.85rem;">COMMS</button>
```

E portar o bloco do popup **verbatim** de `docs/monolito.html` **linhas 3514–3617** (`<div
id="comms-popup" ...>` até o `</div>` que o fecha, incluindo os botões `cm-lang-btn`, os campos
`cm-*`, `#cm-perpax-wrap`, e `#cm-send-btn`), inserindo-o junto às demais overlays/popup do
`index.html`.

- [ ] **Step 4: Importar `comms.js` no `main.js`**

Em `src/js/main.js`, após a linha `import './vols.js';`, adicionar:

```javascript
import './comms.js';
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build conclui sem erro. Sem `Rollup failed`/`is not defined`/`duplicate declaration`
(atenção ao `_commsData` do Step 2.2).

- [ ] **Step 6: Verificação runtime (popup abre e autofill)**

`npm run dev` → abrir um dossier com billet emitido → clicar **COMMS**.
Expected: popup abre; nome/email/ref/data preenchidos; cards de voo e linhas de pax aparecem;
bagagem cabine/soute sincronizada; toggle FR/EN/ES re-renderiza os textos. Sem erro no console.
(O botão Envoyer ainda não envia — ok.)

- [ ] **Step 7: Commit**

```bash
git add src/js/comms.js src/js/main.js index.html
git commit -m "feat(comms): popup COMMS + i18n FR/EN/ES + autofill/build do email (sem envio)"
```

---

## Task 3: `_commsSend` via Edge Function + auditoria

Porta o `_commsSend` (o único trecho deixado de fora na Task 2), trocando o POST no PHP pela chamada
à Edge Function `send-email`, e grava a auditoria no `system_log`. Deliverable: envio ponta-a-ponta.

**Files:**
- Modify: `src/js/comms.js` (append `_commsSend` + helper `_blobToBase64` + audit)

**Interfaces:**
- Consumes: a Edge Function `send-email` (Task 1); `generateBilletPDFs`, `_lastBilletPDFBlobs`,
  `buildPreview`, `_commsBuildEmailHTML` (Task 2), `_commsData`, `window._pdfLang`,
  `window.__logEvent` (de `system-log.js`), `supabase.functions.invoke`.
- Produces: `window._commsSend()` (async), chamado pelo `#cm-send-btn`.

- [ ] **Step 1: Portar `_commsSend` com a divergência de envio**

Portar de `docs/monolito.html` **linhas 13127–13285** (`async function _commsSend()` +
`window._commsSend = _commsSend;`) para o fim de `comms.js`, **verbatim exceto** o bloco de envio.
Também portar o helper `_blobToBase64` (procurar sua definição no monólito — usado por `_commsSend`;
está próximo ao bloco COMMS) e as constantes de imagem inline base64 que `_commsSend` referencia
(`EXPATUR_LOGO_WHITE_PNG_B64`, `EXPATUR_ICON_COLOR_PNG_B64`, `EXPATUR_WHATSAPP_PNG_B64`,
`EXPATUR_INSTAGRAM_PNG_B64`, `EXPATUR_LINKEDIN_PNG_B64`, `EXPATUR_FACEBOOK_PNG_B64`,
`EXPATUR_TITLE_EN_PNG_B64`, `EXPATUR_TITLE_FR_PNG_B64`) — copiá-las do monólito para `comms.js`.

**Divergência obrigatória** — substituir o bloco de `fetch` do monólito:

```javascript
        // MONÓLITO (REMOVER):
        var r = await fetch('https://workspace.expaturtravel.com/finance/send_email.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        var res;
        try { res = await r.json(); } catch(e) { res = { ok:false, error:'HTTP '+r.status }; }
```

por:

```javascript
        // PLATAFORMA: envio via Supabase Edge Function (JWT anexado automaticamente).
        var res;
        if (!SUPABASE_ENABLED || !supabase) { res = { ok:false, error:'Supabase indisponível' }; }
        else {
          try {
            var inv = await supabase.functions.invoke('send-email', { body: payload });
            res = inv && inv.data ? inv.data : { ok:false, error:(inv && inv.error && inv.error.message) || 'erreur' };
          } catch(e) { res = { ok:false, error:(e && e.message) || String(e) }; }
        }
```

(O `payload` já é o mesmo objeto montado logo acima no `_commsSend` do monólito:
`{to, bcc:'administration@expaturtravel.com', contactName, subject, html, ref, pax, flights,
attachments, inlineImages}`. A Edge Function usa `to/bcc/subject/html/attachments/inlineImages/ref`;
os campos extras são ignorados sem problema.)

- [ ] **Step 2: Auditar cada envio bem-sucedido**

No `_commsSend`, no ramo de sucesso (quando `failList.length === 0`, logo após montar o status de
sucesso), adicionar a auditoria:

```javascript
        // Auditoria (fase 4): registra o envio bem-sucedido.
        try {
          if (typeof window.__logEvent === 'function') {
            window.__logEvent('EMAIL_CONFIRMATION', 'comms', {
              entity_id: (document.getElementById('booking-ref')||{}).value || ref || '',
              new_value: mainEmail,
              field_changed: 'lang=' + (window._pdfLang||'fr') + ' pax=' + (_commsData.pax||[]).length + ' envois=' + okCount,
            });
          }
        } catch(e) {}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build verde.

- [ ] **Step 4: Verificação runtime (envio ponta-a-ponta)**

Requer a Edge Function deployada + `RESEND_API_KEY` setado + domínio verificado (Task 1 Step 4).
No billet, abrir COMMS e **Envoyer**:
- **single** (1 pax) → cliente recebe email FR com o PDF anexado; BCC admin recebe.
- **fundido** (`cm-merge`, >1 pax) → 1 email com todos os pax + todos os PDFs; sufixo bagagem
  `/pers` (FR/ES) ou `/pax` (EN) só no fundido.
- **dividido/por-pax** → 1 email por pax, só o PDF daquele pax, sem sufixo.
- Trocar EN/ES → email e PDF no idioma certo.
- Cada envio OK aparece no `system_log` (Journal, módulo `comms`).
- Sem sessão autenticada → a function recusa (JWT).

- [ ] **Step 5: Commit**

```bash
git add src/js/comms.js
git commit -m "feat(comms): envio via Edge Function send-email + auditoria no system_log"
```

---

## Self-Review

**1. Cobertura da spec:**
- §2.1 backend Edge Function + §4 contrato → Task 1. ✓
- §2.2 Resend → Task 1 (api.resend.com). ✓
- §2.3 port fiel + §5 módulo → Tasks 2 e 3 (ranges verbatim; única divergência no envio). ✓
- §2.4 From administration@ → Task 1 (FROM_EMAIL default) + BCC no payload (Task 3). ✓
- §2.5 auditoria → Task 3 Step 2. ✓
- §6 UI (botão + popup) → Task 2 Steps 3. ✓
- §7 i18n FR/EN/ES isolado → Task 2 Step 1. ✓
- §8 segurança (verify_jwt) → Task 1. ✓
- §9 pré-requisitos ops → Task 1 Step 4 + README. ✓
- §10 critérios de teste → verificações runtime das Tasks 2/3. ✓
- §11 arquivos → todas as tasks. ✓
- §12 fora de escopo (blSyncPnr/pushLeg, webhooks, fila) → respeitado (não há tasks disso). ✓

**2. Placeholders:** o código novo (Edge Function, divergência de envio, auditoria, i18n scaffold,
botão, import) está completo. Os trechos "portar verbatim de monolito.html linhas X–Y" NÃO são
placeholders: o código existe em local exato e a task manda transcrevê-lo, listando os ajustes
pontuais. É a forma correta de planejar um port fiel de ~1000 linhas sem colá-las aqui.

**3. Consistência de tipos/nomes:** `window._commsData`, `window._pdfLang`, `_commsBuildEmailHTML`,
`_blobToBase64`, `payload` (shape) e o contrato da Edge Function (`to/bcc/subject/html/attachments/
inlineImages`) são consistentes entre Task 1 (contrato), Task 2 (produz `_commsBuildEmailHTML`,
`_commsData`, `_blobToBase64`) e Task 3 (consome tudo + `functions.invoke`). O botão `#cm-send-btn`
(Task 2) chama `window._commsSend` (Task 3). As 24 chaves i18n são as mesmas usadas pelo código
portado.

## Handoff de execução

**Plano completo e salvo em `docs/superpowers/plans/2026-07-04-comms-email.md`. Duas opções:**

**1. Subagent-Driven (recomendado)** — despacho um subagente por task, reviso entre elas.

**2. Execução Inline** — executo nesta sessão com executing-plans, em lote com checkpoints.

**Qual abordagem?**
