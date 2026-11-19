# Forja EDH

Constructor y analizador de mazos de **Magic: The Gathering** para el formato **Commander (EDH)**.

- **Web publicada:** https://forja-edh-web.vercel.app
- **Cartas, imágenes, precios (en $ o en €) y novedades:** en directo desde [Scryfall](https://scryfall.com).
- **Combos:** con los datos gratuitos de [Commander Spellbook](https://commanderspellbook.com).
- **IA:** Claude. En local usa tu cuenta de Claude; en la web publicada está desactivada (o con clave de API si la configuras).
- **Mis mazos en la nube:** [Supabase](https://supabase.com), entrando con GitHub o con tu email.

Todo funciona con planes gratuitos: Vercel, Supabase, Scryfall y Commander Spellbook no cuestan nada, y la IA en local va incluida en tu suscripción de Claude.

---

## Índice

1. [Qué puedes hacer](#qué-puedes-hacer)
2. [Usarla: web publicada o en local](#usarla-web-publicada-o-en-local)
3. [La IA](#la-ia)
4. [Mis mazos y la nube](#mis-mazos-y-la-nube)
5. [Cómo está hecha](#cómo-está-hecha)
6. [Montarla desde cero](#montarla-desde-cero)
7. [Costes y límites](#costes-y-límites)
8. [Problemas frecuentes](#problemas-frecuentes)
9. [Próximas funciones](#próximas-funciones)
10. [Notas](#notas)

---

## Qué puedes hacer

La web tiene siete pestañas. Arriba a la derecha eliges la moneda de los precios: **$ USD** (TCGplayer) o **€ EUR** (Cardmarket); se recuerda en el navegador.

### Analizar

Pegas la lista de tu mazo (de Moxfield, Archidekt, ManaBox o cualquier texto «1 Nombre de carta») y obtienes:

- **Nota** (de D a A+) y **nivel** (precon, mejorado, fuerte, competitivo).
- **Bracket estimado** (B1–B5) y número de **Game Changers**.
- **Curva de maná**, tipos de carta y símbolos de maná por color.
- **Esqueleto**: tierras, ramp, robo, removal y barridos frente a las cifras recomendadas.
- **Mano inicial**: probabilidad de tener 2–4 tierras, 3 o más, y ramp en mano.
- **Avisos**: cartas fuera de la identidad de color, prohibidas, repetidas o no encontradas.
- **Precio** aproximado del mazo (en dólares o en euros).
- **Combos** (de Commander Spellbook): los que el mazo ya tiene completos, con los pasos para hacerlos, y los que se quedan **a una carta**, con un botón para añadirla. Los combos infinitos de dos cartas cuentan para el bracket (B3 como mínimo; B4 si Spellbook los marca como *Ruthless*).
- **Tu colección**: cuántas cartas del mazo tienes, cuántas te faltan y cuánto cuestan, con «Copiar lista de la compra» y «Añadir a la lista de deseos».
- Vista de **lista** o **visual** con las imágenes. Al pasar el ratón ves la carta y al pulsarla, su ficha.

Además:

- **Optimizar con IA**: lee cómo está montado el mazo y qué pide el comandante, te deja elegir el estilo (reforzar el actual, otro arquetipo o «a mi manera») y propone cortes y añadidos. Cada añadido se comprueba en Scryfall: que exista, que sea legal y que esté en tu identidad de color.
- **Radiografía**: plan de juego, cómo se juega cada fase, mulligan, puntos débiles y combos.
- **Sugerencias rápidas** (sin IA): rellena lo que le falta al esqueleto con las cartas más jugadas en tus colores.
- **A presupuesto**: escribes un precio máximo («déjamelo en 100 €») y propone cambios carta por carta, de la más cara a la más barata, hasta bajar de esa cifra. Sin IA cambia cada carta por una de las más jugadas que cumple la misma función (ramp por ramp, robo por robo, una criatura del tema por otra del tema…) y cuesta mucho menos; con IA, Claude elige los cambios pensando en la sinergia, y la web comprueba que cada cambio sea legal, esté en tus colores y salga más barato. Nada se aplica hasta que pulsas «Cambiar» o «Aplicar todos».
- **Novedades para tu mazo**: cartas de los últimos 5 meses en tus colores, previews incluidas.
- **Editar paso a paso**: abre el mazo en el constructor guiado.
- **Guardar en Mis mazos** / **Guardar cambios**.

### Construir

Eliges comandante (y partner o fondo si lo tiene), tema, bracket y presupuesto por carta, y:

- **Que la IA lo genere**: Claude arma las 99 (o 98 con dos comandantes) teniendo en cuenta las cartas nuevas.
- **Generar automático** (sin IA): las cartas más jugadas según EDHREC, con cuotas de ramp, robo e interacción y las tierras repartidas según tus colores.
- Lista de **comandantes nuevos** de los últimos 4 meses.

### Paso a paso

Un constructor guiado:

1. **Eliges comandante**: buscador, filtro por colores («exactos» o «que contengan»), estilos (Fichas, Contadores +1/+1, Agresivo, Aristócratas, Cementerio, Artefactos, Hechizos, Tierras, Voltron, Vida) y los más jugados.
2. **Montas el mazo por categorías**, cada una con su objetivo:

   | Paso | Objetivo |
   |---|---|
   | Aceleración (ramp) | 10 |
   | Robo de cartas | 10 |
   | Removal puntual | 8 |
   | Barridos | 3 |
   | Protección | 4 |
   | Recursión | 3 |
   | Tutores | 2 |
   | Plan del comandante | 23 (22 con dos comandantes) |
   | Tierras | 36 |

   En cada paso salen sugerencias en tus colores. Un clic añade la carta y otro la quita. Las que encajan con el texto de tu comandante llevan la etiqueta **Sinergia**.
3. **Modo libre**: busca cualquier carta en tu identidad de color (por nombre, tipo o con la sintaxis de Scryfall).
4. **Completar con básicas**: rellena las tierras que faltan según tus símbolos de maná.
5. **¿Encaja esta carta?**: escribe una carta que te guste y la IA te dice si encaja en el mazo (*Buena idea*, *Depende* o *Mejor no*), con razones a favor y en contra, qué cartas quitarías para meterla y alternativas mejores, cada una con su botón para añadir o quitar. Antes de llamar a la IA comprueba gratis que la carta exista, sea legal y entre en los colores de tu comandante.

Arriba ves siempre las cartas que llevas (de 100), el precio, el coste medio, el bracket y los Game Changers; a la derecha, tu mazo por categorías y la curva. El borrador se guarda solo. Con **Analizar mazo** pasas a la pestaña Analizar, con **Guardar en Mis mazos** lo guardas y con **+ Nuevo mazo** vuelves a elegir comandante para empezar otro (si el actual tiene cambios sin guardar, te ofrece guardarlo antes).

También sirve para **editar mazos que ya tienes**: desde Analizar o desde Mis mazos, pulsa «Editar paso a paso» y se abre en el primer paso incompleto.

### Mis mazos

Tus mazos guardados, cada uno con el arte del comandante, sus colores, cartas, precio, bracket, nota y fecha.

- **Añadir**: «+ Crear mazo» (te lleva a Paso a paso para elegir comandante), «Pegar lista», «Importar archivo» (.txt de Moxfield, Archidekt o ManaBox, varios a la vez, o una copia .json) o guardando desde Analizar / Paso a paso.
- **En cada mazo**: Abrir, Editar paso a paso, Copiar lista, Renombrar, Duplicar y Borrar.
- **Buscar** por nombre o comandante.
- **Exportar copia**: descarga todos tus mazos en un .json.
- **Nube**: entra con GitHub o con tu email y se sincronizan entre dispositivos (ver [Mis mazos y la nube](#mis-mazos-y-la-nube)).
- **Compartir y recibir sugerencias**: «Compartir» te da un enlace; tus amigos marcan qué quitarían y qué añadirían, y tú decides qué aplicar (ver [Compartir un mazo](#compartir-un-mazo-y-recibir-sugerencias)).
- Si tienes la colección rellena, cada mazo dice **cuántas cartas te faltan**.

### Comparar

Eliges dos de tus mazos (o el de Analizar) o pegas dos listas, y ves:

- El **porcentaje de cartas en común**.
- Una tabla con cartas, precio, coste medio, nota, bracket, Game Changers, tierras, ramp, robo, removal, barridos y tutores de cada uno, y la diferencia.
- Las dos **curvas de maná** superpuestas.
- Las cartas **solo en A**, **solo en B** y **en los dos** (con las cantidades distintas marcadas), agrupadas por tipo y con lo que valen.

### Colección

Las cartas que tienes físicamente y tu lista de deseos.

- **Añadir** con el buscador, o **importar** una lista «4 Lightning Bolt» o un CSV de ManaBox, Moxfield o Deckbox (sumando a lo que tienes o reemplazando las cantidades).
- Cantidad con − y +, filtro, orden por nombre, precio o recientes, y valor total.
- **Lista de deseos**: lo que buscas, con lo que cuesta en total, «Ya la tengo» y «Copiar lista de la compra».
- Descargar la colección en .txt.
- Se guarda en el navegador y, si entras con tu cuenta, en la nube (necesita la tabla `collections` de `supabase/schema.sql`).

### Probar mano

- Roba 7 cartas con las imágenes reales y haz mulligan con la regla de Commander (el primero es gratis; luego eliges qué cartas van al fondo).
- **Juega los primeros turnos** en solitario: cada turno robas (puedes elegir si se roba en el turno 1, como en multijugador), bajas una tierra y lanzas hechizos si te llega el maná. El maná lo dan las tierras y las piedras o criaturas de maná (las criaturas, a partir del turno siguiente). Los hechizos de ramp que buscan tierras las ponen solas en el campo, y el comandante se lanza desde la zona de mando con su impuesto. Hay un registro de todo lo que pasa.
- **Simular mil partidas**: juega 1.000 partidas automáticas y te dice el porcentaje de mulligans, de manos atascadas, el turno medio en que sale el comandante y, turno a turno, las tierras y el maná medios y en cuántas partidas llevas una tierra por turno.

---

## Usarla: web publicada o en local

| | Web publicada | En local |
|---|---|---|
| Dirección | https://forja-edh-web.vercel.app | http://localhost:8080 |
| Hay que instalar algo | No | No (Windows y la app de Claude) |
| IA | Desactivada (o con clave de API) | Sí, con tu cuenta de Claude |
| Mis mazos y colección en la nube | Sí | Sí |
| Combos | Sí (`api/combos.js`) | Sí (`serve.ps1`) |
| Todo lo demás | Sí | Sí |

### En local (con la IA de tu cuenta de Claude)

En Windows, sin instalar nada más. La IA usa Claude Code (el `claude.exe` que trae la app de escritorio de Claude) con tu suscripción, así que no hace falta clave de API.

1. Clona el repositorio (o descárgalo) y abre PowerShell en su carpeta.
2. Solo la primera vez, inicia sesión en Claude (se abre el navegador):

   ```bash
   powershell -ExecutionPolicy Bypass -File dev\serve.ps1 -Login
   ```

3. Arranca la web (se abre sola en http://localhost:8080):

   ```bash
   powershell -ExecutionPolicy Bypass -File dev\serve.ps1
   ```

   Deja esa ventana abierta mientras la uses y ciérrala con **Ctrl+C**.

Opciones de `serve.ps1`:

- `-Port 8090`: otro puerto.
- `-NoBrowser`: no abrir el navegador.
- `-ClaudePath "ruta\claude.exe"`: si no encuentra Claude Code solo.

No abras `index.html` con doble clic: el navegador bloquea los módulos JavaScript fuera de un servidor.

---

## La IA

| Dónde | Cómo funciona | Coste |
|---|---|---|
| Local (`serve.ps1`) | `claude.exe` con tu cuenta de Claude | Incluido en tu suscripción |
| Vercel sin `ANTHROPIC_API_KEY` | Desactivada; los botones de IA avisan | 0 € |
| Vercel con `ANTHROPIC_API_KEY` y `ALLOWED_EMAILS` | API de Claude (`api/claude.js`), solo para tu cuenta | Lo que gastes en la API (con límite) |

La web publicada **no puede usar la IA de tu ordenador**, y es a propósito: el servidor local solo acepta peticiones de su propia página, para que ninguna otra web que visites pueda gastar tu cuenta de Claude.

### Activar la IA en Vercel (opcional, de pago)

La IA publicada es **privada**: solo responde a las cuentas que pongas en `ALLOWED_EMAILS`. La web manda la sesión de «Mis mazos» (GitHub o email) y la función comprueba con Supabase que eres tú. Sin sesión, o con otra cuenta, no gasta nada.

1. **Clave y saldo** en https://console.anthropic.com (es independiente de tu suscripción de Claude):
   - **Billing**: compra saldo (el mínimo es 5 $, más IVA). Deja **desactivada la recarga automática**, así nunca se gasta más de lo que cargues.
   - **Limits**: pon un **límite de gasto mensual** (por ejemplo, 5 $).
   - **API Keys → Create Key**: crea una clave y cópiala (solo se ve una vez).
2. En Vercel → tu proyecto → **Settings → Environment Variables** añade:
   - `ANTHROPIC_API_KEY`: la clave.
   - `ALLOWED_EMAILS`: el email con el que entras en «Mis mazos» (lo pone en la caja: «Sesión iniciada como…»). Si hay varios, sepáralos con comas.
   - `CLAUDE_MODEL` (opcional): por defecto `claude-opus-5-5`. Con `claude-sonnet-5-5` cuesta la mitad.
3. **Deployments → ⋯ → Redeploy** en el último despliegue, para que lea las variables.
4. En la web, entra en «Mis mazos» y usa la IA en Analizar o Construir.

Si no pones `ALLOWED_EMAILS` (ni `APP_PASSWORD`, la protección antigua por contraseña), la función **se niega a usar la clave**, para que nadie pueda gastar tu saldo por un olvido. La IA en local (`serve.ps1`) no cambia: sigue usando tu cuenta de Claude sin clave.

Coste aproximado con Claude Opus 5.5 (4 $ por millón de tokens de entrada y 20 $ por millón de salida):

| Acción | Coste aproximado |
|---|---|
| Diagnóstico de estilo | 0,02–0,05 $ |
| Mejoras para un estilo | 0,05–0,15 $ |
| Radiografía | 0,03–0,08 $ |
| Generar un mazo completo | 0,10–0,30 $ |

Si cancelas una respuesta con «Detener», la función corta la llamada para no seguir gastando. La función tiene activado el *fallback* del servidor: si un filtro de seguridad rechazara una petición, la API la reintenta con otro modelo en vez de fallar.

---

## Mis mazos y la nube

### Dónde se guardan

- **Siempre en el navegador** (`localStorage`). Funciona sin cuenta, pero se pierde si borras los datos del navegador, si usas una ventana privada o si cambias de navegador o de dirección (los de `localhost:8080` no aparecen en Vercel).
- **En la nube si entras con tu cuenta** (Supabase). Entonces tus mazos están en cualquier dispositivo y en la versión local y la publicada, y no se pierden aunque borres el navegador.

### Entrar

En **Mis mazos**, en la caja «Guarda tus mazos en la nube»:

- **Entrar con GitHub** (recomendado): al momento. La primera vez GitHub te pide autorizar la app «Forja EDH», que solo lee tu email.
- **Con tu email**: te llega un enlace sin contraseña; ábrelo en el mismo navegador. El plan gratis de Supabase solo envía **2 correos por hora**.

Cada navegador recuerda la sesión, así que solo hay que entrar una vez por dispositivo.

### Cómo sincroniza

- Al entrar, al guardar, editar o borrar un mazo, al volver a la pestaña y con el botón «Sincronizar ahora».
- Por cada mazo gana la versión modificada más recientemente.
- Los borrados también se sincronizan: si borras un mazo en un dispositivo, desaparece en los demás (salvo que en otro lo hayas editado después).
- Los mazos que ya tenías en el navegador se suben la primera vez que entras.
- Si cierras sesión, los mazos se quedan en ese navegador pero dejan de sincronizarse.

### Seguridad

- Cada usuario solo puede ver y modificar sus propios mazos. Lo garantizan las reglas de la base de datos (*Row Level Security*) de `supabase/schema.sql`, no la web.
- En el código solo está la **clave publicable** de Supabase (`js/config.js`), que está pensada para ser pública. La clave secreta de Supabase y el secreto de GitHub **nunca** van en el repositorio.

### Compartir un mazo y recibir sugerencias

1. En **Mis mazos**, con la sesión iniciada, pulsa **Compartir** en un mazo. Se copia un enlace del tipo `https://forja-edh-web.vercel.app/#compartido/…`.
2. Tu amigo lo abre (no necesita cuenta) y ve el mazo con las imágenes:
   - pulsa las cartas que **quitaría** (se marcan en rojo),
   - busca las que **añadiría** (solo salen cartas legales en tus colores),
   - puede escribir el porqué de cada una, su nombre y un mensaje, y pulsa **Enviar sugerencias**.
3. En **Mis mazos**, el mazo muestra **«N sugerencias nuevas»**. Ábrelas, desmarca lo que no quieras y pulsa **Aplicar las marcadas**: el mazo se abre en Analizar con los cambios hechos para que lo revises y pulses **Guardar cambios**. **Descartar** la quita de la lista.
4. **Dejar de compartir** (en el mismo aviso del enlace) hace que el enlace deje de funcionar. Si vuelves a compartir, el enlace es nuevo.

El enlace solo deja ver el nombre del mazo, los comandantes y la lista; nada de tu cuenta. Las sugerencias solo las ves tú.

### Copia de seguridad

Aunque uses la nube, «Exportar copia» descarga todos tus mazos en un `.json` que puedes volver a cargar con «Importar archivo».

---

## Cómo está hecha

Una web estática (HTML, CSS y JavaScript sin frameworks ni compilación) más una función de servidor para la IA.

```
index.html            la página (todas las pestañas)
css/styles.css        estilos (tema oscuro y claro según el sistema)
js/app.js             interfaz: Analizar, Construir, Mis mazos, Probar mano
js/guided.js          constructor «Paso a paso»
js/analysis.js        lectura de listas, estadísticas, bracket y generador automático
js/scryfall.js        acceso a la API de Scryfall (con pausa entre peticiones y caché)
js/ai.js              cliente de /api/claude (respuesta en streaming)
js/currency.js        moneda de los precios ($ o €)
js/combos.js          combos del mazo (cliente de /api/combos)
js/compare.js         pestaña «Comparar»
js/goldfish.js        pestaña «Probar mano»: partida en solitario y simulación
js/collection.js      colección y lista de deseos (datos)
js/colview.js         pestaña «Colección» y panel «Tu colección» de Analizar
js/decks.js           «Mis mazos» en el navegador
js/cloud.js           sincronización de «Mis mazos» y de la colección con Supabase, inicio de sesión, compartir y sugerencias
js/shared.js          vista del mazo compartido (#compartido/…) para sugerir cambios
js/config.js          URL y clave publicable de Supabase (vacías = sin nube)
supabase/schema.sql   tablas (mazos, sugerencias y colección), reglas de seguridad y funciones para compartir
api/claude.js         función de Vercel que llama a Claude con el SDK oficial
api/combos.js         función de Vercel que consulta Commander Spellbook (su API no admite llamadas desde el navegador)
dev/serve.ps1         servidor local: sirve la web y hace de /api/claude (con Claude Code) y de /api/combos
vercel.json           configuración de la función (hasta 300 s)
package.json          dependencia de la función: @anthropic-ai/sdk
```

### Servicios

| Servicio | Para qué | Plan |
|---|---|---|
| [Scryfall](https://scryfall.com/docs/api) | Cartas, imágenes, precios (TCGplayer y Cardmarket), legalidad, ranking de EDHREC | Gratis, sin cuenta |
| [Commander Spellbook](https://commanderspellbook.com) | Combos | Gratis, sin cuenta |
| [Vercel](https://vercel.com) | Publicar la web (y la función de IA) | Hobby, gratis |
| [Supabase](https://supabase.com) | Base de datos e inicio de sesión de Mis mazos | Free |
| GitHub | Código e inicio de sesión con GitHub | Gratis |
| Claude | IA | Tu suscripción (local) o API (opcional) |

---

## Montarla desde cero

Solo hace falta si quieres tu propia copia (otra cuenta, otro proyecto).

### 1. Publicar en Vercel

1. Sube el repositorio a GitHub.
2. En https://vercel.com (entra con GitHub) → **Add New → Project** → importa el repositorio. Framework: **Other**, sin comando de build.
3. **Deploy**. Cada `git push` a `main` vuelve a publicar.

### 2. Base de datos en Supabase

1. Crea una cuenta en https://supabase.com y un proyecto (plan **Free**; región cercana, p. ej. Frankfurt o París).
2. **SQL Editor → New query**: pega `supabase/schema.sql` y pulsa **Run**. Si ya lo tenías de antes, vuelve a ejecutarlo entero cuando se actualice (por ejemplo, para crear la tabla `collections` de la colección); no borra nada.
3. **Authentication → URL Configuration**:
   - **Site URL**: la dirección de tu web en Vercel.
   - **Redirect URLs**: `https://TU-WEB.vercel.app/**` y `http://localhost:8080/**`.
4. **Project Settings → API Keys**: copia la **Project URL** (`https://xxxx.supabase.co`) y la **Publishable key** (`sb_publishable_…`) en `js/config.js`. No uses nunca la *secret key*.

### 3. Entrar con GitHub

1. En GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:
   - **Homepage URL**: tu web de Vercel.
   - **Authorization callback URL**: `https://xxxx.supabase.co/auth/v1/callback` (la de tu proyecto).
2. Copia el **Client ID** y genera un **Client secret**.
3. En Supabase → **Authentication → Sign In / Providers → GitHub**: actívalo, pega el Client ID y el Client secret y guarda.

### 4. Subir los cambios

```bash
git add -A
```

```bash
git commit -m "Configura la nube"
```

```bash
git push
```

---

## Costes y límites

| Parte | Coste | Límites del plan gratis |
|---|---|---|
| Vercel (Hobby) | 0 € | Uso personal y no comercial; de sobra para esta web |
| Supabase (Free) | 0 € | 2 correos de inicio de sesión por hora; el proyecto **se pausa tras una semana sin uso** (los datos no se pierden; se reactiva desde su panel) |
| Scryfall | 0 € | ~10 peticiones por segundo (la web deja 110 ms entre peticiones) |
| IA en local | Incluida en tu suscripción de Claude | Los de tu plan de Claude |
| IA en Vercel | Opcional, de pago por uso | — |

---

## Problemas frecuentes

**«No se pudo enviar el enlace: email rate limit exceeded»**
Supabase gratis solo envía 2 correos de inicio de sesión por hora. Entra con **GitHub** o espera una hora.

**Mis mazos sale vacío en local**
Si el puerto 8080 estaba ocupado, `serve.ps1` arranca en el 8081 (lo dice en la ventana), y cada dirección tiene sus propios mazos del navegador. Cierra lo que ocupa el 8080 o entra en la nube para tenerlos en cualquier dirección.

**La nube no conecta / «Error al sincronizar»**
Si llevas una semana sin usar la web, Supabase pausa el proyecto. Entra en https://supabase.com, abre el proyecto y pulsa **Restore**. Tus mazos siguen ahí.

**El enlace del email no me deja entrar**
Ábrelo en el mismo navegador donde lo pediste. Si lo abres en otro, ese navegador no tiene la información para completar el inicio de sesión.

**La IA dice que no está activa**
En la web publicada es lo normal si no has puesto `ANTHROPIC_API_KEY`. En local, arranca la web con `dev\serve.ps1`; si dice que Claude no tiene la sesión iniciada, ejecuta una vez `dev\serve.ps1 -Login`.

**La IA publicada dice «entra con tu cuenta» o «esta cuenta no tiene acceso»**
Entra en «Mis mazos» con la cuenta cuyo email pusiste en `ALLOWED_EMAILS`. Si sigue fallando, revisa que el email de la variable sea exactamente el que sale en «Sesión iniciada como…» y vuelve a desplegar en Vercel.

**«Se ha alcanzado el límite de uso de la API (o se ha acabado el saldo)»**
Has llegado al límite mensual o al saldo cargado en la consola de Anthropic. Recarga saldo o espera al mes siguiente.

**«La colección no se guarda en la nube: falta su tabla en Supabase»**
Vuelve a ejecutar `supabase/schema.sql` en el **SQL Editor** de Supabase (crea la tabla `collections` y no toca tus mazos). Mientras tanto, la colección se guarda en el navegador.

**Los combos dicen «El buscador de combos no está en este servidor»**
Hace falta `api/combos.js` (Vercel) o `dev\serve.ps1` (local). Si usas otro servidor estático, los combos no funcionan.

**Los precios en euros salen con «–» en alguna carta**
Scryfall no tiene precio de Cardmarket para esa edición. El total del mazo cuenta esas cartas como 0.

**«No encontradas en Scryfall»**
Los nombres tienen que ir en inglés. Hay búsqueda difusa para erratas, pero no traduce del español.

**Una carta sale en la categoría equivocada**
Las etiquetas (ramp, robo, removal, protección…) se calculan leyendo el texto de reglas, así que alguna puede quedar mal clasificada.

---

## Próximas funciones

Ideas apuntadas para hacer más adelante:

- [x] **Comparar dos mazos** (pestaña Comparar).
- [x] **Combos del mazo** con Commander Spellbook, contando para el bracket.
- [x] **Probar mano más completo**: turnos en solitario con maná y simulación de mil partidas.
- [x] **Mazo a presupuesto**, sin IA y con IA.
- [x] **Precios en euros** (Cardmarket).
- [x] **Colección y lista de deseos**, con la lista de la compra de cada mazo y sincronizada en la nube.

---

## Notas

- Las listas se leen en formato «1 Nombre» y se ignoran los códigos de edición, el número de coleccionista y las marcas de foil (`1 Sol Ring (CMM) 410 *F*`). Si hay una sección «Commander» o la marca `*CMDR*`, el comandante se detecta solo; si no, se usan las 1–2 cartas legendarias del último bloque.
- Sideboard, maybeboard y tokens se ignoran.
- El bracket y la nota son estimaciones automáticas (Game Changers, tutores, coste medio, popularidad), no una valoración oficial.
- Los precios son de Scryfall: TCGplayer en dólares o Cardmarket en euros, según la moneda elegida. Nunca se mezclan.
- Proyecto no oficial. Magic: The Gathering, sus cartas e imágenes son de Wizards of the Coast. Datos de cartas de Scryfall y ranking de popularidad de EDHREC.
