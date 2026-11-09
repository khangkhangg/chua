# An Tâm Nam Chùa

A Vietnamese mountain temple you can walk through in the browser: pixel-style 3D, day and night, seven halls to enter and pray in, monks, visitors, kids and a temple dog. Real visitors see each other and chat. Candles are offered by VietQR bank transfer.

## Hosting

Upload it and open the site: a **setup page** runs on the first visit, asks whether this is **shared hosting** or a **VPS**, checks the database, creates the tables and saves `config.local.php`.

- **Shared hosting** (Hostinger, cPanel): no background service; pages check in about once a second. About 50 to 150 people at once. Step by step: `HOSTINGER.md`.
- **VPS**: a realtime server with 10 updates a second, about 1,000 people per server and more with OpenSwoole or extra servers. Step by step: `DEPLOY.md`.
- **Raspberry Pi** (staging, at home): the same live server as a VPS, published through a Cloudflare Tunnel, so no open ports. One command: `deploy/pi/README.md`.

## Run it locally

Needs PHP 8.1+ with `pdo_mysql`, and MySQL 8 or MariaDB 10.6+. Redis (with the `redis` PHP extension) is optional.

```bash
mysql -uroot -e "CREATE DATABASE chua CHARACTER SET utf8mb4; CREATE USER 'chua'@'localhost' IDENTIFIED BY 'devpass'; GRANT ALL ON chua.* TO 'chua'@'localhost';"
```

```bash
mysql -uroot chua < sql/001_schema.sql
```

```bash
cp config.local.example.php config.local.php
```

Edit `config.local.php`: the database password, `realtime.public_url` set to `ws://127.0.0.1:9502`, and for trying candles `payments.enabled` and `payments.test_mode` set to `true`. Then start the realtime server and the site in two terminals:

```bash
php realtime/server.php
```

```bash
php -S localhost:8000 -t public
```

Open http://localhost:8000. Without `config.local.php` the setup page opens first; it can write the file for you. To try polling mode locally, set `realtime.mode` to `poll` and skip the realtime server.

## Tests

```bash
php tests/run.php
```

Needs a `chua_test` database loaded from `sql/001_schema.sql` (password from `CHUA_TEST_DB_PASS`, default `devpass`). Load tests:

```bash
php tests/load/bots.php --url=ws://127.0.0.1:9502 --bots=600 --seconds=20
```

```bash
k6 run -e URL=wss://chua.vietnamcos.com/ws -e VUS=10000 tests/load/k6_walkers.js
```

## Layout

```
config.php                 defaults; real values go in config.local.php (not committed)
sql/                       MySQL / MariaDB tables (001 main, 002 live visitors for shared hosting)
src/                       PHP: database, name filter, Redis bus, payments, realtime hub
realtime/server.php        realtime server (OpenSwoole if installed, plain PHP otherwise)
realtime/chua-realtime.service  systemd unit
public/index.php           the temple page (sends a fresh install to setup.php)
public/setup.php           first-run setup: hosting choice, database, admin password, payments
public/api/live.php        live visitors by polling (shared hosting)
.htaccess                  shared hosting: serve public/, refuse everything else
public/js/temple.js        the scene: world, halls, people, sound, controls, live visitors
public/js/net.js           connection to the realtime server
public/js/i18n.js          Vietnamese and English text
public/api/                session, shard, stats, wishes, candle, candles, payment-webhook, event
public/donations.php       public list of candle offerings
public/admin/              moderation and statistics (password in config.local.php)
tests/                     PHP tests and load tests
docs/PLAN.md               plan and feature checklist
DEPLOY.md                  deploy runbook for a VPS
HOSTINGER.md               deploy guide for shared hosting
deploy/pi/                 one-command install on a Raspberry Pi with a Cloudflare Tunnel
```
