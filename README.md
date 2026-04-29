# Mira - Aplicación para Compartir Pantalla

Mira es una aplicación web moderna que permite compartir la pantalla, transmitir video y audio a través de internet de manera sencilla, rápida y segura. Utiliza **WebRTC** para establecer una conexión _peer-to-peer_ (P2P) de baja latencia y **WebSockets** para gestionar la señalización entre los usuarios.

La interfaz está diseñada para ser intuitiva y cuenta con soporte avanzado para funcionar de forma fluida incluso en navegadores de **Smart TVs**.

## 🚀 Características Principales

- **Transmisión de Pantalla y Video:** Comparte tu pantalla completa, una ventana de aplicación o una pestaña del navegador con facilidad.
- **Salas Privadas:** Crea sesiones de transmisión únicas protegidas por un código de 5 caracteres.
- **Control de Acceso (Sala de Espera):** El transmisor tiene el control total sobre quién puede ver la pantalla, pudiendo aprobar o denegar solicitudes de acceso en tiempo real.
- **Pausa de Transmisión:** El anfitrión puede pausar temporalmente la transmisión sin desconectar a los espectadores.
- **Soporte para Smart TVs:** Implementación técnica especializada (`Fullscreen API` y pseudo-fullscreen por CSS) diseñada específicamente para maximizar el área de visualización en televisores inteligentes (ej. Tizen, WebOS) y navegadores antiguos.
- **Alta Eficiencia:** Al usar WebRTC, el video va directamente desde el emisor al receptor sin pasar por un servidor intermedio, mejorando la latencia y la privacidad.

## 🛠️ Tecnologías Utilizadas

### Frontend

- **React 19:** Biblioteca principal para la interfaz de usuario.
- **Vite:** Herramienta de construcción (bundler) ultrarrápida.
- **Tailwind CSS v4:** Para los estilos y el sistema de diseño responsivo.
- **Motion (Framer Motion):** Para animaciones fluidas y transiciones en la UI.
- **TypeScript:** Para añadir tipado estático y mejorar la solidez del código.

### Backend (Señalización)

- **Node.js & Express:** Para servir la aplicación y manejar el enrutamiento HTTP.
- **WebSockets (`ws`):** Para la comunicación en tiempo real y el intercambio de metadatos (señalización) necesarios para establecer la conexión WebRTC.

## 📋 Requisitos Previos

- [Node.js](https://nodejs.org/) (se recomienda v18 o superior).
- npm o yarn.

## ⚙️ Instalación y Ejecución Local

1. **Clonar el repositorio:**

   ```bash
   git clone <tu-repositorio-url>
   cd mira-main
   ```

2. **Instalar dependencias:**

   ```bash
   npm install
   ```

3. **Iniciar el entorno de desarrollo:**
   ```bash
   npm run dev
   ```
   _El servidor y la aplicación web se iniciarán por defecto en `http://localhost:3000`._

## 📦 Scripts Disponibles

En el directorio del proyecto, puedes ejecutar los siguientes comandos:

- `npm run dev` o `npm run start`: Inicia el servidor de desarrollo (usando `tsx` para el backend y Vite como middleware).
- `npm run build`: Construye la aplicación optimizada lista para producción en el directorio `dist`.
- `npm run preview`: Sirve la carpeta `dist` localmente para probar el build de producción.
- `npm run lint`: Verifica la consistencia de tipos en el código usando TypeScript.

## 📁 Estructura del Proyecto

```text
mira/
├── server.ts             # Servidor de señalización (WebSockets) y Express
├── index.html            # Punto de entrada HTML
├── vite.config.ts        # Configuración de Vite
├── src/
│   ├── App.tsx           # Lógica principal, manejo de WebRTC y enrutamiento visual
│   ├── main.tsx          # Punto de entrada de React
│   ├── index.css         # Estilos globales y directivas de Tailwind
│   ├── components/       # Componentes de React
│   │   ├── common/       # Componentes compartidos (ej. Header)
│   │   ├── home/         # Pantalla inicial de selección de modo
│   │   ├── share/        # Vista del transmisor (host)
│   │   └── watch/        # Vista del espectador
│   ├── hooks/            # Custom Hooks (useSignal.ts, useWebRTC.ts)
│   ├── styles/           # Archivos CSS adicionales si aplican
│   └── types/            # Definiciones de interfaces y tipos TypeScript
```

## ⚠️ Notas Técnicas Importantes

**Manejo de Pantalla Completa (Fullscreen)**: Dentro de `src/App.tsx`, existen bloques de código marcados como **LOCKED** correspondientes al manejo de la API de Pantalla Completa. Este código utiliza soluciones específicas (como llamadas síncronas en eventos de usuario y _fallbacks_ a CSS) para saltar las restricciones de seguridad y problemas comunes en los navegadores integrados de Smart TVs. **Se recomienda no alterar estos bloques** sin probar exhaustivamente en dichos dispositivos.

## 📄 Licencia

Este proyecto está distribuido bajo la **Licencia MIT**. Es software de código abierto y eres libre de hacer _forks_, personalizarlo y utilizarlo, **siempre y cuando se incluya el aviso de derechos de autor y se mencione explícitamente al creador original** en todas las copias o porciones sustanciales del software.

---

**Creado por:** Dev. Jose Luis Mamani C.  
**Organización:** NEXTAPPCODE.

_Proyecto generado para compartir pantalla mediante internet._
