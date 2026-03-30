# Módulo Customers - InOut

## Descripción
Este módulo gestiona la relación entre usuarios del sistema Authoriza y el tenantId del sistema InOut mediante una tabla intermedia llamada `customer`.

## Estructura

### Entidad Customer
- `id`: UUID único del registro
- `userId`: ID del usuario en Authoriza (único)
- `tenantId`: ID del tenant en InOut
- `isActive`: Estado del registro
- `createdAt`: Fecha de creación
- `updatedAt`: Fecha de actualización

## Endpoints

### POST /customers
Registra un usuario de Authoriza en InOut con su tenantId.

**Body:**
```json
{
  "userId": "uuid-del-usuario-en-authoriza",
  "tenantId": "id-del-tenant-en-inout",
  "isActive": true
}
```

### GET /customers/tenant/:tenantId
Obtiene todos los usuarios asociados a un tenantId específico.

**Respuesta:**
```json
[
  {
    "id": "uuid",
    "userId": "uuid-del-usuario",
    "tenantId": "tenant-id",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### GET /customers/tenant/:tenantId/details
Obtiene todos los usuarios de un tenant con sus detalles completos desde Authoriza.

**Respuesta:**
```json
[
  {
    "customerId": "uuid",
    "userId": "uuid-del-usuario",
    "tenantId": "tenant-id",
    "userDetails": {
      "id": "uuid",
      "strUserName": "email@example.com",
      "code": "USR001",
      "strStatus": "ACTIVE",
      "basicData": { ... }
    }
  }
]
```

### GET /customers/user/:userId
Obtiene la información del customer por userId.

### DELETE /customers/:id
Desactiva un customer (soft delete).

## Instalación de la Base de Datos

Ejecutar el script SQL:
```bash
cd C:\xampp\htdocs\CycloNet\InOut\Backend_Inout\database
psql -U postgres -d InoutDB -f create-customer-table.sql
```

O manualmente:
```bash
docker exec -it inoutdb psql -U postgres -d InoutDB
\i /path/to/create-customer-table.sql
```

## Uso

### Registrar un usuario
```typescript
POST http://localhost:3001/customers
{
  "userId": "abc-123-def",
  "tenantId": "tenant-001"
}
```

### Obtener usuarios de un tenant
```typescript
GET http://localhost:3001/customers/tenant/tenant-001
```

### Obtener usuarios con detalles completos
```typescript
GET http://localhost:3001/customers/tenant/tenant-001/details
```

## Ventajas de este diseño
- No modifica la tabla `users` en Authoriza
- Permite múltiples tenants en InOut
- Fácil recuperación de usuarios por tenantId
- Mantiene la separación de responsabilidades entre sistemas
- Permite desactivar usuarios sin eliminarlos
