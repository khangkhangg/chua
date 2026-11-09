# Market stalls for rent

The 12 stalls in the street market left of the front path can be rented by anyone for
50.000 đ a month, paid by bank transfer. Rented stalls show the vendor's shop name, logo,
website and a short menu to every visitor who walks up to them.

## Flow

1. A visitor walks within 3 m of an empty stall. The stall keeper says the stall is free and
   a dialog asks whether they want to rent it. "Yes" opens `/vendor/?slot=N` in a new tab.
2. The vendor page asks for an email address and sends a one-time sign-in link (15 minutes).
3. Signed in, the vendor picks 1 to 12 months. The stall is held for them for 30 minutes and the
   page shows a VietQR code with the amount and a `SAP` memo code filled in.
4. The vendor transfers and presses "Tôi đã chuyển khoản". The owner gets a Telegram message
   with a one-time link to `/admin/decide.php?t=…`.
5. The decide page shows the request and two buttons. Approve activates or extends the stall
   and emails the vendor. "Chưa nhận được" emails the vendor that the money has not arrived and
   puts the request back to waiting, so they can claim again.
6. The vendor sets the shop name, website (https only), logo (re-encoded to a 256 px PNG) and a
   menu of up to 12 items with prices. Changes are public within a minute.
7. A daily cron emails a reminder 3 days before a rental ends, frees stalls whose rental has
   ended, and expires unpaid requests and holds.
8. The admin can take a stall down for breaking the conduct policy (`/vendor/policy.php`), restore
   it, or free it.

Telegram fetches link previews by itself, so the link in the message never decides anything:
the decision is a POST from the page, and each claim rotates the token.

## Settings (`config.local.php`)

`stalls.price_month`, `stalls.remind_days`, `stalls.hold_minutes`, `mail.resend_key`,
`mail.from`, `telegram.bot_token`, `telegram.chat_id`, and the bank fields under `payments`.
Logos live in `/var/www/chua-uploads/logos` (outside the code, which `update.sh` resets) and are
served by nginx at `/uploads/` with scripts blocked.

## Checklist

- [x] Keys and bank details copied into `config.local.php` on the Pi
- [x] Migration `003_stalls.sql`: vendors, vendor_logins, stalls (12 slots), stall_rentals
- [x] `Chua\Stalls`, `Chua\Vendors`, `Chua\Notify` (Resend email, Telegram) with unit tests in `tests/run.php` (131 pass)
- [x] `api/stalls.php` public list; stall dialogs in the market
- [x] Vendor page: sign-in link, rent and pay, claim, profile, logo, menu, renew
- [x] Admin: stalls and rentals tabs, takedown and restore, decide page
- [x] Cron `scripts/stalls-cron.php`; installer: php-gd, uploads folder, nginx `/uploads/`, cron line
- [x] Deployed to the Pi staging site and run end to end over HTTP, with real email and Telegram sends (2026-11-09)
- [ ] In-world dialogs checked in a browser (Chrome screenshots were down during the build)
