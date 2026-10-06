# En Una Nota

Juego musical web: escuchás un fragmento de una canción real y tenés que adivinarla lo más rápido posible.
Se juega desde el navegador, sin instalar nada, solo o con amigos en salas en vivo.

**Producción:** https://en-una-nota.up.railway.app

## Modos de juego

| Modo | Ruta | Descripción |
| --- | --- | --- |
| Diario | `/diario` | Un tema por día igual para todos, estilo Wordle. 6 intentos (0.8s → 1.5s → 3s → 6s → 12s → 30s), racha y resultado para compartir sin spoilers. |
| Rush | `/rush` | Contrarreloj con 45s: acierto +4s, fallo −6s. Tres aciertos rápidos seguidos activan la Fiebre (x2). |
| Desafío de Artista | `/artista` | 10 temas de un artista escuchando 1 segundo. Ranking de "Top fans" por artista. |
| Adiviná el año | `/anio` | Suena un tema y elegís el año de lanzamiento. |
| Time Machine | `/linea` | Ubicás cada tema en tu línea de tiempo según su `releaseDate`. |
| El Impostor | `/impostor` | Tres fragmentos, dos del artista y uno que se coló. |
| Cadena de Feats | `/cadena` | Encadenás colaboraciones (Bizarrap → Quevedo → ...) antes de que se acabe el reloj. |
| Salas | `/sala`, `/sala/:code` | 2 a 12 jugadores con código de 4 letras o link. Modos Clásico, Buzzer y Subasta, con reacciones y revancha. |
| Rankings | `/rankings` | Rankings semanales e históricos por artista, Rush y Año. |

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, `motion/react`, `lucide-react`, `canvas-confetti`.
- **Audio:** Howler.js (Web Audio API con fallback a HTML5 Audio).
- **Backend:** Node + Express 5 + Socket.io 4, en el mismo proceso que Next (`server/index.ts`).
- **Música:** [iTunes Search API](https://performance-partners.apple.com/search-api) (sin API key, previews `.m4a` de 30s).
- **Base de datos:** Supabase (Postgres) vía PostgREST, opcional.
- **Hosting:** Railway, un contenedor Node persistente (`Dockerfile`).

## Arquitectura

```
                    ┌──────────────── Node (server/index.ts) ────────────────┐
Navegador ──HTTP──► │ Next.js (páginas)                                       │
          ──HTTP──► │ Express /api/*  ── rondas, diario, rankings, stats      │ ──HTTP──► iTunes Search API
          ──HTTP──► │ /api/audio/:roundId ── proxy + cache de previews        │ ──HTTP──► CDN de previews de Apple
          ══ WS ══► │ Socket.io ── salas en vivo (estado en memoria)          │ ──HTTP──► Supabase (scores, games)
                    └─────────────────────────────────────────────────────────┘
```

Un solo proceso sirve la web, la API REST y los WebSockets en el mismo puerto. Por los WebSockets y el estado en
memoria de las salas, necesita una instancia persistente (no sirve un deploy serverless).

### Estructura

```
server/
  index.ts         servidor HTTP: Next + Express + Socket.io
  api.ts           endpoints REST
  itunes.ts        búsquedas a iTunes con cache, dedupe y filtro de versiones (karaoke, covers...)
  catalog.ts       categorías: artistas y términos semilla por género
  rounds.ts        rondas en memoria (roundId → canción) y opciones señuelo
  previewCache.ts  cache LRU de previews de audio
  audio.ts         proxy /api/audio/:roundId
  daily.ts         tema del día determinístico
  modes.ts         lógica de Año, Time Machine, Impostor y Cadena
  rooms.ts         salas multijugador (Clásico, Buzzer, Subasta)
  leaderboard.ts   rankings semanales/históricos (Supabase o memoria)
  games.ts         registro de partidas
  db.ts            cliente PostgREST mínimo con fetch
src/
  app/             páginas (una carpeta por modo)
  components/      UI compartida (Shell, OptionGrid, Waveform, Leaderboard...)
  lib/             useAudio (Howler), socket, api, share, storage, puntajes
supabase/schema.sql
```

## Técnicas clave

### Proxy de audio anti-trampa
El servidor guarda en memoria `{ roundId → url real, título, artista }` y al navegador solo le manda
`/api/audio/<uuid>`. En la pestaña Network no aparece ni la URL de Apple ni el nombre del tema, y la solución
llega recién cuando se cierra la ronda.

### Catálogo dinámico
No hay una lista fija de canciones: cada categoría (`server/catalog.ts`) tiene artistas y términos de búsqueda, y
los temas salen de iTunes en el momento. Las opciones incorrectas se eligen del mismo género o artista para que
sean creíbles.

### Cache y precarga
- Las búsquedas a iTunes se cachean 24 horas en memoria y en Supabase, y los pedidos simultáneos iguales se
  unifican en uno solo.
- Los previews se guardan en una cache LRU en memoria (400 entradas): se descargan cuando se crea la ronda, así
  que el audio responde en milisegundos.
- El cliente precarga la ronda siguiente mientras suena la actual.

### Salas en tiempo real
- El servidor es la autoridad: guarda el estado, valida respuestas y calcula puntajes.
- **Arranque sincronizado:** cada cliente estima la diferencia entre su reloj y el del servidor (`ping_time`).
  El servidor manda `round_start` con un `startAt` 1.5s en el futuro y cada dispositivo programa el audio para
  ese instante.
- **Buzzer:** el primer `buzz` que llega al servidor toma el lock y pausa el audio de todos (`buzz_lock`). Si
  falla, queda bloqueado hasta el próximo tema y el audio sigue desde donde quedó (`buzz_resume`).
- **Subasta:** los jugadores pujan segundos; el que ofrece menos escucha solo ese tiempo y responde.
- Cada socket está en una sola sala a la vez. Hay revancha por votación, volver al lobby, cerrar sala y
  resincronización al reconectar (`room_sync`).

Eventos principales: `create_room`, `join_room`, `set_config`, `start_game`, `submit_answer`, `buzz`, `bid`,
`reaction`, `rematch`, `back_to_lobby`, `leave_room`, `close_room` (cliente → servidor) y `room_state`,
`round_start`, `round_end`, `buzz_lock`, `buzz_resume`, `auction_start`, `game_over`, `room_closed`
(servidor → cliente).

### Audio confiable (incluido iPhone)
- Los relojes de Rush y Cadena se pausan mientras el tema carga.
- El audio que está sonando no se descarga, y si un preview falla se reintenta o se salta sin penalizar.
- `Howler.autoSuspend` está desactivado.
- En iOS el audio se desbloquea con el primer toque y sale por el canal multimedia
  (`navigator.audioSession.type = "playback"`), así suena aunque el switch de silencio esté activado. Si el
  navegador lo pausa igual, aparece el aviso "Tocá para activarlo" (`AudioGuard`).

### Rankings y métricas
- Rankings por modo y categoría, semanales (se resetean los lunes a las 00:00 UTC) e históricos.
- Puntaje del Desafío de Artista: `aciertos × 100 + bonus de velocidad (0–99)`. Más aciertos siempre gana; el
  bonus desempata.
- Cada partida terminada se registra en `games`. `GET /api/stats` devuelve totales, hoy, últimos 7 días,
  jugadores y partidas por modo.
- Solo el servidor habla con Supabase, con la service role key. Si no está configurado o falla, el juego sigue
  con rankings en memoria.

### Datos del jugador
Racha del Diario, apodo e insignias se guardan en `localStorage`. No hay cuentas de usuario.

## API REST

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/categories` | Categorías disponibles |
| GET | `/api/audio/:roundId` | Audio de una ronda (proxy) |
| GET | `/api/daily` · POST `/api/daily/guess` | Tema del día e intentos |
| POST | `/api/round` · `/api/answer` | Ronda de opción múltiple (Rush) y respuesta |
| POST | `/api/year/round` | Ronda de Adiviná el año |
| POST | `/api/timeline/round` · `/api/timeline/guess` | Time Machine |
| POST | `/api/impostor/round` · `/api/impostor/guess` | El Impostor |
| POST | `/api/chain/round` · `/api/chain/guess` | Cadena de Feats |
| POST | `/api/artist/round` · GET `/api/artist/suggest` | Desafío de Artista y buscador |
| GET/POST | `/api/leaderboard?mode=&categoryId=&period=week\|all` | Ver y cargar puntajes |
| GET | `/api/leaderboard/artists?period=week\|all` | Artistas más jugados y su líder |
| POST | `/api/games` · GET `/api/stats` | Registro de partidas y métricas |
| GET | `/healthz` | Health check |

## Desarrollo local

Requiere Node 20 o superior.

```bash
npm install
npm run dev        # servidor propio (Next + API + Socket.io) en http://localhost:3000
```

Chequeos:

```bash
npm run typecheck
npm run lint
npm run build
npm run start      # modo producción
```

## Base de datos (Supabase, opcional)

Rankings y registro de partidas se guardan en Supabase si están definidas `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` (solo en el servidor, nunca en el navegador). Sin ellas, todo queda en memoria.
El esquema está en `supabase/schema.sql`: correrlo una vez en el SQL Editor de Supabase.

## Deploy

Railway construye el `Dockerfile` y corre una sola instancia de Node con health check en `/healthz`.

```bash
RAILWAY_TOKEN=<token del proyecto> railway up --service <service-id> --ci
```

Variables: `PORT` (la define Railway), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Limitaciones conocidas

- Las salas en vivo están en memoria: un redeploy corta las partidas en curso, y para correr varias instancias
  haría falta un adaptador compartido (por ejemplo Redis).
- Sin login: cualquiera puede elegir cualquier apodo en los rankings.
- Todas las búsquedas a iTunes salen de la IP del servidor, que tiene un límite aproximado de 20 por minuto
  según la documentación de Apple. Por eso los resultados se cachean 24 horas en memoria y en Supabase (tabla
  `itunes_cache`, así los deploys arrancan con la cache llena) y los pedidos en vivo pasan por un limitador
  (20 por minuto con ráfaga, reintentos y pausa global si Apple responde 403/429). Si igual falla, se usa el
  último resultado guardado aunque esté vencido.
