# 3DEEZI website: test server setup

This folder is the complete, built website. It contains the Laravel API and database layer, plus the compiled React frontend in `public/build`.

The Android and iPhone apps connect to this same server. People register or sign in once, and their projects show up both in the apps and on the website.

## Requirements

- PHP 8.2 or newer, with these extensions: `pdo_sqlite` (or `pdo_mysql`), `mbstring`, `openssl`, `fileinfo`, `curl`, `tokenizer`, `xml`, `ctype`.
- Apache (with `mod_rewrite`) or Nginx.
- HTTPS is recommended. Plain `http://` works for testing.
- Node.js and Composer are **not** needed on the server: the frontend is already built and `vendor/` is included.

## Install

1. Upload the folder to the server, for example to `/var/www/3deezi`.
2. Point the site's document root at the **`public/`** folder.
   - On shared hosting you can instead upload the whole folder into any folder or sub-folder (e.g. `public_html/3deez`). The `index.php` and `.htaccess` in this folder handle that (Apache or LiteSpeed). Set `APP_URL` to the full address, including the sub-folder.
3. Create the settings file:
   ```bash
   cd /var/www/3deezi
   cp .env.example .env
   ```
   Then edit `.env`:
   - `APP_URL`: the site's address, e.g. `https://test.3deezi.com`.
   - `CORS_ALLOWED_ORIGINS`: the same address.
   - `OPENAI_API_KEY`: your OpenAI key. Leave it empty to use the built-in non-AI designs.
4. Run these once:
   ```bash
   php artisan key:generate
   php artisan migrate --force
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   ```
5. Give the web server write access to `storage/`, `bootstrap/cache/` and `database/`:
   ```bash
   chown -R www-data:www-data storage bootstrap/cache database
   chmod -R ug+rw storage bootstrap/cache database
   ```

## Upload size

Saved designs include images (logo, sponsor, AI pattern, renders and a 3D preview), so one save can be 10 to 25 MB.

- **PHP** (`php.ini`):
  ```ini
  post_max_size = 40M
  upload_max_filesize = 40M
  memory_limit = 512M
  ```
- **Nginx** (inside `server { }`):
  ```nginx
  client_max_body_size 40m;
  ```
- **AI requests** can take up to 2 minutes. Allow that:
  - Nginx: `fastcgi_read_timeout 180;`
  - PHP: `max_execution_time = 180`

## Example Nginx site

```nginx
server {
    listen 80;
    server_name test.3deezi.com;
    root /var/www/3deezi/public;
    index index.php index.html;
    client_max_body_size 40m;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_read_timeout 180;
    }

    location ~ /\.(?!well-known) {
        deny all;
    }
}
```

## Check it works

- Open `https://YOUR-SERVER/api/v1/catalog`. You should see JSON. Its `provider.name` field shows whether OpenAI is connected.
- Open `https://YOUR-SERVER/`. You should see the website. Register an account there.

## Connect the apps

In the app, open **Sign in**, tap **Server: not set** under the form, and enter the server address. You can also change it later under **Profile → Server**.

After that, register or sign in. Every project you save uploads to this server and also appears on the website.

## Updating later

Upload the new files, keeping `.env`, `database/database.sqlite` and `storage/app/`. Then run:

```bash
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

## Admin panel

Open `https://YOUR-SERVER/admin` while signed in as an administrator. You'll see Overview, Users and Orders, and you can add, edit and delete users and orders there.

- **Create the first administrator** (needs a terminal on the server):
  ```bash
  php artisan admin:create you@example.com --name="Your Name"
  ```
  This prints a generated password. Add `--password=...` to choose your own. Running it for an existing account gives that account admin access.
- **Without a terminal:** the ready-to-run package for the test server already includes an administrator account.
- **More administrators:** in the admin panel, open **Users**, edit the person, and tick **Administrator**.
