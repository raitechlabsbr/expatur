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
