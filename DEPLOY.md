# Deploy runbook: chua.vietnamcos.com

Run these steps by hand, in order. Each step ends with a **Verify**; do not continue until it passes.

Facts:

- Host: Hetzner **spo2x**, reached over Tailscale: `ssh -i ~/.ssh/spo2x_admin root@100.71.6.80`.
- Code goes to `/var/www/duykhang/chua`; the web root is its `public/` folder.
- Three moving parts: the PHP site (nginx + PHP-FPM), the realtime server (a systemd service on port 9502, proxied at `/ws`), and MySQL/MariaDB. Redis is optional but needed for the global visitor count and for running more than one realtime node.
- DNS: `chua.vietnamcos.com` already resolves through Cloudflare. Until step 6 it falls through to another site.
- **Never type a password or key into a command line, a chat or a ticket.** Secrets go only into `config.local.php` on the server, edited with `nano`.

Commands are written for Git Bash on your PC, from the root of a clone of `khangkhangg/chua` on `main`:

```bash
SSH="ssh -i ~/.ssh/spo2x_admin root@100.71.6.80"
DEST=/var/www/duykhang/chua
```

## 0. Local checks

```bash
git checkout main && git pull
php tests/run.php
```

**Verify:** `71 passed, 0 failed` (needs a local `chua_test` database; see README).

## 1. Pre-flight on spo2x (read-only)

```bash
$SSH "php -v | head -1; php -m | grep -iE 'pdo_mysql|redis|openswoole|intl'; ls /run/php/"
$SSH "systemctl is-active mariadb mysql redis-server 2>/dev/null"
$SSH "grep -nE 'listen|ssl_certificate|fastcgi_pass|real_ip|server_name' /etc/nginx/sites-enabled/vietnamcos.com"
$SSH "grep -rln 'chua.vietnamcos.com' /etc/nginx/sites-enabled/ || echo 'no site for chua yet'"
```

**Verify:**

- PHP is 8.1 or newer and `pdo_mysql` is listed. `intl` is recommended (better name checks).
- Note whether `redis` and `openswoole` are listed. Without `openswoole` the realtime server runs on plain PHP, which handles about 1,000 visitors per node. With it, several thousand per node. Install it with `pecl install openswoole` and add `extension=openswoole` to the CLI php.ini when you need more.
- Note the PHP-FPM socket and the `listen`/`ssl_certificate` lines of the vietnamcos.com site. Step 6 copies them.

## 2. Database

Create the database and its user. Pick a password and keep it for step 4.

```bash
$SSH "mysql -e \"CREATE DATABASE IF NOT EXISTS chua CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'chua'@'localhost' IDENTIFIED BY 'CHANGE_ME'; GRANT ALL ON chua.* TO 'chua'@'localhost';\""
```

Run that line by hand on the server instead if you would rather not have the password in your shell history (`$SSH`, then `mysql`).

## 3. Upload

```bash
$SSH "mkdir -p $DEST"
rsync -av --delete -e "ssh -i ~/.ssh/spo2x_admin" \
  --exclude '.git' --exclude 'tests' --exclude 'docs' --exclude 'config.local.php' \
  ./ root@100.71.6.80:$DEST/
$SSH "mysql chua < $DEST/sql/001_schema.sql"
$SSH "chown -R root:www-data $DEST && find $DEST -type d -exec chmod 755 {} + && find $DEST -type f -exec chmod 644 {} +"
```

**Verify:** `$SSH "mysql chua -e 'SHOW TABLES'"` lists 10 tables (bans, candle_orders, candles, chat_log, events_daily, guests, payments, rate_limits, reports, wishes).

## 4. Server settings

```bash
$SSH "cp $DEST/config.local.example.php $DEST/config.local.php && chown root:www-data $DEST/config.local.php && chmod 640 $DEST/config.local.php"
$SSH "php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'"     # paste as 'secret'
$SSH "php -r 'echo password_hash(trim(fgets(STDIN)), PASSWORD_DEFAULT), PHP_EOL;'"   # type the admin password, paste the hash
```

Then edit it on the server (`$SSH`, `nano /var/www/duykhang/chua/config.local.php`):

- `secret`: the random string.
- `db.pass`: the password from step 2.
- `redis.enabled`: `true` if Redis is running.
- `realtime.enabled`: `true`; `realtime.public_url`: `wss://chua.vietnamcos.com/ws`.
- `payments`: leave `enabled` at `false` until step 8. Never set `test_mode` to `true` here.
- `admin.password_hash`: the hash.

**Verify:** `$SSH "cd $DEST && php -r 'require \"src/bootstrap.php\"; Chua\\Db::get(); echo \"db ok\", PHP_EOL;'"` prints `db ok`.

## 5. Realtime service

```bash
$SSH "cp $DEST/realtime/chua-realtime.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now chua-realtime"
$SSH "systemctl status chua-realtime --no-pager | head -5; curl -s http://127.0.0.1:9502/metrics | head -4"
```

**Verify:** the service is `active (running)`, its log line says `listening on 127.0.0.1:9502`, and `/metrics` prints `chua_players 0`.

## 6. nginx site

Create `/etc/nginx/sites-available/chua.vietnamcos.com`. Copy the `listen` and `ssl_certificate` lines exactly as step 1 printed them for vietnamcos.com, and use the FPM socket step 1 listed:

```nginx
server {
    server_name chua.vietnamcos.com;
    # listen ... ;            <- same as the vietnamcos.com site
    # ssl_certificate ... ;   <- same as the vietnamcos.com site (Cloudflare origin certificate)
    # ssl_certificate_key ... ;

    root /var/www/duykhang/chua/public;
    index index.php;
    client_max_body_size 64k;

    location /ws {
        proxy_pass http://127.0.0.1:9502;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / { try_files $uri $uri/ /index.php?$query_string; }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;   # <- the socket from step 1
    }

    location ~* \.(js|css)$ { expires 7d; add_header Cache-Control "public"; }
    location ~ /\. { deny all; }
}
```

```bash
$SSH "ln -s /etc/nginx/sites-available/chua.vietnamcos.com /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
```

**Verify:** `nginx -t` says the syntax is ok. Cloudflare passes WebSockets by default; if `/ws` fails in step 7, check Cloudflare > Network > WebSockets is on.

## 7. Check it live

```bash
curl -sS https://chua.vietnamcos.com/ | grep -o '<title>.*</title>'
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://chua.vietnamcos.com/js/temple.js
curl -sS https://chua.vietnamcos.com/api/stats.php
curl -sS https://chua.vietnamcos.com/api/shard.php
curl -sS -o /dev/null -w '%{http_code}\n' https://chua.vietnamcos.com/config.local.php
```

**Verify:**

- The title is `<title>An Tâm Nam Chùa</title>`.
- `temple.js` is `200` with a JavaScript content type.
- `stats.php` returns JSON numbers and `shard.php` returns `"enabled":true` with the `wss://…/ws` address.
- `config.local.php` is `404` (it is outside the web root).
- Open the site in two browsers, enter with two names and walk to each other. Each sees the other, the header says "Live · 2 here", and Enter opens chat.
- Sign in at https://chua.vietnamcos.com/admin/ with the admin password.

If Cloudflare serves an old copy, purge `chua.vietnamcos.com` in Cloudflare > Caching.

## 8. Candle payments (when the bank account is ready)

1. In `config.local.php` set `payments.bank_bin` (Napas BIN of the bank, for example `970436` for Vietcombank), `account_no`, `account_name` (as the bank prints it, no accents), `bank_label`, and `provider`.
2. **SePay:** in the SePay dashboard add a webhook to `https://chua.vietnamcos.com/api/payment-webhook.php`, authentication "API Key", and put the same key in `payments.sepay_api_key`.
   **PayOS:** put the checksum key in `payments.payos_checksum_key`, set `provider` to `payos`, and register the same webhook URL.
3. Set `payments.enabled` to `true`.
4. Offer a 10.000 ₫ candle yourself. The QR scans in your banking app with the amount and memo filled in; within a minute of paying, the window says the candle is lit and it appears on the stand.

**Verify:** the admin "Candles" tab shows the order as `paid`, and https://chua.vietnamcos.com/donations.php shows the total. A transfer with a mistyped memo appears under "Transfers that matched no order".

## 9. Monitoring

- `curl -s http://127.0.0.1:9502/metrics` on the server gives Prometheus text: visitors, shards, messages, bytes out, memory. Point Prometheus at it (`scrape_configs: - job_name: chua, static_configs: [{targets: ['127.0.0.1:9502']}]`). It is not reachable from outside: nginx only proxies `/ws`.
- `journalctl -u chua-realtime -f` shows the realtime log.

## 10. More visitors: a second realtime node

With Redis on, each node announces itself and `api/shard.php` sends new visitors to the least busy one. Invite links find the right node.

```bash
$SSH "sed 's/--port=9502 --node=node1/--port=9503 --node=node2 --url=wss:\/\/chua.vietnamcos.com\/ws2/' /etc/systemd/system/chua-realtime.service > /etc/systemd/system/chua-realtime2.service && systemctl daemon-reload && systemctl enable --now chua-realtime2"
```

Add a `location /ws2 { ... proxy_pass http://127.0.0.1:9503; ... }` block (copy of `/ws`) and reload nginx. Load-test before a big day with `k6 run -e URL=wss://chua.vietnamcos.com/ws -e VUS=2000 tests/load/k6_walkers.js` from your PC.

## Updating later

Repeat step 3 from a fresh `main`, run any new `sql/*.sql` file, then `systemctl restart chua-realtime`. Bump `asset_version` in `config.php` on each release so browsers fetch the new CSS and JS.

## Rollback

```bash
$SSH "systemctl disable --now chua-realtime; rm /etc/nginx/sites-enabled/chua.vietnamcos.com && nginx -t && systemctl reload nginx"
```

The subdomain then falls back to what it served before. The files and database can stay.
