# Microservicio de Transacciones (ms-3)

Este microservicio actúa como un orquestador para gestionar transferencias de dinero entre cuentas. Implementa el patrón Saga para asegurar la consistenza de los datos a través de múltiples pasos que, en un futuro, involucrarán a otros microservicios (como `ms-2` para operaciones de cuentas y `ms-4` para compliance).

Actualmente, utiliza mocks internos para simular las llamadas a estos servicios externos, pero está diseñado para reemplazarlos fácilmente por llamadas de red reales.

## Cómo Empezar

### Prerrequisitos

- Node.js (v18 o superior)
- npm o yarn

### Instalación

1. Clona el repositorio.
2. Instala las dependencias:
   ```bash
   npm install
   ```

### Ejecución

Para iniciar el servidor en modo de desarrollo con recarga automática:

```bash
npm run dev
```

Para iniciar el servidor para producción:

```bash
npm start
```

El servidor se ejecutará en `http://localhost:3000` por defecto.

---

## API Endpoints

A continuación se detallan los endpoints disponibles en este microservicio.

### 1. Crear una Transacción

Inicia una nueva transferencia de dinero. El microservicio recibe la solicitud, crea un registro de la transacción en estado `pending` y responde inmediatamente con un `202 Accepted`. Luego, procesa la transacción de forma asíncrona siguiendo los pasos de la saga (compliance, débito, crédito).

- **URL**: `/transactions`
- **Método**: `POST`
- **Cuerpo de la Petición (Body)**:
  ```json
  {
    "transactionType": "transfer",
    "sourceAccountId": "string",
    "destinationAccountId": "string",
    "amount": {
      "value": "number",
      "currency": "string"
    },
    "description": "string (opcional)"
  }
  ```
- **Respuestas**:
  - **`202 Accepted`**: La transacción ha sido recibida y está siendo procesada.
    ```json
    {
      "transactionId": "string",
      "status": "pending",
      "message": "Transaction received and is being processed."
    }
    ```
  - **`400 Bad Request`**: Si faltan campos obligatorios, las cuentas de origen y destino son las mismas, o el `transactionType` no es `transfer`.
    ```json
    {
      "code": "INVALID_REQUEST" | "MISSING_FIELDS" | "SAME_ACCOUNT",
      "message": "string"
    }
    ```

---

### 2. Obtener el Estado de una Transacción

Recupera los detalles y el estado actual de una transacción específica usando su ID.

- **URL**: `/transactions/:transactionId`
- **Método**: `GET`
- **Parámetros de URL**:
  - `transactionId` (string, **requerido**): El ID de la transacción.
- **Respuestas**:
  - **`200 OK`**: Devuelve el registro completo de la transacción.
    ```json
    {
      "transactionId": "string",
      "status": "pending" | "processing" | "completed" | "failed",
      "timestamp": "string (ISO 8601)",
      "sourceAccountId": "string",
      "destinationAccountId": "string",
      "amount": { "value": "number", "currency": "string" },
      "description": "string"
    }
    ```
  - **`404 Not Found`**: Si no se encuentra una transacción con el ID proporcionado.
    ```json
    {
      "code": "TRANSACTION_NOT_FOUND",
      "message": "Not found"
    }
    ```

---

### 3. Listar Transacciones de una Cuenta

Obtiene una lista paginada de las transacciones (tanto débitos como créditos) asociadas a una cuenta específica.

- **URL**: `/accounts/:accountId/transactions`
- **Método**: `GET`
- **Parámetros de URL**:
  - `accountId` (string, **requerido**): El ID de la cuenta.
- **Parámetros de Consulta (Query)**:
  - `limit` (number, opcional, por defecto: `20`): Número máximo de transacciones a devolver.
  - `offset` (number, opcional, por defecto: `0`): Número de transacciones a omitir para la paginación.
- **Respuestas**:
  - **`200 OK`**: Devuelve una lista de transacciones.
    ```json
    {
      "accountId": "string",
      "transactions": [
        {
          "transactionId": "string",
          "timestamp": "string (ISO 8601)",
          "type": "debit" | "credit",
          "amount": { "value": "number", "currency": "string" },
          "description": "string"
        }
      ]
    }
    ```

---

### 4. Obtener Saldo de una Cuenta (Helper)

Endpoint de ayuda para depuración que devuelve el saldo actual de una cuenta según los mocks.

- **URL**: `/accounts/:accountId/balance`
- **Método**: `GET`
- **Respuestas**:
  - **`200 OK`**: Devuelve el saldo de la cuenta.
  - **`404 Not Found`**: Si la cuenta no existe en los mocks.