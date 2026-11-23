# Storque INDUSTRIES — Android Marketplace Starter

Standalone marketplace foundation: Customer Android app, Seller Android app, Rider Android app, Admin web dashboard, Express API, PostgreSQL database.

## Start backend
Install Docker Desktop, then from this folder run:
```bash
docker compose up --build
```
API health: http://localhost:4000/api/health

Admin account: created on first startup from `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` environment variables. There is no default admin password.

## Run each Android app
In each of `customer-app`, `seller-app`, `rider-app`:
```bash
npm install
npx expo start
```
Set `EXPO_PUBLIC_API_URL` to `http://10.0.2.2:4000/api` for Android emulator, or `http://YOUR_LAN_IP:4000/api` for a physical phone.

## Build APK
In each app folder, configure Expo EAS:
```bash
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

## Admin dashboard
```bash
cd admin-web && npm install && npm run dev
```
Default API URL is `http://localhost:4000/api`.

## Included
- Separate Expo Android projects for customer, seller and rider
- Shared Express API and PostgreSQL schema
- JWT login and role checks
- All customer, seller, and rider registrations require admin approval before login and protected actions
- Product browsing and seller product creation
- Customer order checkout with COD / GCash / Maya / bank transfer / card payment records
- Seller order status management endpoint
- Rider delivery queue and status updates
- Admin overview and seller/rider approval dashboard

## Production requirements
Payment options are recorded as payment methods, not live payment processing. Live GCash/Maya/card processing requires merchant accounts, provider SDK/API credentials, hosted checkout and verified webhooks. Never collect or store card numbers/CVV in this app. Bank transfers need reconciliation. Before public launch add HTTPS, managed database/backups, password reset, verification, audit logs, privacy/terms, seller KYC, refunds/disputes, image storage, GPS consent and proof-of-delivery storage. This is an MVP starter, not a production-certified marketplace.
