#!/bin/bash
# ============================================================
#  嘴哥管理系统 - 一键部署脚本
#  用法: chmod +x deploy.sh && ./deploy.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║       嘴哥管理系统 - 一键部署          ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info()  { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

rand_alnum() {
    local len=${1:-32}
    local result=""
    if [ -r /dev/urandom ]; then
        result=$(head -c 256 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c "$len")
    fi
    if [ ${#result} -lt "$len" ]; then
        result=$(openssl rand -base64 "$((len * 2))" 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c "$len")
    fi
    echo "$result"
}

# ============================================================
#  Step 1: 环境检测
# ============================================================

print_banner

echo -e "${CYAN}[Step 1/7] 环境检测${NC}"
echo "-------------------------------------------"

if [ "$(id -u)" -ne 0 ]; then
    log_error "请使用 root 用户运行此脚本: sudo ./deploy.sh"
    exit 1
fi

# 修复 Windows 换行符
find . \( -name "*.sh" -o -name "*.php" -o -name "*.conf" -o -name "*.yml" -o -name "*.sql" -o -name "Dockerfile*" \) -type f | xargs sed -i 's/\r$//' 2>/dev/null || true
log_info "已修复文件换行符"

if ! command -v docker &>/dev/null; then
    log_warn "未检测到 Docker，正在自动安装..."
    curl -fsSL https://get.docker.com | bash
    systemctl enable docker && systemctl start docker
    log_info "Docker 安装完成"
else
    log_info "Docker 已安装: $(docker --version | head -1)"
fi

COMPOSE_CMD=""
if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker compose"
else
    log_warn "未检测到 docker-compose，正在安装..."
    curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    COMPOSE_CMD="docker compose"
    log_info "docker-compose 安装完成"
fi

log_info "使用命令: ${COMPOSE_CMD}"

# ============================================================
#  Step 2: 收集配置信息
# ============================================================

echo ""
echo -e "${CYAN}[Step 2/7] 配置信息${NC}"
echo "-------------------------------------------"

DOMAIN=""
USE_SSL="n"
ADMIN_PASSWORD=""

read -rp "请输入你的域名 (直接回车则用IP访问): " DOMAIN
DOMAIN=$(echo "$DOMAIN" | xargs | sed 's|https\?://||;s|/.*||;s|^www\.||')

if [ -n "$DOMAIN" ]; then
    read -rp "是否配置 HTTPS/SSL? (y/n, 默认y): " USE_SSL
    USE_SSL=${USE_SSL:-y}
fi

read -rp "设置管理员登录密码 (直接回车自动生成): " ADMIN_PASSWORD
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(rand_alnum 16)
    echo -e "  ${GREEN}已自动生成管理员密码:${NC} ${YELLOW}${ADMIN_PASSWORD}${NC}"
fi

# ============================================================
#  Step 3: 生成 .env 配置
# ============================================================

echo ""
echo -e "${CYAN}[Step 3/7] 生成配置文件${NC}"
echo "-------------------------------------------"

REUSE_DB=false
if [ -f ".env" ]; then
    EXISTING_VOLUME=$(docker volume ls -q 2>/dev/null | grep "mysql_data" || true)
    if [ -n "$EXISTING_VOLUME" ]; then
        log_warn "检测到已有数据库，将保留旧数据库密码（避免密码不匹配）"
        REUSE_DB=true
        OLD_DB_ROOT_PASS=$(grep "^MYSQL_ROOT_PASSWORD=" .env | cut -d= -f2)
        OLD_DB_PASS=$(grep "^MYSQL_PASSWORD=" .env | cut -d= -f2)
    fi
    cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
    log_warn "已备份旧 .env 文件"
fi

if [ "$REUSE_DB" = true ] && [ -n "$OLD_DB_PASS" ]; then
    DB_ROOT_PASS="$OLD_DB_ROOT_PASS"
    DB_PASS="$OLD_DB_PASS"
    log_info "已复用旧数据库密码"
else
    DB_ROOT_PASS=$(rand_alnum 20)
    DB_PASS=$(rand_alnum 20)
fi
SECRET_KEY=$(rand_alnum 32)
SIV_KEY=$(rand_alnum 16)
SIV_JEC_KEY=$(rand_alnum 32)
ADMIN_PATH_KEY=$(rand_alnum 24)
WS_SECRET_KEY=$(rand_alnum 24)

cat > .env << EOF
# ============================================
#  自动生成于 $(date '+%Y-%m-%d %H:%M:%S')
#  请妥善保管此文件！
# ============================================

# MySQL
MYSQL_ROOT_PASSWORD=${DB_ROOT_PASS}
MYSQL_DATABASE=zgl
MYSQL_USER=zgl
MYSQL_PASSWORD=${DB_PASS}

# PHP 数据库连接
DB_SERVER=mysql
DB_USER=zgl
DB_PASS=${DB_PASS}
DB_NAME=zgl

# 加密密钥（修改后旧数据无法解密）
SECRIT_KEY=${SECRET_KEY}
SIV=${SIV_KEY}
SIV_JEC=${SIV_JEC_KEY}

# 管理员登录密码
ADMIN_KEY=${ADMIN_PASSWORD}

# 后台入口保护
ADMIN_PATH=${ADMIN_PATH_KEY}

# WebSocket 连接密钥
WS_SECRET=${WS_SECRET_KEY}
EOF

log_info ".env 配置文件已生成"

# ============================================================
#  Step 4: 配置 Nginx（域名 + SSL）
# ============================================================

echo ""
echo -e "${CYAN}[Step 4/7] 配置 Nginx${NC}"
echo "-------------------------------------------"

NGINX_CONF="docker/nginx.conf"

cp "$NGINX_CONF" "${NGINX_CONF}.bak" 2>/dev/null || true

if [ -n "$DOMAIN" ] && { [ "$USE_SSL" = "y" ] || [ "$USE_SSL" = "Y" ]; }; then
    # ===== HTTPS 模式 =====
    mkdir -p docker/ssl

    cat > "$NGINX_CONF" << 'NGINXEOF'
limit_req_zone $binary_remote_addr zone=adminlimit:10m rate=5r/s;

server {
    listen 80 default_server;
    server_name _;
    root /var/www/html/root;

    location /private {
        alias /var/www/html/private;
        location ~ \.php$ {
            fastcgi_pass php:9000;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $request_filename;
            include fastcgi_params;
            fastcgi_hide_header X-Powered-By;
        }
    }

    location /api {
        alias /var/www/html/api;
        location ~ \.php$ {
            fastcgi_pass php:9000;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $request_filename;
            include fastcgi_params;
            fastcgi_hide_header X-Powered-By;
        }
    }

    location /user {
        alias /var/www/html/user;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER www.DOMAIN_PLACEHOLDER;
    root /var/www/html/root;
    index index.html index.php;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 50M;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    server_tokens off;

    location ~ /\. { deny all; return 404; }
    location ~* \.(log|sql|bak|env|ini|config|sh)$ { deny all; return 404; }

    location /assets/ {
        alias /var/www/html/assets/;
        expires 30d;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ws/ {
        proxy_pass http://websocket:8080/?k=${WS_SECRET};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 60s;
        proxy_buffering off;
    }

    location /ws {
        proxy_pass http://websocket:8080/?k=${WS_SECRET};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 60s;
        proxy_buffering off;
    }

    location /api {
        alias /var/www/html/api;
        location ~ \.php$ {
            fastcgi_pass php:9000;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $request_filename;
            fastcgi_param HTTPS on;
            include fastcgi_params;
            fastcgi_hide_header X-Powered-By;
        }
    }

    location /private {
        alias /var/www/html/private;
        index login.php index.php;
        limit_req zone=adminlimit burst=10 nodelay;
        location ~ \.php$ {
            fastcgi_pass php:9000;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $request_filename;
            fastcgi_param HTTPS on;
            include fastcgi_params;
            fastcgi_hide_header X-Powered-By;
        }
        location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ { expires 7d; }
        location ~* \.(json|log|xml|txt|zip|md|example)$ { deny all; return 404; }
    }

    location /user {
        alias /var/www/html/user;
        autoindex off;
        location ~* \.(jpg|jpeg|png|gif|webp|svg|ico|mp3|wav|ogg|zip|apk)$ { expires 1d; }
        location ~ \.php$ { deny all; return 404; }
        location ~ /\. { deny all; return 404; }
    }

    location /screens {
        alias /var/www/html/screens;
        autoindex off;
        location ~* \.(jpg|jpeg|png|gif|webp)$ { expires 1h; }
        location ~ \.php$ { deny all; return 404; }
    }
}
NGINXEOF

    # 替换域名占位符
    sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "$NGINX_CONF"

    log_info "Nginx HTTPS 配置已生成 (域名: ${DOMAIN})"

    # 修改 docker-compose.yml: 添加 443 端口
    if ! grep -q "443:443" docker-compose.yml; then
        sed -i '/- "80:80"/a\      - "443:443"' docker-compose.yml
        log_info "docker-compose.yml 已添加 443 端口"
    fi

    # 修改 docker-compose.yml: 添加 SSL 证书挂载
    if ! grep -q "docker/ssl" docker-compose.yml; then
        sed -i '/default\.conf\.template:ro/a\      - ./docker/ssl:/etc/nginx/ssl:ro' docker-compose.yml
        log_info "docker-compose.yml 已添加 SSL 证书挂载"
    fi

    # 申请 SSL 证书
    SSL_READY=false

    read -rp "是否自动申请 Let's Encrypt 免费证书? (y/n, 默认y): " GET_CERT
    GET_CERT=${GET_CERT:-y}

    if [ "$GET_CERT" = "y" ] || [ "$GET_CERT" = "Y" ]; then
        if ! command -v certbot &>/dev/null; then
            log_warn "正在安装 certbot..."
            if command -v apt-get &>/dev/null; then
                apt-get update -qq && apt-get install -y -qq certbot >/dev/null 2>&1
            elif command -v yum &>/dev/null; then
                yum install -y -q certbot >/dev/null 2>&1
            fi
        fi

        if command -v certbot &>/dev/null; then
            log_info "正在申请 SSL 证书 (需要 80 端口空闲)..."
            $COMPOSE_CMD down 2>/dev/null || true
            set +e
            certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email 2>&1
            CERT_EXIT=$?
            set -e

            CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"
            if [ $CERT_EXIT -eq 0 ] && [ -f "${CERT_PATH}/fullchain.pem" ]; then
                \cp -f "${CERT_PATH}/fullchain.pem" docker/ssl/fullchain.pem
                \cp -f "${CERT_PATH}/privkey.pem" docker/ssl/privkey.pem
                chmod 644 docker/ssl/fullchain.pem
                chmod 600 docker/ssl/privkey.pem
                SSL_READY=true
                log_info "SSL 证书申请成功"

                CRON_CMD="0 3 * * * certbot renew --quiet --deploy-hook \"\\cp -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem $(pwd)/docker/ssl/ && \\cp -f /etc/letsencrypt/live/${DOMAIN}/privkey.pem $(pwd)/docker/ssl/ && docker restart zgl-nginx\""
                (crontab -l 2>/dev/null | grep -v "certbot renew" || true; echo "$CRON_CMD") | crontab -
                log_info "已添加证书自动续期定时任务 (每天凌晨3点)"
            else
                log_warn "证书申请失败 (确保域名已解析到本服务器且80端口空闲)"
            fi
        else
            log_warn "certbot 安装失败"
        fi
    fi

    if [ "$SSL_READY" = false ]; then
        log_warn "SSL 证书未就绪，请手动放置证书文件到:"
        echo "    docker/ssl/fullchain.pem"
        echo "    docker/ssl/privkey.pem"
        echo ""
        log_warn "放置后执行: docker restart zgl-nginx"

        log_info "生成临时自签证书 (让服务先启动)..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout docker/ssl/privkey.pem \
            -out docker/ssl/fullchain.pem \
            -subj "/CN=${DOMAIN}" 2>/dev/null
        log_info "临时自签证书已生成 (浏览器会提示不安全，替换正式证书后恢复)"
    fi

elif [ -n "$DOMAIN" ]; then
    sed -i "s/server_name localhost nginx _;/server_name ${DOMAIN} www.${DOMAIN};/" "$NGINX_CONF"
    log_info "Nginx server_name 已设为: ${DOMAIN} (HTTP 模式)"

else
    log_info "使用 IP 直接访问模式 (HTTP)"
fi

# ============================================================
#  Step 5: 构建并启动
# ============================================================

echo ""
echo -e "${CYAN}[Step 5/7] 构建并启动服务${NC}"
echo "-------------------------------------------"

log_info "正在构建镜像并启动容器 (首次约 5-10 分钟)..."

$COMPOSE_CMD down 2>/dev/null || true

if ! $COMPOSE_CMD up -d --build; then
    log_error "构建或启动失败！查看详细错误:"
    $COMPOSE_CMD logs --tail=30
    exit 1
fi

echo ""
log_info "等待服务启动..."

RETRY=0
MAX_RETRY=60
HEALTHY=false
while [ $RETRY -lt $MAX_RETRY ]; do
    RUNNING=$($COMPOSE_CMD ps --format "table" 2>/dev/null | grep -c "Up" || $COMPOSE_CMD ps 2>/dev/null | grep -c "Up" || echo "0")
    if [ "$RUNNING" -ge 4 ]; then
        HEALTHY=true
        break
    fi
    RETRY=$((RETRY + 1))
    printf "\r  等待中... (%d/%d)" "$RETRY" "$MAX_RETRY"
    sleep 3
done
echo ""

if [ "$HEALTHY" = true ]; then
    log_info "所有服务启动成功!"
else
    log_warn "部分服务可能未就绪，请检查日志: ${COMPOSE_CMD} logs"
fi

echo ""
echo "容器状态:"
$COMPOSE_CMD ps

# ============================================================
#  Step 6: 创建总管理员账号
# ============================================================

echo ""
echo -e "${CYAN}[Step 6/7] 创建管理员账号${NC}"
echo "-------------------------------------------"

set +e

log_info "等待数据库就绪..."
sleep 10

ADMIN_USER="zgl"
ADMIN_USER_PASS="zglnb666"
ADMIN_PASS_HASH=$(docker exec zgl-php php -r "echo password_hash('${ADMIN_USER_PASS}', PASSWORD_DEFAULT);")
ADMIN_EMAIL_ENCRYPTED=$(docker exec zgl-php php -d error_reporting=0 -r "
require_once '/var/www/html/private/Eaod85401.php';
require_once '/var/www/html/private/Eaod29251.php';
echo EN('admin@zgl.com');
")
if [ -z "$ADMIN_EMAIL_ENCRYPTED" ] || echo "$ADMIN_EMAIL_ENCRYPTED" | grep -qi "error\|warning\|notice"; then
    log_warn "邮箱加密异常，使用备用方式"
    ADMIN_EMAIL_ENCRYPTED=$(docker exec zgl-php php -d error_reporting=0 -d display_errors=0 -r "
    require_once '/var/www/html/private/Eaod85401.php';
    require_once '/var/www/html/private/Eaod29251.php';
    echo EN('admin@zgl.com');
    ")
fi
ADMIN_TOKEN=$(openssl rand -hex 16)
ADMIN_TOKEN_EXP=$(date -d '+365 days' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -v+365d '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "2027-12-31 23:59:59")
ADMIN_USERID=$(head -c 256 /dev/urandom | tr -dc '0-9' | head -c 6)

docker exec zgl-mysql mysql -uzgl -p"${DB_PASS}" zgl -e "
DELETE FROM users WHERE usrname = '${ADMIN_USER}';
INSERT INTO users (userid, usrname, profilepic, email, password, Expire, subtype, authorty, token, token_expiration)
VALUES ('${ADMIN_USERID}', '${ADMIN_USER}', 'Prof.png', '${ADMIN_EMAIL_ENCRYPTED}', '${ADMIN_PASS_HASH}', '2099-12-31', '12 Month', 'admin', '${ADMIN_TOKEN}', '${ADMIN_TOKEN_EXP}');
" 2>/dev/null

if [ $? -eq 0 ]; then
    log_info "管理员账号创建成功"
    log_info "  前台用户名: ${ADMIN_USER}"
    log_info "  前台密码:   ${ADMIN_USER_PASS}"
else
    log_warn "管理员账号创建失败，请手动在后台添加"
fi

# 创建用户目录
docker exec zgl-php php -d error_reporting=0 -r "
require_once '/var/www/html/private/Eaod14881.php';
require_once '/var/www/html/private/createacc.php';
if (function_exists('Creatuserfolder')) { Creatuserfolder('${ADMIN_USERID}'); echo 'ok'; }
" 2>/dev/null || true

# 确保必要目录存在且权限正确
docker exec zgl-php mkdir -p /var/www/html/user/mp3 /var/www/html/user/storage /var/www/html/user/apps /var/www/html/user/ui /var/www/html/screens
docker exec zgl-php chown -R www-data:www-data /var/www/html/user/ /var/www/html/private/logs/ /var/www/html/private/errors/ /var/www/html/screens/ 2>/dev/null || true
docker exec zgl-php chmod -R 755 /var/www/html/user/ 2>/dev/null || true
log_info "目录权限已设置"

set -e

# ============================================================
#  Step 7: 部署完成
# ============================================================

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                      部署完成!                               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$DOMAIN" ]; then
    if [ "$USE_SSL" = "y" ] || [ "$USE_SSL" = "Y" ]; then
        SITE_URL="https://${DOMAIN}"
    else
        SITE_URL="http://${DOMAIN}"
    fi
else
    SERVER_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 ip.sb 2>/dev/null || echo "你的服务器IP")
    SITE_URL="http://${SERVER_IP}"
fi

echo -e "  ${CYAN}═══════════ 访问地址 ═══════════${NC}"
echo -e "  ${CYAN}前台地址:${NC}       ${SITE_URL}"
echo -e "  ${CYAN}后台地址:${NC}       ${SITE_URL}/private/login.php?key=${ADMIN_PATH_KEY}"
echo ""
echo -e "  ${CYAN}═══════════ 后台管理 ═══════════${NC}"
echo -e "  ${CYAN}后台密码:${NC}       ${YELLOW}${ADMIN_PASSWORD}${NC}"
echo -e "  ${CYAN}后台入口密钥:${NC}   ${ADMIN_PATH_KEY}"
echo ""
echo -e "  ${CYAN}═══════════ 前台账号 ═══════════${NC}"
echo -e "  ${CYAN}用户名:${NC}         ${YELLOW}${ADMIN_USER}${NC}"
echo -e "  ${CYAN}密码:${NC}           ${YELLOW}${ADMIN_USER_PASS}${NC}"
echo ""
echo -e "  ${CYAN}═══════════ 安全密钥 ═══════════${NC}"
echo -e "  ${CYAN}WebSocket密钥:${NC}  ${WS_SECRET_KEY}"
echo -e "  ${CYAN}加密密钥:${NC}       ${SECRET_KEY}"
echo -e "  ${CYAN}SIV:${NC}            ${SIV_KEY}"
echo ""
echo -e "  ${CYAN}═══════════ 数据库 ═══════════${NC}"
echo -e "  ${CYAN}数据库:${NC}         zgl"
echo -e "  ${CYAN}用户:${NC}           zgl"
echo -e "  ${CYAN}密码:${NC}           ${DB_PASS}"
echo -e "  ${CYAN}Root密码:${NC}       ${DB_ROOT_PASS}"
echo ""
echo -e "  ${RED}⚠ 请立即保存以上信息! 密码不会再次显示!${NC}"
echo ""

# 保存部署信息
cat > .deploy-info << EOF
============================================
  TG@xiaoyuwl管理系统 - 部署信息
  生成时间: $(date '+%Y-%m-%d %H:%M:%S')
============================================

访问地址:
  前台:         ${SITE_URL}
  后台:         ${SITE_URL}/private/login.php?key=${ADMIN_PATH_KEY}

后台管理:
  后台密码:     ${ADMIN_PASSWORD}
  入口密钥:     ${ADMIN_PATH_KEY}

前台总管理员:
  用户名:       ${ADMIN_USER}
  密码:         ${ADMIN_USER_PASS}

安全密钥:
  WebSocket:    ${WS_SECRET_KEY}
  加密密钥:     ${SECRET_KEY}
  SIV:          ${SIV_KEY}
  SIV_JEC:      ${SIV_JEC_KEY}

数据库:
  主机:         mysql (容器内部)
  数据库:       zgl
  用户:         zgl
  密码:         ${DB_PASS}
  Root密码:     ${DB_ROOT_PASS}

============================================
  请妥善保管此文件，不要泄露给他人!
============================================
EOF

chmod 600 .deploy-info
log_info "部署信息已保存到 .deploy-info 文件 (仅 root 可读)"

echo ""
echo -e "${YELLOW}常用命令:${NC}"
echo "  查看日志:     ${COMPOSE_CMD} logs -f"
echo "  重启服务:     ${COMPOSE_CMD} restart"
echo "  停止服务:     ${COMPOSE_CMD} down"
echo "  查看状态:     ${COMPOSE_CMD} ps"
echo "  重新部署:     ${COMPOSE_CMD} up -d --build"
echo "  查看部署信息: cat .deploy-info"
echo ""
