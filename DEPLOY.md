# Deploy runbook: chua.vietnamcos.com

Run these steps by hand, in order. Each step ends with a **Verify**; do not continue until it passes.

Facts:

- Host: Hetzner **spo2x**, reached over Tailscale: `ssh -i ~/.ssh/spo2x_admin root@100.71.6.80`.
- New docroot: `/var/www/duykhang/chua` (the web root is its `public/` folder). Nothing else on the server changes except one new nginx site file.
- DNS: `chua.vietnamcos.com` already resolves through Cloudflare. Right now it falls through to another site (the bank statement converter), so it needs its own nginx `server` block.
- The app is plain PHP plus static files. There is no database, Composer or npm step yet. Three.js and the fonts load from public CDNs.

Commands are written for Git Bash on your PC, from the root of a clone of `khangkhangg/chua` on `main`:

```bash
SSH="ssh -i ~/.ssh/spo2x_admin root@100.71.6.80"
DEST=/var/www/duykhang/chua
```

## 0. Local check

```bash
git checkout main && git pull
php -S localhost:8000 -t public      # open http://localhost:8000, then Ctrl+C
```

**Verify:** the temple loads, and the browser console shows no errors.

## 1. Pre-flight on spo2x (read-only)

```bash
$SSH "php -v | head -1; ls /run/php/"
$SSH "grep -nE 'listen|ssl_certificate|fastcgi_pass|real_ip|server_name' /etc/nginx/sites-enabled/vietnamcos.com"
$SSH "grep -rln 'chua.vietnamcos.com' /etc/nginx/sites-enabled/ || echo 'no site for chua yet'"
```

**Verify:**

- Note the PHP-FPM socket name (for example `php8.4-fpm.sock`) and the `listen`/`ssl_certificate` lines from the vietnamcos.com site. Step 3 copies them.
- If a site for `chua.vietnamcos.com` already exists, stop and check what it serves before changing anything.

## 2. Upload

```bash
$SSH "mkdir -p $DEST"
rsync -av --delete -e "ssh -i ~/.ssh/spo2x_admin" \
  --exclude '.git' --exclude 'docs' --exclude 'DEPLOY.md' \
  ./ root@100.71.6.80:$DEST/
$SSH "chown -R www-data:www-data $DEST && find $DEST -type d -exec chmod 755 {} + && find $DEST -type f -exec chmod 644 {} +"
```

No rsync in Git Bash? Use `scp -r -i ~/.ssh/spo2x_admin config.php public README.md root@100.71.6.80:$DEST/` instead.

**Verify:** `$SSH "ls $DEST $DEST/public $DEST/public/js"` lists `config.php`, `public/index.php`, `public/css/temple.css` and `public/js/temple.js`.

## 3. nginx site

Create `/etc/nginx/sites-available/chua.vietnamcos.com`. Copy the `listen` and `ssl_certificate` lines exactly as step 1 printed them for vietnamcos.com, and use the FPM socket step 1 listed:

```nginx
server {
    server_name chua.vietnamcos.com;
    # listen ... ;            <- same as the vietnamcos.com site
    # ssl_certificate ... ;   <- same as the vietnamcos.com site (Cloudflare origin certificate)
    # ssl_certificate_key ... ;

    root /var/www/duykhang/chua/public;
    index index.php;

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

**Verify:** `nginx -t` says the syntax is ok, and the reload prints nothing.

## 4. Check it live

```bash
curl -sS https://chua.vietnamcos.com/ | grep -o '<title>.*</title>'
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://chua.vietnamcos.com/js/temple.js
curl -sS -o /dev/null -w '%{http_code}\n' https://chua.vietnamcos.com/../config.php
```

**Verify:**

- The first command prints `<title>An Tâm Nam Chùa</title>`.
- The second prints `200` with a JavaScript content type (`application/javascript` or `text/javascript`). A module script with the wrong type will not load.
- The third does not return `config.php` (it should be `400` or `404`).
- Open https://chua.vietnamcos.com in a browser, enter a name, walk through the gate and into a hall. The console should show no errors.

If Cloudflare serves an old copy, purge `chua.vietnamcos.com` in Cloudflare > Caching.

## Updating later

Repeat step 2 from a fresh `main`. Bump `asset_version` in `config.php` on each release so browsers fetch the new CSS and JS.

## Rollback

```bash
$SSH "rm /etc/nginx/sites-enabled/chua.vietnamcos.com && nginx -t && systemctl reload nginx"
```

The subdomain then falls back to what it served before. The files in `$DEST` can stay.
