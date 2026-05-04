# ZLA Backend (Zammad LAPS Automation)

Node.js backend service that automates Admin Privilege approvals from Zammad through Microsoft Teams and Microsoft Graph LAPS.

## Features

- Receives Zammad webhook on ticket creation (`Admin Privilege` flow)
- Extracts `PC-#####` tag from ticket body when needed
- Sends Teams Adaptive Card with `Approve` button
- Handles `Approve` action via Bot Framework endpoint
- Calls Microsoft Graph API to get LAPS password
- Sends result back to Zammad as internal article
- Closes Zammad ticket
- Logs all key steps with success/failure and reason

## Project Structure

```txt
src/
  index.js
  bot.js
  routes/
    zammad.js
    approve.js
  services/
    graph.js
    zammad.js
    teams.js
  utils/
    auth.js
.env
.env.example
package.json
Dockerfile
docker-compose.yml
README.md
```

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Fill all values.

```env
# Single-tenant fallback
MICROSOFT_APP_ID=
MICROSOFT_APP_PASSWORD=
TENANT_ID=

# Multi-tenant mode
# Example: TENANTS=FIRST,SECOND,THIRD
TENANTS=
FIRST_APP_ID=
FIRST_APP_PASSWORD=
FIRST_TENANT_ID=
SECOND_APP_ID=
SECOND_APP_PASSWORD=
SECOND_TENANT_ID=
THIRD_APP_ID=
THIRD_APP_PASSWORD=
THIRD_TENANT_ID=

# Zammad
ZAMMAD_URL=
ZAMMAD_TOKEN=

# Teams
TEAMS_SERVICE_URL=
TEAMS_CONVERSATION_ID=

# App
PORT=3000
BASE_URL=
```

If `TENANTS` is set, ZLA scans tenants in listed order and uses the first tenant where the device is found.

## Run Locally

```bash
npm install
npm start
```

Service starts on `http://localhost:3000`.

Health check:

```bash
curl http://localhost:3000/health
```

## Run with Docker

```bash
docker-compose up --build
```

## API Endpoints

### 1) Zammad Webhook

`POST /api/zammad`

Payload:

```json
{
  "ticket_id": 123,
  "customer": "John Doe",
  "lar_reason": "VS Code re-installation",
  "body": "Need admin access",
  "pc_tag": "PC-00036"
}
```

Notes:

- Service first uses `pc_tag` field from webhook payload.
- If `pc_tag` is empty, service tries to extract from `body` using regex: `PC-\d{5}`.
- If tag is still missing, service sends a Teams notification card about a new LAR request without PC tag and includes Open Ticket link.
- Example text supported:

```txt
My Laptop ID on the back cover of the laptop (with QR): PC-00036
Requesting temporary administrator access on my laptop for vs code re-installation.
```

### 2) Bot Framework Endpoint

`POST /api/messages`

- Used by Microsoft Bot Framework.
- Processes `Action.Submit`.
- If `action = approve`, runs approve flow.

### 3) Manual Approve Trigger (optional)

`POST /api/approve`

Payload:

```json
{
  "ticket_id": 123,
  "pc_tag": "PC-00036",
  "approved_by": "Admin User"
}
```

## Bot Registration (Microsoft)

1. Register app in Microsoft Entra ID.
2. Create Bot Channels Registration (or Azure Bot resource).
3. Set messaging endpoint:

```txt
https://<YOUR_PUBLIC_HOST>/api/messages
```

4. Put Bot App ID and Password into `.env` (the same credentials are used for Bot Framework and Graph API calls).
5. Set correct Teams conversation values (`TEAMS_SERVICE_URL`, `TEAMS_CONVERSATION_ID`) for proactive card delivery.
6. Bot application needs these API permissions:

```txt
DeviceLocalCredential.Read.All
DeviceManagementManagedDevices.PrivilegedOperations.All
DeviceManagementManagedDevices.Read.All
```

7. Don't forget that you need 1 application with provided api permissions for each tenant you using.

## Zammad Webhook Example

Create a webhook in Zammad that sends ticket data to:

```txt
https://<YOUR_PUBLIC_HOST>/api/zammad
```

Example body:

```json
{
  "ticket_id": "#{ticket.id}",
  "customer": "#{ticket.customer.fullname}",
  "customer_email": "#{ticket.customer.email}",
  "lar_reason": "#{ticket.lar_reason}",
  "pc_tag": "#{ticket.pc_tag}",
  "body": "#{article.body}"
}
```

## Logging

Terminal logs include:

- Webhook received
- PC tag extraction status
- Graph token request result
- Managed device lookup result
- LAPS password request result
- Zammad article creation result
- Ticket close result
- Failure reason when any step fails

## Important Graph API Calls

- Token:
  - `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- Find device:
  - `GET /deviceManagement/managedDevices?$filter=deviceName eq '{pc_tag}'`
- Get LAPS:
  - `GET /directory/deviceLocalCredentials/{id}?$select=id,deviceName,credentials`
  - Fallback by name: `GET /directory/deviceLocalCredentials?$filter=deviceName eq '{pc_tag}'`
