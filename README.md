# WhatsApp Document Sender API

Generic client documentation for a REST API that sends WhatsApp messages and documents.

Note: this document is in English. A few request/response field names remain in Spanish because they are part of the API contract.

## Overview

This API allows clients to:
- Create and manage a WhatsApp connection session
- Retrieve QR code data for device linking
- Send text messages
- Send documents from a public file URL
- Check session status

## Base URL

Use your own deployed endpoint:

```text
YOUR_API_BASE_URL
```

Example:

```text
https://your-domain.com
```

## Main Endpoints

- `POST /connect/{clientId}`
  - Creates or reconnects a client session and may return QR data.

- `GET /connect/{clientId}`
  - Returns detailed connection status.

- `GET /qr/{clientId}`
  - Returns QR code image (PNG) when available.

- `POST /send/{clientId}`
  - Sends text or a document.

- `GET /status/{clientId}`
  - Returns simplified status (`connected` true/false).

## Request Example (Send Text)

```bash
curl -X POST "YOUR_API_BASE_URL/send/my-client" \
  -H "Content-Type: application/json" \
  -d '{"telefono":"COUNTRYCODE_NUMBER","caption":"Hello from API"}'
```

## Request Example (Send Document)

```bash
curl -X POST "YOUR_API_BASE_URL/send/my-client" \
  -H "Content-Type: application/json" \
  -d '{"telefono":"COUNTRYCODE_NUMBER","url_documento":"https://example.com/file.pdf","caption":"Optional caption"}'
```

## Body Fields for `/send/{clientId}`

```json
{
  "telefono": "COUNTRYCODE_NUMBER",
  "url_documento": "https://example.com/file.pdf",
  "caption": "Optional text"
}
```

- `telefono` (required): destination number with country code, no spaces.
- `url_documento` (optional): public file URL to send as document.
- `caption` (optional): message text or document caption.

## Contract Field Names (Must Keep)

The following field names should not be translated in client integrations:

- Request fields: `telefono`, `url_documento`, `caption`
- Response fields: `estado`, `mensaje`, `id_mensaje`, `destinatario`

## Example Responses

Success (actual API response):

```json
{
  "estado": "enviado",
  "mensaje": "Documento enviado correctamente",
  "id_mensaje": "ABC123",
  "destinatario": "COUNTRYCODE_NUMBER"
}
```

Error (actual API response):

```json
{
  "estado": "fallido",
  "mensaje": "Cliente no conectado"
}
```

## Notes

- Keep the same `clientId` to reuse an existing linked session.
- For production deployments, monitor uptime and logs.
- Avoid exposing private infrastructure URLs or internal credentials in public docs.
