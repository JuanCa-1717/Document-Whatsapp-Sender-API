# WhatsApp Document Sender — Client Documentation

Base URL
- https://document-whatsapp-sender-api.onrender.com/

Description
- HTTP service to send WhatsApp messages and documents. Clients interact with the endpoints listed below; the WhatsApp session is managed on the server.

Quickstart (client example)

- Connect a client (generates a QR if needed):
```bash
curl -X POST "https://document-whatsapp-sender-api.onrender.com/connect/my-client"
```

- Check connection status:
```bash
curl "https://document-whatsapp-sender-api.onrender.com/connect/my-client"
```

- View QR in the browser:
```
https://document-whatsapp-sender-api.onrender.com/qr/my-client
```

- Download QR as PNG:
```bash
curl -s "https://document-whatsapp-sender-api.onrender.com/qr/my-client" -o qr.png
```

- Send a text message:
```bash
curl -X POST "https://document-whatsapp-sender-api.onrender.com/send/my-client" \
  -H "Content-Type: application/json" \
  -d '{"telefono":"506XXXXXXXX","caption":"Hello from the API"}'
```

- Send a document (server downloads the file and sends it):
```bash
curl -X POST "https://document-whatsapp-sender-api.onrender.com/send/my-client" \
  -H "Content-Type: application/json" \
  -d '{"telefono":"506XXXXXXXX","url_documento":"https://example.com/doc.pdf","caption":"Your document"}'
```

- Simple session status:
```bash
curl "https://document-whatsapp-sender-api.onrender.com/status/my-client"
```

Endpoints (summary)

- POST /connect/{clientId}
  - Creates/connects a session and returns a QR if applicable.

- GET /connect/{clientId}
  - Returns session status and QR URL.

- GET /qr/{clientId}
  - Returns the QR as PNG (200) or 404 if not available.

- POST /send/{clientId}
  - Sends a text message or document. Request JSON (`telefono` required):

```json
{
  "telefono": "506XXXXXXXX",
  "url_documento": "https://example.com/doc.pdf",
  "caption": "Caption text"
}
```

- GET /status/{clientId}
  - Simple status: `{ clientId, status, connected }`.

Example responses

- Success (send):
```json
{
  "estado": "enviado",
  "mensaje": "Documento enviado correctamente",
  "id_mensaje": "ABC123",
  "destinatario": "506XXXXXXXX"
}
```

- Failure (client not connected):
```json
{ "estado": "fallido", "mensaje": "Cliente no conectado" }
```

Notes for clients
- The WhatsApp session is managed on the server; clients only interact via HTTP.
- If the hosting platform mounts persistent storage at `/data`, sessions survive restarts. Ask your provider if unsure.

Support and limits
- Define limits and SLA with the provider. For production we recommend rate-limiting and monitoring.

Contact
- For technical assistance or integrations, reply with your use case and we will provide tailored examples.


*** End Patch
