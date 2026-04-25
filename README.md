# MedTrack

MedTrack is a browser-based implementation of the Pharmaceutical Inventory and Expiry Monitoring System described in `MedTrack_SRS_Information.txt`.

## Run

Recommended:

1. Copy `.env.example` to `.env`
2. Add your Gemini key in `.env`
3. Run `node server.js`
4. Open `http://localhost:3000`

This app now requires the Node server because authentication, password changes, and shared inventory data are stored on the server.

Default login:

- Username: `admin`
- Password: `Admin@123`

Application data is stored in `data/medtrack-data.json`, so medicines, sales, alerts, receipts, and users persist across sessions on the server.

## Implemented SRS Modules

- Login authentication
- Create account
- Change password using old password
- Dashboard and main menu
- Medicine entry and inventory management
- Batch, supplier, barcode, expiry, price, and stock fields
- Barcode-based POS billing
- Sale confirmation and printable receipt
- Automatic stock update after sale
- Expiry categorization: `Expired`, `Expiring soon`, `Safe`
- Expiry alert screen
- Inventory, sales, and expiry reports
- CSV report export

## Notes

The SRS names Python and MySQL as the original backend stack. This version is a self-contained working web app for local use and demonstration. The data model follows the supplied medicine table, sales table, DFD flow, and ER diagram fields where they apply to the browser implementation.

Passwords are not stored in plain text. They are hashed on the server, and reset passwords must:

- match confirm password
- be at least 8 characters
- include a special character
- not match the last password

## Gemini Bill Scan Setup

Put your API key here:

- File: `.env`
- Variable: `GEMINI_API_KEY`

Example:

```env
GEMINI_API_KEY=your_real_key_here
PORT=3000
```

The bill import flow is available in the Medicines screen under `Import Wholesaler Bill`. Upload a bill PDF or image, review the extracted rows, then import them into inventory.

## Deployment

This project is ready to deploy as a public Node web service.

Recommended platform: Render.

Why Render for this app:

- it supports Node web services directly
- it gives you a public HTTPS URL
- it supports a persistent disk, which this app needs because user accounts and inventory are stored in `data/medtrack-data.json`

### Deploy on Render

1. Push this project to a GitHub repository.
2. Create a Render account and connect your GitHub account.
3. In Render, choose `New +` -> `Blueprint`.
4. Select your MedTrack repository.
5. Render will read [render.yaml](/Users/harmansingh/Downloads/MedTrack/render.yaml).
6. Before the first deploy, add this environment variable in Render:
   - `GEMINI_API_KEY=your_real_key`
7. Confirm the service settings and deploy.
8. When deploy finishes, Render gives you a public URL like:
   - `https://medtrack.onrender.com`

### Important production note

This Render setup uses a `starter` plan because Render persistent disks are for paid web services. Without a persistent disk, your users, medicines, and sales data would be lost on redeploy or restart.

### After deploy

1. Open the public URL in Chrome on any device.
2. Create a custom domain if you want a branded link.
3. Submit your domain to Google Search Console so it can appear in search results.

Important: because the app stores data in a local JSON file right now, a production deployment should use persistent disk on the hosting provider. If you want stronger multi-user production readiness next, the next step is moving users and inventory into a real database such as MySQL or PostgreSQL.
