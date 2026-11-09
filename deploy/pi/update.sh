#!/usr/bin/env bash
# Pulls the latest code onto the Pi, applies database changes and restarts the live server.
#   sudo bash /var/www/chua/deploy/pi/update.sh [--branch=main]
set -euo pipefail
DEST=/var/www/chua
BRANCH=$(git -C "$DEST" rev-parse --abbrev-ref HEAD)
for a in "$@"; do
  case "$a" in
    --branch=*) BRANCH="${a#*=}" ;;
    --dest=*) DEST="${a#*=}" ;;
    *) echo "Unknown option: $a" >&2; exit 2 ;;
  esac
done
[ "$(id -u)" = 0 ] || { echo "Run it with sudo." >&2; exit 1; }

git config --global --add safe.directory "$DEST" 2>/dev/null || true
git -C "$DEST" fetch -q origin "$BRANCH"
git -C "$DEST" checkout -q -B "$BRANCH" "origin/$BRANCH"
git -C "$DEST" log --oneline -1
for f in "$DEST"/sql/*.sql; do mysql chua < "$f"; done   # every file is safe to run again
chown -R root:www-data "$DEST"
find "$DEST" -path "$DEST/.git" -prune -o -type f -exec chmod 644 {} +
chmod 640 "$DEST/config.local.php"
systemctl restart chua-realtime
systemctl reload php*-fpm 2>/dev/null || true
echo "updated. If browsers show the old look, purge the Cloudflare cache for the site."
