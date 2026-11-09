# Staging on a Raspberry Pi: chua.vietnamcos.com

The Pi runs everything itself: nginx, PHP, MariaDB and the live server (full speed, 10 updates a second). A **Cloudflare Tunnel** carries `chua.vietnamcos.com` to it, so the Pi needs no public IP, no open router ports and no certificate. Cloudflare provides HTTPS, and WebSockets work through the tunnel.

```
visitor ── https://chua.vietnamcos.com ── Cloudflare ══ tunnel ══ cloudflared on the Pi
                                                                     │
                                                    nginx 127.0.0.1:8080 ── PHP-FPM ── MariaDB
                                                         └─ /ws ── chua-realtime 127.0.0.1:9502
```

Nothing listens outside the Pi itself: nginx and the live server bind to 127.0.0.1, and only the tunnel reaches them.

## What you need

- A Raspberry Pi 4 or 5 (2 GB or more) with Raspberry Pi OS 64-bit (Bookworm or newer), or Debian/Ubuntu. PHP 8.1 or newer comes from its packages.
- SSH access to it (from a terminal, or from Cursor with **Remote-SSH**).
- The Cloudflare account that holds `vietnamcos.com`.

## 1. Create the tunnel (Cloudflare dashboard, 3 minutes)

1. **DNS** → Records: if there is already a record named `chua`, delete it. The tunnel creates its own, and refuses while the old one exists.
2. **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared**. Name it `pi-staging`.
3. On the "Install connector" page, choose Debian / arm64. The command shown ends with a long token after `service install`. **Copy only the token.** The script asks for it in step 2, so don't run Cloudflare's command yourself.
4. **Next** → Public hostname: subdomain `chua`, domain `vietnamcos.com`, service type **HTTP**, URL `localhost:8080` → **Save**.

If this Pi already runs a tunnel for something else, skip 2 and 3: open that tunnel and add the public hostname from step 4. The script sees the existing tunnel and leaves it alone.

## 2. Install (on the Pi, one command)

```bash
curl -fsSL https://raw.githubusercontent.com/khangkhangg/chua/main/deploy/pi/install.sh -o install.sh && sudo bash install.sh
```

Until the pull request with these files is merged, use the branch instead:

```bash
curl -fsSL https://raw.githubusercontent.com/khangkhangg/chua/claude/an-tam-nam-chua/deploy/pi/install.sh -o install.sh && sudo bash install.sh --branch=claude/an-tam-nam-chua
```

It takes 3 to 10 minutes on a Pi. It then:

1. Installs nginx, PHP, MariaDB and git.
2. Clones the code to `/var/www/chua`.
3. Creates the `chua` database with a random password, kept in `/root/.chua-db-pass`.
4. Writes `config.local.php` with a random admin password, saved in `/root/chua-admin-password.txt`.
5. Starts the live server as the `chua-realtime` service.
6. Sets up nginx.
7. Checks the site answers.
8. Asks for the tunnel token. It isn't shown while you type.

Options:

- `--test-payments`: candles get a "pretend I paid" button, for trying the flow without a bank. Staging only.
- `--no-tunnel`: skip Cloudflare.
- `--port=8081`: use another local port if 8080 is taken. Change the tunnel's URL to match.
- `--redis`: add Redis.

You can run it again at any time. It keeps the database, the passwords and the settings.

## 3. Check it

```bash
sudo cat /root/chua-admin-password.txt
systemctl status chua-realtime cloudflared --no-pager | grep -E '●|Active'
curl -s http://127.0.0.1:8080/api/shard.php
```

Then open `https://chua.vietnamcos.com` in two browsers, enter two names and walk to each other. The header should say "Live · 2 here". Sign in at `/admin/` with the password above.

## Updating

```bash
sudo bash /var/www/chua/deploy/pi/update.sh
```

It pulls the latest code on the same branch, applies database changes and restarts the live server. Add `--branch=main` to switch branch.

## Troubleshooting

| What you see | Fix |
|---|---|
| Cloudflare error 1033 | The tunnel is not running: `sudo systemctl restart cloudflared`, then `journalctl -u cloudflared -n 30`. |
| Error 502 from Cloudflare | The tunnel's service URL must be `http://localhost:8080`, not https. |
| The page loads, but visitors don't see each other | `journalctl -u chua-realtime -n 30`; `curl -s http://127.0.0.1:9502/metrics`. |
| "record already exists" when saving the hostname | Delete the old `chua` DNS record (step 1.1). |
| The old look after an update | Purge the cache for the site in Cloudflare → Caching. |

A Pi carries a few hundred visitors at once with the plain-PHP live server, plenty for staging. For production numbers, see `DEPLOY.md`.

## Removing it

```bash
sudo systemctl disable --now chua-realtime && sudo rm /etc/nginx/sites-enabled/chua && sudo systemctl reload nginx
```

Delete the public hostname in the tunnel to free the subdomain.
