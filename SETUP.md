# Setup
start app 
`php -S localhost:3000`
## Requirements
- PHP hosting (Hostinger, any shared hosting with PHP 7.4+)

## Deploy
1. Upload all files to your hosting root (`public_html/`)
2. Create the `data/` directory if it doesn't exist
3. Make sure `data/` is writable by the web server (`chmod 755 data/`)
4. Open your domain in a browser

No Node.js, no build step, no database.

## How it works
- `api.php` handles all data read/write to `data/schedule-data.json`
- All devices share the same data file on the server
- Click the refresh button to pull latest data from the server
- Each new day auto-copies settings from the previous day

## Pages
- `/` — Daily schedule (home)
- `/sleep.html` — Sleep calculator
- `/analysis.html` — Work period analysis
