# Forja EDH

Constructor y analizador de mazos de Commander. Las cartas, imágenes, precios y novedades salen en directo de [Scryfall](https://scryfall.com); la IA es Claude, a través de una pequeña función de servidor.

## Qué hace

- **Analizar**: pegas una lista y obtienes nota, bracket estimado, curva, esqueleto (tierras, ramp, robo, interacción, barridos), probabilidades de mano inicial, precio y avisos de legalidad. Vista de lista o visual con imágenes; al pasar el ratón ves la carta y al pulsarla, su ficha.
- **Optimizar con IA**: primero diagnostica cómo está montado el mazo y qué pide el comandante, te deja elegir el estilo y luego propone cortes y añadidos. Tiene en cuenta las cartas recientes (se le pasan con su texto, aunque sean posteriores a lo que conoce el modelo). Cada añadido se comprueba en Scryfall: legalidad e identidad de color.
- **Radiografía**: plan de juego, mulligan, debilidades y combos.
- **Novedades para tu mazo**: cartas de los últimos 5 meses en tus colores, previews incluidas.
- **Construir**: genera las 99 con IA o de forma automática (las más jugadas según EDHREC con cuotas de ramp, robo e interacción). Muestra los comandantes nuevos.
- **Probar mano**: robo de 7, mulligan de Commander y robar carta, con las imágenes reales.

## Estructura

```
index.html        la página
css/styles.css    estilos (tema claro y oscuro)
js/scryfall.js    acceso a la API de Scryfall, con pausa entre peticiones
js/analysis.js    lectura de listas, estadísticas y generador automático
js/ai.js          cliente de /api/claude (streaming)
js/app.js         interfaz
api/claude.js     función de Vercel que llama a Claude con el SDK oficial (web publicada)
dev/serve.ps1     servidor local: sirve la web y hace de /api/claude con Claude Code y tu cuenta
```

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
