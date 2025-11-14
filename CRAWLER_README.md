# DealMachine Login Crawler

This Crawlee script uses Playwright to navigate to the DealMachine login page and fill in placeholder credentials.

## Features

- Uses Crawlee's PlaywrightCrawler for robust browser automation
- Fills in email and password fields with placeholder values
- Takes screenshots for verification
- Saves results to a dataset
- Runs in headful mode so you can see the automation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers (if not already installed):
```bash
npx playwright install chromium
```

## Usage

Run the crawler:
```bash
npm start
```

Or directly:
```bash
node dealmachine-crawler.js
```

## What it does

1. Navigates to https://app.dealmachine.com/
2. Waits for the login form to load
3. Fills in the email field with: `user@example.com`
4. Fills in the password field with: `placeholder123`
5. Takes a screenshot and saves it to `./storage/screenshots/`
6. Saves form data to the dataset in `./storage/datasets/`

## Output

- **Screenshots**: `./storage/screenshots/dealmachine-login-filled.png`
- **Dataset**: `./storage/datasets/default/` (JSON files with crawl results)

## Configuration

You can modify the crawler behavior in `dealmachine-crawler.js`:

- **Viewport**: Set to 1440x900 (MacBook Pro 13"/14" standard resolution)
- Change `headless: false` to `headless: true` to run without UI
- Modify placeholder values in the `page.fill()` calls
- Adjust timeouts and wait conditions as needed
- Customize viewport dimensions in `launchContext.launchOptions.viewport`

## Input Selectors Used

- Email: `input[name="email"]`
- Password: `input[name="password"]`
- Login Button: `button:has-text("Continue With Email")`

## Notes

- The script does NOT submit the form (click the login button) by default
- This is for demonstration purposes with placeholder credentials
- Modify the script to add actual login logic if needed

