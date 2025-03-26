# 🚀 Backend InOut

![GitHub repo size](https://img.shields.io/github/repo-size/ti-cyclonet/Backend_Inout)
![GitHub contributors](https://img.shields.io/github/contributors/ti-cyclonet/Backend_Inout)
![GitHub last commit](https://img.shields.io/github/last-commit/ti-cyclonet/Backend_Inout)
![GitHub issues](https://img.shields.io/github/issues/ti-cyclonet/Backend_Inout)
![GitHub license](https://img.shields.io/github/license/ti-cyclonet/Backend_Inout)

### 🏗️ **Descripción del Proyecto**
**Backend InOut** es una aplicación desarrollada con **Angular** y **TypeScript**, diseñada para gestionar eficientemente materiales y entradas/salidas dentro de un sistema determinado. Su arquitectura modular facilita la escalabilidad e integración con APIs y servicios en la nube.

---

## 📌 **Características principales**
✔️ Aplicación web desarrollada en **Angular**.  
✔️ Código estructurado en **TypeScript** para mayor seguridad y mantenimiento.  
✔️ Comunicación con backend a través de **APIs REST**.  
✔️ Diseño responsive y adaptable con **Angular Material**.  
✔️ Manejo de estado con **RxJS** y servicios.  
✔️ Implementación de autenticación segura con **JWT**.  

---

## 🛠 **Tecnologías utilizadas**
| Tecnología | Descripción |
|------------|------------|
| **Angular** | Framework frontend basado en TypeScript |
| **NESTJS** | Framework backend basado en Node.js y TypeScript |
| **TypeScript** | Lenguaje con tipado fuerte para mayor seguridad |
| **PostgreSQL** | Bases de datos soportadas en el backend |
| **Docker** | Contenedores para despliegue en entornos productivos |

---

### 📌 **Comandos para el Backend (NestJS)**
| Comando | Descripción |
|---------|------------|
| `yarn install` | Instala las dependencias del backend |
| `yarn start` | Inicia el servidor en modo producción |
| `yarn start:dev` | Inicia el servidor en modo desarrollo con hot reload |
| `yarn test` | Ejecuta las pruebas unitarias con Jest |
| `yarn test:e2e` | Ejecuta pruebas de integración end-to-end |
| `yarn lint` | Verifica la calidad del código con ESLint |
| `yarn build` | Compila la aplicación para producción |

---


## ⚡ **Instalación y configuración**
### 🔧 **Requisitos previos**
Asegúrate de tener instalado:
- [Node.js (16+)](https://nodejs.org/)
- [Angular CLI](https://angular.io/cli)
- [Docker](https://www.docker.com/)
- [Yarn](https://yarnpkg.com/) (instalar con `npm install -g yarn`)

### 📥 **Clonar el repositorio**
```bash
git clone https://github.com/ti-cyclonet/Backend_Inout.git
cd Backend_Inout
```
---

## ⚡ **Configuración manual de la base de datos**

### Inicializar el contenedor por consola

```bash
docker exec -it inoutdb psql -U postgres -d InoutDB
```

### Crear los esquemas en PostgreSQL
```bash
CREATE SCHEMA manufacturing;
CREATE SCHEMA inventory;
```

### Asignar permisos al usuario de PostgreSQL
```bash
ALTER SCHEMA manufacturing OWNER TO postgres;
ALTER SCHEMA inventory OWNER TO postgres;
```
---
