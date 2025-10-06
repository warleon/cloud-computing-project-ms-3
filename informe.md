--- /dev/null
+++ b/d:/workspace/Cloud-Computinh-hito1/cloud-computing-project-ms-3/informe.md
@@ -0,0 +1,189 @@
+# Informe Técnico: Microservicio de Transacciones (ms-3)
+
+**Versión:** 1.0.0
+**Fecha:** 2024-08-01
+
+## 1. Propósito y Rol en la Arquitectura
+
+El **Microservicio de Transacciones (ms-3)** actúa como el **orquestador central** para todas las operaciones de transferencia de dinero dentro del sistema. Su responsabilidad principal no es almacenar datos de cuentas ni saldos, sino garantizar que una transferencia monetaria se complete de manera segura y consistente, coordinando las acciones entre otros microservicios especializados.
+
+Para lograr esto, implementa el **Patrón de Diseño Saga**, que permite gestionar transacciones que abarcan múltiples servicios. Este enfoque asegura que, si un paso del proceso falla, se puedan tomar acciones compensatorias para mantener la integridad del sistema.
+
+## 2. Tecnologías Utilizadas
+
+El microservicio está construido sobre un stack moderno de JavaScript/TypeScript:
+
+- **Entorno de Ejecución:** Node.js (v20)
+- **Framework Web:** Express.js
+- **Lenguaje:** TypeScript
+- **Documentación de API:** Swagger (con `swagger-jsdoc` y `swagger-ui-express`)
+- **Pruebas (Testing):** Jest y Supertest
+- **Contenerización:** Docker
+- **Variables de Entorno:** `dotenv`
+
+## 3. Funcionalidades y Endpoints de la API
+
+La API expone los siguientes endpoints para gestionar las transacciones:
+
+### `POST /transactions`
+- **Descripción:** Inicia una nueva transferencia de dinero de forma asíncrona. El servicio valida la petición, crea un registro de la transacción con estado `pending` y responde inmediatamente con un `202 Accepted`. El procesamiento real (validaciones, compliance, débito/crédito) ocurre en segundo plano.
+- **Cuerpo (Body):** `TransferRequestBody`
+- **Respuesta Exitosa:** `202 Accepted` con el ID de la transacción.
+
+### `GET /transactions/:transactionId`
+- **Descripción:** Permite consultar el estado y los detalles de una transacción específica en cualquier momento. Es el mecanismo principal para que un cliente sepa si una operación asíncrona se completó, falló o sigue en proceso.
+- **Parámetros:** `transactionId` (en la URL).
+- **Respuesta Exitosa:** `200 OK` con el registro completo de la transacción.
+
+### `GET /accounts/:accountId/transactions`
+- **Descripción:** Devuelve una lista paginada de todas las transacciones (tanto enviadas como recibidas) asociadas a una cuenta.
+- **Parámetros:** `accountId` (en la URL), `limit` y `offset` (opcionales, en la query).
+- **Respuesta Exitosa:** `200 OK` con la lista de transacciones.
+
+### `GET /accounts/:accountId/balance` (Helper)
+- **Descripción:** Un endpoint de ayuda para depuración y pruebas. Consulta directamente al microservicio de Cuentas (ms-2) para obtener el saldo actual de una cuenta.
+- **Parámetros:** `accountId` (en la URL).
+- **Respuesta Exitosa:** `200 OK` con el objeto `Money` que representa el saldo.
+
+## 4. Diagrama de Flujo de la API (Patrón Saga)
+
+El siguiente diagrama ilustra el flujo de una transacción exitosa orquestada por `ms-3`.
+
+```mermaid
+sequenceDiagram
+    participant Client
+    participant MS3 as "ms-3 (Transacciones)"
+    participant MS2 as "ms-2 (Cuentas)"
+    participant MS4 as "ms-4 (Compliance)"
+
+    Client->>+MS3: POST /transactions (iniciar transferencia)
+    Note over MS3: 1. Valida la petición y crea<br>un registro con estado 'pending'.
+    MS3-->>-Client: 202 Accepted (con transactionId)
+
+    par
+        Note over MS3: 2. Inicia la Saga asíncrona.
+        MS3->>+MS2: GET /accounts/{sourceId}
+        MS2-->>-MS3: Detalles cuenta origen
+    and
+        MS3->>+MS2: GET /accounts/{destinationId}
+        MS2-->>-MS3: Detalles cuenta destino
+    end
+
+    Note over MS3: 3. Valida que las cuentas existen.
+
+    MS3->>+MS4: POST /api/v1/validateTransaction
+    Note over MS4: 4. Realiza chequeo de<br>fraude y normativas.
+    MS4-->>-MS3: {"decision": "approve"}
+
+    Note over MS3: 5. Actualiza estado a 'processing'.
+
+    MS3->>+MS2: POST /internal/transfer (transferencia atómica)
+    Note over MS2: 6. Realiza débito y crédito<br>en una única operación.
+    MS2-->>-MS3: Transferencia exitosa
+
+    Note over MS3: 7. Actualiza estado a 'completed'.
+
+    loop Chequeo de estado
+        Client->>+MS3: GET /transactions/{transactionId}
+        MS3-->>-Client: 200 OK (con estado 'completed')
+    end
+```
+
+## 5. Seguridad Implementada
+
+La seguridad es un aspecto clave, especialmente al tratarse de operaciones financieras.
+
+- **Autenticación de Servicio a Servicio:** La comunicación con endpoints internos críticos, como `/internal/transfer` en `ms-2`, está protegida. `ms-3` debe presentar una clave secreta (`x-service-key`) en la cabecera de la petición, la cual es validada por `ms-2`. Esta clave se gestiona de forma segura a través de variables de entorno.
+
+- **Validación de Entradas (Input Validation):** Todos los endpoints validan rigurosamente los datos de entrada. Se rechazan peticiones con campos faltantes, tipos de datos incorrectos o lógica de negocio inválida (ej: transferir a la misma cuenta).
+
+- **Manejo de Errores:** El sistema está diseñado para fallar de forma segura. Si una llamada a un microservicio dependiente falla (ej: por un error de red o porque una cuenta no existe), la saga se detiene y el estado de la transacción se marca como `failed`, evitando dejar el sistema en un estado inconsistente.
+
+## 6. Estructura del Proyecto
+
+La organización de la carpeta `ms-3` sigue un patrón claro y escalable:
+
+```
+ms-3/
+├── dist/                 # Código JavaScript compilado (para producción)
+├── src/                  # Código fuente en TypeScript
+│   ├── mocks/            # (No presente, pero usado en tests) Mocks para simular otros servicios.
+│   ├── index.ts          # Archivo principal: servidor Express, rutas y lógica de la Saga.
+│   ├── swagger.ts        # Configuración centralizada de Swagger para la documentación.
+│   └── types.ts          # Definiciones de interfaces y tipos de TypeScript (ej: Money).
+├── tests/                # Pruebas automatizadas
+│   └── ms3.smoke.test.ts # Pruebas de humo que validan los flujos principales.
+├── .env                  # (No versionado) Variables de entorno (claves, URLs de servicios).
+├── Dockerfile            # Define cómo construir la imagen Docker del microservicio.
+├── package.json          # Dependencias y scripts del proyecto.
+└── tsconfig.json         # Configuración del compilador de TypeScript.
+```
+
+### Propósito de los Archivos Clave:
+
+- **`src/index.ts`**: Es el corazón de la aplicación. Define el servidor Express, registra los endpoints de la API y contiene la lógica de orquestación del patrón Saga.
+- **`src/swagger.ts`**: Abstrae toda la configuración de la documentación de la API, manteniendo `index.ts` enfocado en la lógica de negocio.
+- **`tests/ms3.smoke.test.ts`**: Contiene pruebas de integración cruciales que simulan el comportamiento completo de una transacción, incluyendo la verificación de saldos antes y después, asegurando que la lógica asíncrona funciona como se espera.
+- **`Dockerfile`**: Utiliza una construcción multi-etapa (multi-stage build) para crear una imagen de Docker optimizada, ligera y segura para producción.
+
+---
+
+Este informe proporciona una visión completa del microservicio `ms-3`, su funcionamiento interno y su rol dentro de la arquitectura global del sistema.

<!--
[PROMPT_SUGGESTION]Explícame con más detalle cómo funciona el patrón Saga en este microservicio.[/PROMPT_SUGGESTION]
[PROMPT_SUGGESTION]¿Cómo puedo mejorar el manejo de errores en la comunicación entre microservicios?[/PROMPT_SUGGESTION]
-->
--- a/d:/workspace/Cloud-Computinh-hito1/cloud-computing-project-ms-3/informe.md
+++ b/d:/workspace/Cloud-Computinh-hito1/cloud-computing-project-ms-3/informe.md
@@ -1,189 +1,215 @@
-# Informe Técnico: Microservicio de Transacciones (ms-3)
-
-**Versión:** 1.0.0
-**Fecha:** 2024-08-01
-
-## 1. Propósito y Rol en la Arquitectura
-
-El **Microservicio de Transacciones (ms-3)** actúa como el **orquestador central** para todas las operaciones de transferencia de dinero dentro del sistema. Su responsabilidad principal no es almacenar datos de cuentas ni saldos, sino garantizar que una transferencia monetaria se complete de manera segura y consistente, coordinando las acciones entre otros microservicios especializados.
-
-Para lograr esto, implementa el **Patrón de Diseño Saga**, que permite gestionar transacciones que abarcan múltiples servicios. Este enfoque asegura que, si un paso del proceso falla, se puedan tomar acciones compensatorias para mantener la integridad del sistema.
-
-## 2. Tecnologías Utilizadas
-
-El microservicio está construido sobre un stack moderno de JavaScript/TypeScript:
-
-- **Entorno de Ejecución:** Node.js (v20)
-- **Framework Web:** Express.js
-- **Lenguaje:** TypeScript
-- **Documentación de API:** Swagger (con `swagger-jsdoc` y `swagger-ui-express`)
-- **Pruebas (Testing):** Jest y Supertest
-- **Contenerización:** Docker
-- **Variables de Entorno:** `dotenv`
-
-## 3. Funcionalidades y Endpoints de la API
-
-La API expone los siguientes endpoints para gestionar las transacciones:
-
-### `POST /transactions`
-- **Descripción:** Inicia una nueva transferencia de dinero de forma asíncrona. El servicio valida la petición, crea un registro de la transacción con estado `pending` y responde inmediatamente con un `202 Accepted`. El procesamiento real (validaciones, compliance, débito/crédito) ocurre en segundo plano.
-- **Cuerpo (Body):** `TransferRequestBody`
-- **Respuesta Exitosa:** `202 Accepted` con el ID de la transacción.
-
-### `GET /transactions/:transactionId`
-- **Descripción:** Permite consultar el estado y los detalles de una transacción específica en cualquier momento. Es el mecanismo principal para que un cliente sepa si una operación asíncrona se completó, falló o sigue en proceso.
-- **Parámetros:** `transactionId` (en la URL).
-- **Respuesta Exitosa:** `200 OK` con el registro completo de la transacción.
-
-### `GET /accounts/:accountId/transactions`
-- **Descripción:** Devuelve una lista paginada de todas las transacciones (tanto enviadas como recibidas) asociadas a una cuenta.
-- **Parámetros:** `accountId` (en la URL), `limit` y `offset` (opcionales, en la query).
-- **Respuesta Exitosa:** `200 OK` con la lista de transacciones.
-
-### `GET /accounts/:accountId/balance` (Helper)
-- **Descripción:** Un endpoint de ayuda para depuración y pruebas. Consulta directamente al microservicio de Cuentas (ms-2) para obtener el saldo actual de una cuenta.
-- **Parámetros:** `accountId` (en la URL).
-- **Respuesta Exitosa:** `200 OK` con el objeto `Money` que representa el saldo.
-
-## 4. Diagrama de Flujo de la API (Patrón Saga)
-
-El siguiente diagrama ilustra el flujo de una transacción exitosa orquestada por `ms-3`.
-
-```mermaid
-sequenceDiagram
-    participant Client
-    participant MS3 as "ms-3 (Transacciones)"
-    participant MS2 as "ms-2 (Cuentas)"
-    participant MS4 as "ms-4 (Compliance)"
-
-    Client->>+MS3: POST /transactions (iniciar transferencia)
-    Note over MS3: 1. Valida la petición y crea<br>un registro con estado 'pending'.
-    MS3-->>-Client: 202 Accepted (con transactionId)
-
-    par
-        Note over MS3: 2. Inicia la Saga asíncrona.
-        MS3->>+MS2: GET /accounts/{sourceId}
-        MS2-->>-MS3: Detalles cuenta origen
-    and
-        MS3->>+MS2: GET /accounts/{destinationId}
-        MS2-->>-MS3: Detalles cuenta destino
-    end
-
-    Note over MS3: 3. Valida que las cuentas existen.
-
-    MS3->>+MS4: POST /api/v1/validateTransaction
-    Note over MS4: 4. Realiza chequeo de<br>fraude y normativas.
-    MS4-->>-MS3: {"decision": "approve"}
-
-    Note over MS3: 5. Actualiza estado a 'processing'.
-
-    MS3->>+MS2: POST /internal/transfer (transferencia atómica)
-    Note over MS2: 6. Realiza débito y crédito<br>en una única operación.
-    MS2-->>-MS3: Transferencia exitosa
-
-    Note over MS3: 7. Actualiza estado a 'completed'.
-
-    loop Chequeo de estado
-        Client->>+MS3: GET /transactions/{transactionId}
-        MS3-->>-Client: 200 OK (con estado 'completed')
-    end
-```
-
-## 5. Seguridad Implementada
-
-La seguridad es un aspecto clave, especialmente al tratarse de operaciones financieras.
-
-- **Autenticación de Servicio a Servicio:** La comunicación con endpoints internos críticos, como `/internal/transfer` en `ms-2`, está protegida. `ms-3` debe presentar una clave secreta (`x-service-key`) en la cabecera de la petición, la cual es validada por `ms-2`. Esta clave se gestiona de forma segura a través de variables de entorno.
-
-- **Validación de Entradas (Input Validation):** Todos los endpoints validan rigurosamente los datos de entrada. Se rechazan peticiones con campos faltantes, tipos de datos incorrectos o lógica de negocio inválida (ej: transferir a la misma cuenta).
-
-- **Manejo de Errores:** El sistema está diseñado para fallar de forma segura. Si una llamada a un microservicio dependiente falla (ej: por un error de red o porque una cuenta no existe), la saga se detiene y el estado de la transacción se marca como `failed`, evitando dejar el sistema en un estado inconsistente.
-
-## 6. Estructura del Proyecto
-
-La organización de la carpeta `ms-3` sigue un patrón claro y escalable:
-
-```
-ms-3/
-├── dist/                 # Código JavaScript compilado (para producción)
-├── src/                  # Código fuente en TypeScript
-│   ├── mocks/            # (No presente, pero usado en tests) Mocks para simular otros servicios.
-│   ├── index.ts          # Archivo principal: servidor Express, rutas y lógica de la Saga.
-│   ├── swagger.ts        # Configuración centralizada de Swagger para la documentación.
-│   └── types.ts          # Definiciones de interfaces y tipos de TypeScript (ej: Money).
-├── tests/                # Pruebas automatizadas
-│   └── ms3.smoke.test.ts # Pruebas de humo que validan los flujos principales.
-├── .env                  # (No versionado) Variables de entorno (claves, URLs de servicios).
-├── Dockerfile            # Define cómo construir la imagen Docker del microservicio.
-├── package.json          # Dependencias y scripts del proyecto.
-└── tsconfig.json         # Configuración del compilador de TypeScript.
-```
-
-### Propósito de los Archivos Clave:
-
-- **`src/index.ts`**: Es el corazón de la aplicación. Define el servidor Express, registra los endpoints de la API y contiene la lógica de orquestación del patrón Saga.
-- **`src/swagger.ts`**: Abstrae toda la configuración de la documentación de la API, manteniendo `index.ts` enfocado en la lógica de negocio.
-- **`tests/ms3.smoke.test.ts`**: Contiene pruebas de integración cruciales que simulan el comportamiento completo de una transacción, incluyendo la verificación de saldos antes y después, asegurando que la lógica asíncrona funciona como se espera.
-- **`Dockerfile`**: Utiliza una construcción multi-etapa (multi-stage build) para crear una imagen de Docker optimizada, ligera y segura para producción.
-
----
-
-Este informe proporciona una visión completa del microservicio `ms-3`, su funcionamiento interno y su rol dentro de la arquitectura global del sistema.
+# Informe Técnico: Microservicio de Transacciones (ms-3)
+
+**Versión:** 1.0.0
+**Fecha:** 2024-08-01
+
+## 1. Propósito y Rol en la Arquitectura
+
+El **Microservicio de Transacciones (ms-3)** actúa como el **orquestador central** para todas las operaciones de transferencia de dinero dentro del sistema. Su responsabilidad principal no es almacenar datos de cuentas ni saldos, sino garantizar que una transferencia monetaria se complete de manera segura y consistente, coordinando las acciones entre otros microservicios especializados.
+
+Para lograr esto, implementa el **Patrón de Diseño Saga**, que permite gestionar transacciones que abarcan múltiples servicios. Este enfoque asegura que, si un paso del proceso falla, se puedan tomar acciones compensatorias para mantener la integridad del sistema.
+
+## 2. Tecnologías Utilizadas
+
+El microservicio está construido sobre un stack moderno de JavaScript/TypeScript:
+
+- **Entorno de Ejecución:** Node.js (v20)
+- **Framework Web:** Express.js
+- **Lenguaje:** TypeScript
+- **Documentación de API:** Swagger (con `swagger-jsdoc` y `swagger-ui-express`)
+- **Pruebas (Testing):** Jest y Supertest
+- **Contenerización:** Docker
+- **Variables de Entorno:** `dotenv`
+
+## 3. Funcionalidades y Endpoints de la API
+
+La API expone los siguientes endpoints para gestionar las transacciones:
+
+### `POST /transactions`
+- **Descripción:** Inicia una nueva transferencia de dinero de forma asíncrona. El servicio valida la petición, crea un registro de la transacción con estado `pending` y responde inmediatamente con un `202 Accepted`. El procesamiento real (validaciones, compliance, débito/crédito) ocurre en segundo plano.
+- **Cuerpo (Body):** `TransferRequestBody`
+- **Respuesta Exitosa:** `202 Accepted` con el ID de la transacción.
+
+### `GET /transactions/:transactionId`
+- **Descripción:** Permite consultar el estado y los detalles de una transacción específica en cualquier momento. Es el mecanismo principal para que un cliente sepa si una operación asíncrona se completó, falló o sigue en proceso.
+- **Parámetros:** `transactionId` (en la URL).
+- **Respuesta Exitosa:** `200 OK` con el registro completo de la transacción.
+
+### `GET /accounts/:accountId/transactions`
+- **Descripción:** Devuelve una lista paginada de todas las transacciones (tanto enviadas como recibidas) asociadas a una cuenta.
+- **Parámetros:** `accountId` (en la URL), `limit` y `offset` (opcionales, en la query).
+- **Respuesta Exitosa:** `200 OK` con la lista de transacciones.
+
+### `GET /accounts/:accountId/balance` (Helper)
+- **Descripción:** Un endpoint de ayuda para depuración y pruebas. Consulta directamente al microservicio de Cuentas (ms-2) para obtener el saldo actual de una cuenta.
+- **Parámetros:** `accountId` (en la URL).
+- **Respuesta Exitosa:** `200 OK` con el objeto `Money` que representa el saldo.
+
+## 4. Diagrama de Flujo de la API (Patrón Saga)
+
+El siguiente diagrama ilustra el flujo de una transacción exitosa orquestada por `ms-3`.
+
+```mermaid
+sequenceDiagram
+    participant Client
+    participant MS3 as "ms-3 (Transacciones)"
+    participant MS2 as "ms-2 (Cuentas)"
+    participant MS4 as "ms-4 (Compliance)"
+
+    Client->>+MS3: POST /transactions (iniciar transferencia)
+    Note over MS3: 1. Valida la petición y crea<br>un registro con estado 'pending'.
+    MS3-->>-Client: 202 Accepted (con transactionId)
+
+    par
+        Note over MS3: 2. Inicia la Saga asíncrona.
+        MS3->>+MS2: GET /accounts/{sourceId}
+        MS2-->>-MS3: Detalles cuenta origen
+    and
+        MS3->>+MS2: GET /accounts/{destinationId}
+        MS2-->>-MS3: Detalles cuenta destino
+    end
+
+    Note over MS3: 3. Valida que las cuentas existen.
+
+    MS3->>+MS4: POST /api/v1/validateTransaction
+    Note over MS4: 4. Realiza chequeo de<br>fraude y normativas.
+    MS4-->>-MS3: {"decision": "approve"}
+
+    Note over MS3: 5. Actualiza estado a 'processing'.
+
+    MS3->>+MS2: POST /internal/transfer (transferencia atómica)
+    Note over MS2: 6. Realiza débito y crédito<br>en una única operación.
+    MS2-->>-MS3: Transferencia exitosa
+
+    Note over MS3: 7. Actualiza estado a 'completed'.
+
+    loop Chequeo de estado
+        Client->>+MS3: GET /transactions/{transactionId}
+        MS3-->>-Client: 200 OK (con estado 'completed')
+    end
+```
+
+## 5. Seguridad Implementada
+
+La seguridad es un aspecto clave, especialmente al tratarse de operaciones financieras.
+
+- **Autenticación de Servicio a Servicio:** La comunicación con endpoints internos críticos, como `/internal/transfer` en `ms-2`, está protegida. `ms-3` debe presentar una clave secreta (`x-service-key`) en la cabecera de la petición, la cual es validada por `ms-2`. Esta clave se gestiona de forma segura a través de variables de entorno.
+
+- **Validación de Entradas (Input Validation):** Todos los endpoints validan rigurosamente los datos de entrada. Se rechazan peticiones con campos faltantes, tipos de datos incorrectos o lógica de negocio inválida (ej: transferir a la misma cuenta).
+
+- **Manejo de Errores:** El sistema está diseñado para fallar de forma segura. Si una llamada a un microservicio dependiente falla (ej: por un error de red o porque una cuenta no existe), la saga se detiene y el estado de la transacción se marca como `failed`, evitando dejar el sistema en un estado inconsistente.
+
+## 6. Estructura del Proyecto
+
+La organización de la carpeta `ms-3` sigue un patrón claro y escalable:
+
+```
+ms-3/
+├── dist/                 # Código JavaScript compilado (para producción)
+├── src/                  # Código fuente en TypeScript
+│   ├── mocks/            # (No presente, pero usado en tests) Mocks para simular otros servicios.
+│   ├── index.ts          # Archivo principal: servidor Express, rutas y lógica de la Saga.
+│   ├── swagger.ts        # Configuración centralizada de Swagger para la documentación.
+│   └── types.ts          # Definiciones de interfaces y tipos de TypeScript (ej: Money).
+├── tests/                # Pruebas automatizadas
+│   └── ms3.smoke.test.ts # Pruebas de humo que validan los flujos principales.
+├── .env                  # (No versionado) Variables de entorno (claves, URLs de servicios).
+├── Dockerfile            # Define cómo construir la imagen Docker del microservicio.
+├── package.json          # Dependencias y scripts del proyecto.
+└── tsconfig.json         # Configuración del compilador de TypeScript.
+```
+
+### Propósito de los Archivos Clave:
+
+- **`src/index.ts`**: Es el corazón de la aplicación. Define el servidor Express, registra los endpoints de la API y contiene la lógica de orquestación del patrón Saga.
+- **`src/swagger.ts`**: Abstrae toda la configuración de la documentación de la API, manteniendo `index.ts` enfocado en la lógica de negocio.
+- **`tests/ms3.smoke.test.ts`**: Contiene pruebas de integración cruciales que simulan el comportamiento completo de una transacción, incluyendo la verificación de saldos antes y después, asegurando que la lógica asíncrona funciona como se espera.
+- **`Dockerfile`**: Utiliza una construcción multi-etapa (multi-stage build) para crear una imagen de Docker optimizada, ligera y segura para producción.
+
+## 7. Consideraciones Adicionales
+
+### Persistencia de Datos
+
+Actualmente, el estado de las transacciones se almacena en una estructura de datos en memoria (`Map`). Esto es adecuado para desarrollo y pruebas, pero **no es persistente** y se perderá si el servicio se reinicia.
+
+**Para un entorno de producción**, este `Map` debería ser reemplazado por una solución de base de datos persistente, como:
+- **Redis:** Para un almacenamiento rápido de clave-valor.
+- **MongoDB o PostgreSQL:** Si se requiere una mayor capacidad de consulta o durabilidad.
+
+### Manejo de Errores y Compensación
+
+El patrón Saga se implementa con bloques `try...catch` en el flujo asíncrono.
+
+- **Fallo en Validación:** Si una cuenta no existe o el chequeo de compliance falla, la saga se detiene y el estado de la transacción se marca como `failed`. No se requiere compensación porque aún no se ha realizado ninguna modificación monetaria.
+- **Fallo en Transferencia:** El endpoint `/internal/transfer` de `ms-2` se asume que es **atómico**. Si falla, no deja saldos inconsistentes. Por lo tanto, `ms-3` simplemente marca la transacción como `failed`. En un escenario más complejo donde la transferencia no fuera atómica, `ms-3` sería responsable de invocar operaciones de compensación (ej: revertir un débito si el crédito falla).
+
+### Estrategia de Pruebas
+
+El archivo `tests/ms3.smoke.test.ts` implementa pruebas de humo (smoke tests) que validan los flujos más críticos:
+
+1.  **Transacción Exitosa:** Verifica que el dinero se transfiere correctamente de una cuenta a otra.
+2.  **Rechazo por Compliance:** Asegura que una transacción que no cumple las reglas es marcada como `failed` y los saldos no cambian.
+3.  **Fallo y Reversión:** Simula un fallo durante la transferencia y confirma que los saldos permanecen intactos, demostrando la robustez del sistema.
+
+Estas pruebas son fundamentales para garantizar la fiabilidad del orquestador.
+
+---
+
+Este informe proporciona una visión completa del microservicio `ms-3`, su funcionamiento interno y su rol dentro de la arquitectura global del sistema.

