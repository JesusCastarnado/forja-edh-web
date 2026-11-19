# Forja EDH

Constructor y analizador de mazos de Commander. Las cartas, imágenes, precios y novedades salen en directo de [Scryfall](https://scryfall.com); la IA es Claude, a través de una pequeña función de servidor.

## Qué hace

- **Analizar**: pegas una lista y obtienes nota, bracket estimado, curva, esqueleto (tierras, ramp, robo, interacción, barridos), probabilidades de mano inicial, precio y avisos de legalidad. Vista de lista o visual con imágenes; al pasar el ratón ves la carta y al pulsarla, su ficha.
- **Optimizar con IA**: primero diagnostica cómo está montado el mazo y qué pide el comandante, te deja elegir el estilo y luego propone cortes y añadidos. Tiene en cuenta las cartas recientes (se le pasan con su texto, aunque sean posteriores a lo que conoce el modelo). Cada añadido se comprueba en Scryfall: legalidad e identidad de color.
- **Radiografía**: plan de juego, mulligan, debilidades y combos.
- **Novedades para tu mazo**: cartas de los últimos 5 meses en tus colores, previews incluidas.
- **Construir**: genera las 99 con IA o de forma automática (las más jugadas según EDHREC con cuotas de ramp, robo e interacción). Muestra los comandantes nuevos.
- **Paso a paso**: eliges comandante y montas el mazo por categorías (aceleración, robo, removal, barridos, protección, recursión, tutores, plan y tierras) con sugerencias en tus colores. También abre mazos ya hechos para editarlos.
- **Mis mazos**: guarda tus mazos (pegando la lista, importando .txt o desde Analizar / Paso a paso). Se guardan en el navegador y, si configuras la nube, se sincronizan con tu cuenta.
- **Probar mano**: robo de 7, mulligan de Commander y robar carta, con las imágenes reales.

## Estructura

```
index.html        la página
css/styles.css    estilos (tema claro y oscuro)
js/scryfall.js    acceso a la API de Scryfall, con pausa entre peticiones
js/analysis.js    lectura de listas, estadísticas y generador automático
js/ai.js          cliente de /api/claude (streaming)
js/app.js         interfaz
js/guided.js      constructor «Paso a paso»
js/decks.js       «Mis mazos» en el navegador (localStorage)
js/cloud.js       sincronización de «Mis mazos» con Supabase
js/config.js      URL y clave pública de Supabase (vacías = sin nube)
supabase/schema.sql  tabla y reglas de seguridad de la nube
api/claude.js     función de Vercel que llama a Claude con el SDK oficial (web publicada)
dev/serve.ps1     servidor local: sirve la web y hace de /api/claude con Claude Code y tu cuenta
```

## Guardar los mazos en la nube (gratis, opcional)

Sin configurar nada, «Mis mazos» se guarda solo en el navegador. Con [Supabase](https://supabase.com) (plan gratuito) entras con tu email y los mazos se sincronizan entre dispositivos y entre la versión local y la publicada.

1. Crea una cuenta en https://supabase.com y un proyecto nuevo (plan **Free**; la región más cercana, p. ej. Frankfurt o París).
2. En el proyecto: **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**.
3. **Authentication → URL Configuration**:
   - **Site URL**: la dirección de tu web en Vercel (o `http://localhost:8080` si solo la usas en local).
   - **Redirect URLs**: añade `http://localhost:8080/**` y `https://TU-WEB.vercel.app/**`.
4. **Project Settings → API** (o **Data API**): copia la **Project URL** y la clave **anon public** (o **publishable**) en `js/config.js`. Son públicas por diseño: las reglas de `schema.sql` hacen que cada usuario solo vea sus mazos. **No uses nunca la clave `service_role` / `secret`.**
5. Sube el cambio (`git push`). En «Mis mazos» aparece la caja para entrar con tu email: te llega un enlace y, al abrirlo **en el mismo navegador**, quedas dentro.

Límites del plan gratuito: el correo de inicio de sesión que envía Supabase tiene un tope bajo de envíos por hora (de sobra para uso personal) y el proyecto se pausa si pasa una semana sin uso; los datos no se pierden, se reactiva desde el panel de Supabase.

Cómo sincroniza: al entrar, al guardar o borrar un mazo y al volver a la pestaña. Por cada mazo gana la versión modificada más recientemente; los borrados también se sincronizan. Los mazos que ya tenías en el navegador se suben al entrar por primera vez.

## Usarla en local, con la IA de tu cuenta de Claude

En Windows, sin instalar nada más. La IA usa Claude Code (el `claude.exe` que trae la app de escritorio de Claude) con tu suscripción, así que no hace falta clave de API.

1. Solo la primera vez, inicia sesión (se abre el navegador para entrar con tu cuenta de Claude):

   ```bash
   powershell -ExecutionPolicy Bypass -File dev\serve.ps1 -Login
   ```

2. Arranca la web (se abre sola en http://localhost:8080):

   ```bash
   powershell -ExecutionPolicy Bypass -File dev\serve.ps1
   ```

   Deja esa ventana abierta mientras la uses. Opciones: `-Port 8090` para otro puerto, `-NoBrowser` para no abrir el navegador, `-ClaudePath "ruta\claude.exe"` si no encuentra Claude Code solo.

Mientras responde la IA, el servidor local atiende de una en una: espera a que termine una petición antes de lanzar otra. No abras `index.html` con doble clic: el navegador bloquea los módulos JavaScript fuera de un servidor.

## Publicarla en Vercel (opcional, con clave de API)

1. Crea una clave de API en https://console.anthropic.com (Settings → API Keys) y añade saldo a la cuenta. Es independiente de tu suscripción de Claude.
2. Sube esta carpeta a un repositorio de GitHub.
3. En https://vercel.com → **Add New → Project**, importa el repositorio. Framework: **Other**. No hace falta comando de build.
4. En **Settings → Environment Variables** añade:
   - `ANTHROPIC_API_KEY`: tu clave.
   - `APP_PASSWORD` (muy recomendable): una contraseña. Sin ella, cualquiera que encuentre la web puede gastar tu saldo. La web la pide una vez con el botón «Clave IA» y la recuerda en ese navegador.
   - `CLAUDE_MODEL` (opcional): por defecto `claude-opus-5-5`.
5. **Deploy**. Cada `git push` vuelve a publicar.

## Coste de la IA

Usa Claude Opus 5.5 (4 $ por millón de tokens de entrada y 20 $ por millón de salida), con razonamiento adaptativo y esfuerzo bajo o medio según la tarea. A ojo:

| Acción | Coste aproximado |
|---|---|
| Diagnóstico de estilo | 0,02–0,05 $ |
| Mejoras para un estilo | 0,05–0,15 $ |
| Radiografía | 0,03–0,08 $ |
| Generar un mazo completo | 0,10–0,30 $ |

Para abaratarlo, pon `CLAUDE_MODEL=claude-sonnet-5-5` (la mitad de precio) en Vercel.

La función tiene activado el *fallback* del servidor (`fallbacks: "default"`): si un filtro de seguridad rechazara una petición, la API la reintenta con otro modelo en vez de fallar.

## Notas

- Scryfall pide no superar ~10 peticiones por segundo; `js/scryfall.js` deja 110 ms entre peticiones y guarda en memoria cada carta consultada.
- Las etiquetas de ramp, robo, removal, etc. se calculan con expresiones regulares sobre el texto de reglas, así que alguna carta puede quedar mal etiquetada.
- Los nombres de las cartas tienen que ir en inglés (hay búsqueda difusa para erratas).
- Proyecto no oficial. Magic: The Gathering y las imágenes de las cartas son de Wizards of the Coast.
