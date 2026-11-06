# Hosting on Hostinger (or other shared hosting)

The temple runs on ordinary shared hosting with PHP and MySQL. Nothing needs to run in the background: in **shared hosting** mode each visitor's page checks in about once a second through `api/live.php`, and the database keeps track of who is where. A setup page does the rest on the first visit.

| | Shared hosting (this guide) | VPS (`DEPLOY.md`) |
|---|---|---|
| Live movement | about 1 update a second, smoothed | 10 updates a second |
| Visitors at once | about 50 to 150, depending on the plan | about 1,000 per server; thousands with OpenSwoole; more with extra servers |
| What you install | nothing | a background service, nginx settings, optionally Redis |
| Everything else (halls, candles, wishes, chat, admin) | the same | the same |

## What you need

- A Hostinger **Premium**, **Business** or **Cloud** web hosting plan (any shared host with PHP 8.1+, MySQL/MariaDB and `.htaccess` works the same way).
- The subdomain `chua.vietnamcos.com` pointing at it.

## 1. Add the site

1. hPanel → **Websites** → your plan → **Domains** → **Subdomains**: create `chua` on `vietnamcos.com`. Note the folder Hostinger gives it (for example `public_html/chua`).
2. DNS is on Cloudflare: add an **A** record `chua` pointing to the IP hPanel shows for your plan (hPanel → **Hosting** → **Details**). Keep the orange cloud on, and set Cloudflare **SSL/TLS** to **Full**.
3. hPanel → **Security** → **SSL**: install the free certificate for the subdomain.

## 2. PHP and the database

1. hPanel → **Advanced** → **PHP Configuration**: choose **PHP 8.3** (8.1 or newer works). Under extensions, make sure `pdo_mysql`, `mbstring` and `intl` are on.
2. hPanel → **Databases** → **MySQL Databases**: create a database and a user with a strong password. Hostinger adds a prefix, so the names look like `u123456789_chua`. Write down the database name, user and password.

## 3. Upload the code

Either way, the whole repository goes into the subdomain's folder. The `.htaccess` file at the top sends visitors to `public/` and refuses every other folder, so settings and code are never served.

- **With Git (easiest to update later):** hPanel → **Advanced** → **Git** → repository `https://github.com/khangkhangg/chua.git`, branch `main`, directory = the subdomain folder (it must be empty) → **Create**, then **Deploy**.
- **With a ZIP:** on GitHub, **Code** → **Download ZIP**. In hPanel **File Manager**, upload it into the subdomain folder, extract, and move the contents of `chua-main/` up one level so `config.php` and `.htaccess` sit directly in the folder. Turn on "show hidden files" to check `.htaccess` is there.

## 4. Run the setup page

Open `https://chua.vietnamcos.com`. A fresh install opens the setup page:

1. It checks the server. Fix anything marked ✕ in hPanel and reload.
2. **Where is it hosted?** Choose **Shared hosting**.
3. **Database:** address `localhost`, plus the name, user and password from step 2.
4. **The temple:** an admin password of 10 characters or more. Keep "behind Cloudflare" ticked.
5. **Candle payments:** leave off for now, or fill in the bank details and the SePay/PayOS key.
6. Press **Check the database and set up**. It creates the tables and saves `config.local.php`, then locks itself.

If it says it could not save the settings file, it shows the file's content: create `config.local.php` next to `config.php` in File Manager and paste it in.

## 5. Check it

- Open the temple in two browsers (or a phone and a computer), enter two names and walk to each other. Each should see the other within a second or two, and the header says "Live · 2 here". Press Enter to chat.
- Sign in at `https://chua.vietnamcos.com/admin/` with the admin password.
- `https://chua.vietnamcos.com/config.local.php` must give **403 Forbidden**.

## 6. Candle payments

Add the bank details to `config.local.php` (File Manager → edit; see `config.local.example.php`), set `'enabled' => true` under `payments`, and register `https://chua.vietnamcos.com/api/payment-webhook.php` in your SePay (authentication "API Key") or PayOS dashboard. Offer one 10.000 ₫ candle yourself: it should light within a minute, show on the admin **Candles** tab and on `/donations.php`.

## Updating

- With Git: hPanel → **Git** → **Deploy**. Your `config.local.php` is kept.
- With a ZIP: upload the new files over the old ones, keeping `config.local.php`.

After an update, bump `asset_version` in `config.php` if visitors still see the old version, or purge the Cloudflare cache. If the update brings a new `sql/*.sql` file, run it in hPanel → **phpMyAdmin** → your database → **Import**.

## How many people can it carry?

Every visitor checks in once a second (every two seconds while nobody else is near). On the test machine one PHP + MySQL request costs about 13 ms of server time, so a single process carries roughly 75 people at once; shared plans run several processes, but also cap CPU. Expect **about 50 to 150 people at once**, more on Business or Cloud plans than on Premium.

Measure your own plan from your computer (needs PHP with curl):

```bash
php tests/load/poll_bots.php --url=https://chua.vietnamcos.com --bots=50 --seconds=30
```

It prints check-ins per second and response times. If the median climbs above about 300 ms, either set `'poll_ms' => 1500` under `realtime` in `config.local.php` (smoother for the host, slightly less lively), or move to a VPS: Hostinger's KVM VPS plans run the faster live server with `DEPLOY.md`. To switch, delete `config.local.php` and run the setup page again, choosing **VPS**.

## Troubleshooting

| What you see | Fix |
|---|---|
| Error 500 on every page | PHP is older than 8.1, or `pdo_mysql` is off (step 2.1). |
| The setup page does not open; a file list or 404 appears | `.htaccess` was not uploaded, or the files are one folder too deep (step 3). |
| "The database refused the user or password" | Copy the full prefixed names from hPanel, and check the user is added to the database. |
| Visitors do not see each other | Open `/api/shard.php`: it should say `"mode":"poll"`. Check the browser console for errors from `api/live.php`. |
| Candle payment notices are refused (401) | Re-check the SePay key. The `.htaccess` in `public/` already passes the Authorization header through. |
| Live tables use InnoDB, not MEMORY | Fine. Some hosts refuse MEMORY tables; setup falls back automatically. Check-ins are a little slower. |
