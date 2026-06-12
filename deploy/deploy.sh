#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# deploy.sh — Deploy Expatur Backoffice para VPS
# Uso: ./deploy/deploy.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e  # parar em caso de erro

VPS_IP="72.60.243.106"
VPS_USER="root"
VPS_DIR="/var/www/expatur-backoffice"
APP_NAME="expatur-backoffice"
APP_PORT=4100  # tem de coincidir com PM2_SERVE_PORT no ecosystem.config.cjs (3100 pertence ao proposta-rede-social!)

# ── Cores ─────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${YELLOW}▶${NC} $1"; }

# ── 1. Build local ────────────────────────────────────────────────────────────
step "Build de produção..."
npm run build || err "npm run build falhou"
ok "dist/ gerado"

# ── 2. Verificar conexão SSH ──────────────────────────────────────────────────
step "A verificar conexão SSH com ${VPS_USER}@${VPS_IP}..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "${VPS_USER}@${VPS_IP}" "echo ok" \
  || err "Não foi possível conectar. Verifique a chave SSH e o IP."
ok "SSH conectado"

# ── 3. Criar estrutura no servidor ────────────────────────────────────────────
step "A preparar directório no servidor..."
ssh "${VPS_USER}@${VPS_IP}" "mkdir -p ${VPS_DIR} && echo ok" || err "mkdir falhou"
ok "Directório: ${VPS_DIR}"

# ── 4. Transferir ficheiros ───────────────────────────────────────────────────
step "A transferir dist/ para ${VPS_USER}@${VPS_IP}:${VPS_DIR}..."
rsync -azP --delete \
  --exclude='.git' \
  dist/ "${VPS_USER}@${VPS_IP}:${VPS_DIR}/" \
  || err "rsync falhou"
ok "Ficheiros transferidos"

# Transferir também o ecosystem.config.cjs
rsync -az ecosystem.config.cjs "${VPS_USER}@${VPS_IP}:${VPS_DIR}/../ecosystem.config.cjs"

# ── 5. Configurar e reiniciar PM2 no servidor ─────────────────────────────────
step "A configurar PM2..."
ssh "${VPS_USER}@${VPS_IP}" bash << REMOTE
set -e

# Instalar 'serve' se não estiver instalado
if ! command -v serve &>/dev/null; then
  echo "  → A instalar 'serve'..."
  npm install -g serve
fi

# Ir para o directório pai onde está o ecosystem.config.cjs
cd /var/www

# Reiniciar se já existir; senão, iniciar via ecosystem
if pm2 describe ${APP_NAME} &>/dev/null; then
  pm2 restart ${APP_NAME} --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "PM2 OK"
REMOTE
ok "PM2 a correr na porta ${APP_PORT}"

# ── 6. Verificar se está a responder ─────────────────────────────────────────
step "A verificar resposta HTTP..."
sleep 2
HTTP_CODE=$(ssh "${VPS_USER}@${VPS_IP}" "curl -s -o /dev/null -w '%{http_code}' http://localhost:${APP_PORT}/")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ]; then
  ok "Aplicação a responder: HTTP ${HTTP_CODE}"
else
  warn "HTTP ${HTTP_CODE} — pode estar a iniciar ainda"
fi

# ── 7. Resumo ─────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ Deploy concluído!${NC}"
echo ""
echo "  Servidor:    ${VPS_IP}"
echo "  Directório:  ${VPS_DIR}"
echo "  Porta:       ${APP_PORT}"
echo "  PM2 app:     ${APP_NAME}"
echo ""
echo "  Próximo passo:"
echo "  Configure o Nginx Proxy Manager para apontar"
echo "  o seu domínio para: http://localhost:${APP_PORT}"
echo "════════════════════════════════════════════════════════"
