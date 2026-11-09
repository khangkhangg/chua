#!/usr/bin/env bash
# Installs An Tâm Nam Chùa on a Raspberry Pi (Raspberry Pi OS / Debian / Ubuntu, arm64 or armhf)
# and publishes it through a Cloudflare Tunnel, so the Pi needs no open ports or public IP.
#
#   sudo bash install.sh                      # everything, asks for the tunnel token at the end
#   sudo bash install.sh --no-tunnel          # skip Cloudflare; the site answers on 127.0.0.1:8080
#   sudo bash install.sh --branch=some-branch --domain=chua.vietnamcos.com --port=8080
#   sudo bash install.sh --test-payments      # candles show a "pretend I paid" button (staging only)
#   sudo bash install.sh --redis              # add Redis (only needed for more than one live server)
#
# Safe to run again: it keeps the existing database password, admin password and settings.
set -euo pipefail

DOMAIN=chua.vietnamcos.com
BRANCH=main
REPO=https://github.com/khangkhangg/chua.git
DEST=/var/www/chua
PORT=8080          # nginx, local only; the tunnel connects to it
WS_PORT=9502       # live server, local only; nginx proxies /ws to it
TUNNEL=1
TEST_PAY=0
REDIS=0

for a in "$@"; do
  case "$a" in
    --domain=*) DOMAIN="${a#*=}" ;;
    --branch=*) BRANCH="${a#*=}" ;;
    --dest=*) DEST="${a#*=}" ;;
    --port=*) PORT="${a#*=}" ;;
    --no-tunnel) TUNNEL=0 ;;
    --test-payments) TEST_PAY=1 ;;
    --redis) REDIS=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $a" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run it with sudo." >&2; exit 1; }

say "1/7 Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
PKGS="git curl nginx mariadb-server php-fpm php-cli php-mysql php-mbstring php-intl php-curl"
[ "$REDIS" = 1 ] && PKGS="$PKGS redis-server php-redis"
# shellcheck disable=SC2086
apt-get install -y -qq $PKGS >/dev/null
PHPV=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
php -r 'exit(PHP_VERSION_ID >= 80100 ? 0 : 1);' || { echo "PHP $PHPV is too old; 8.1 or newer is needed." >&2; exit 1; }
FPM_SOCK=$(ls /run/php/php"$PHPV"-fpm.sock 2>/dev/null || ls /run/php/php*-fpm.sock 2>/dev/null | head -1 || true)
[ -n "$FPM_SOCK" ] || { systemctl enable --now "php$PHPV-fpm"; FPM_SOCK=/run/php/php$PHPV-fpm.sock; }
systemctl enable --now mariadb >/dev/null 2>&1 || true
[ "$REDIS" = 1 ] && systemctl enable --now redis-server >/dev/null 2>&1
echo "PHP $PHPV, FPM at $FPM_SOCK"

say "2/7 Code ($BRANCH) in $DEST"
git config --global --add safe.directory "$DEST" 2>/dev/null || true
if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch -q origin "$BRANCH"
  git -C "$DEST" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  mkdir -p "$(dirname "$DEST")"
  git clone -q --branch "$BRANCH" "$REPO" "$DEST"
fi
git -C "$DEST" log --oneline -1

say "3/7 Database"
DB_PASS_FILE=/root/.chua-db-pass
if [ ! -s "$DB_PASS_FILE" ]; then
  (umask 077; php -r 'echo bin2hex(random_bytes(18));' > "$DB_PASS_FILE")
fi
DB_PASS=$(cat "$DB_PASS_FILE")
mysql <<SQL
CREATE DATABASE IF NOT EXISTS chua CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'chua'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER 'chua'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL ON chua.* TO 'chua'@'localhost';
FLUSH PRIVILEGES;
SQL
for f in "$DEST"/sql/*.sql; do mysql chua < "$f"; echo "applied $(basename "$f")"; done

say "4/7 Settings (config.local.php)"
CONF="$DEST/config.local.php"
ADMIN_FILE=/root/chua-admin-password.txt
if [ -f "$CONF" ]; then
  echo "kept the existing $CONF"
else
  (umask 077; php -r 'echo rtrim(strtr(base64_encode(random_bytes(12)), "+/", "-_"), "="), PHP_EOL;' > "$ADMIN_FILE")
  CHUA_DOMAIN="$DOMAIN" CHUA_DB_PASS="$DB_PASS" CHUA_ADMIN="$(cat "$ADMIN_FILE")" \
  CHUA_TEST_PAY="$TEST_PAY" CHUA_REDIS="$REDIS" CHUA_WS_PORT="$WS_PORT" php -r '
    $d = getenv("CHUA_DOMAIN");
    $v = [
      "base_url" => "https://$d",
      "secret" => bin2hex(random_bytes(32)),
      "trust_cloudflare" => true,
      "db" => ["dsn" => "mysql:host=localhost;dbname=chua;charset=utf8mb4", "user" => "chua", "pass" => getenv("CHUA_DB_PASS")],
      "redis" => ["enabled" => getenv("CHUA_REDIS") === "1"],
      "realtime" => ["enabled" => true, "mode" => "ws", "public_url" => "wss://$d/ws", "port" => (int) getenv("CHUA_WS_PORT"), "node_id" => "pi"],
      "payments" => ["enabled" => getenv("CHUA_TEST_PAY") === "1", "test_mode" => getenv("CHUA_TEST_PAY") === "1"],
      "admin" => ["password_hash" => password_hash(getenv("CHUA_ADMIN"), PASSWORD_DEFAULT)],
    ];
    echo "<?php\n// Written by deploy/pi/install.sh on ", gmdate("Y-m-d H:i"), " UTC. Edit by hand to change settings.\nreturn ", var_export($v, true), ";\n";
  ' > "$CONF"
  echo "wrote $CONF; admin password saved in $ADMIN_FILE"
fi
chown -R root:www-data "$DEST"
find "$DEST" -path "$DEST/.git" -prune -o -type d -exec chmod 755 {} +
find "$DEST" -path "$DEST/.git" -prune -o -type f -exec chmod 644 {} +
chmod 640 "$CONF"
(cd "$DEST" && sudo -u www-data php -r 'require "src/bootstrap.php"; Chua\Db::get()->query("SELECT 1"); echo "database ok\n";')

say "5/7 Live server (chua-realtime on 127.0.0.1:$WS_PORT)"
cat > /etc/systemd/system/chua-realtime.service <<UNIT
[Unit]
Description=An Tam Nam Chua live server
After=network.target mariadb.service redis-server.service

[Service]
ExecStart=/usr/bin/php $DEST/realtime/server.php --port=$WS_PORT --node=pi --host=127.0.0.1
WorkingDirectory=$DEST
User=www-data
Group=www-data
Restart=always
RestartSec=2
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable chua-realtime >/dev/null 2>&1
systemctl restart chua-realtime

say "6/7 Web server (nginx on 127.0.0.1:$PORT)"
cat > /etc/nginx/sites-available/chua <<NGINX
# An Tâm Nam Chùa. Local only: the Cloudflare Tunnel is the way in from the internet.
server {
    listen 127.0.0.1:$PORT;
    server_name $DOMAIN localhost;
    root $DEST/public;
    index index.php;
    client_max_body_size 64k;

    location /ws {
        proxy_pass http://127.0.0.1:$WS_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / { try_files \$uri \$uri/ /index.php?\$query_string; }

    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:$FPM_SOCK;
    }

    location ~* \.(js|css)\$ { expires 7d; add_header Cache-Control "public"; }
    location ~ /\. { deny all; }
}
NGINX
ln -sf /etc/nginx/sites-available/chua /etc/nginx/sites-enabled/chua
nginx -t -q
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx 2>/dev/null || systemctl restart nginx

sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")
shard=$(curl -s "http://127.0.0.1:$PORT/api/shard.php")
echo "home page: $code"
echo "live server: $shard"
[ "$code" = 200 ] || { echo "The home page did not answer 200. See: journalctl -u nginx; tail /var/log/nginx/error.log" >&2; exit 1; }

say "7/7 Cloudflare Tunnel"
if [ "$TUNNEL" = 0 ]; then
  echo "skipped (--no-tunnel)."
elif systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared'; then
  echo "This Pi already runs a Cloudflare Tunnel. In the Cloudflare dashboard (Zero Trust > Networks > Tunnels),"
  echo "open that tunnel > Public Hostname > Add: $DOMAIN  ->  HTTP  ->  localhost:$PORT"
else
  if ! command -v cloudflared >/dev/null; then
    mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
    echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
    apt-get update -qq && apt-get install -y -qq cloudflared >/dev/null
  fi
  echo "Paste the tunnel token from the Cloudflare dashboard (see deploy/pi/README.md, step 1)."
  echo "It is not shown while you type. Leave it empty to do this later with: sudo cloudflared service install <token>"
  read -rs -p "Token: " TOKEN; echo
  if [ -n "$TOKEN" ]; then
    cloudflared service install "$TOKEN"
    unset TOKEN
    echo "tunnel installed."
  fi
fi

say "Done"
echo "Site:   https://$DOMAIN   (locally: http://127.0.0.1:$PORT)"
echo "Admin:  https://$DOMAIN/admin/   password in $ADMIN_FILE"
echo "Update: sudo bash $DEST/deploy/pi/update.sh"
