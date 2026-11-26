# Forja EDH

Constructor y analizador de mazos de **Magic: The Gathering** para el formato **Commander (EDH)**.

- **Web publicada:** https://forja-edh-web.vercel.app
- **Cartas, imágenes, precios (en $ o en €) y novedades:** en directo desde [Scryfall](https://scryfall.com).
- **Combos:** con los datos gratuitos de [Commander Spellbook](https://commanderspellbook.com).
- **Sinergia con el comandante:** con los datos públicos de [EDHREC](https://edhrec.com) de cada comandante.
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

### Sinergia con el comandante (en toda la web)

Todo lo que sugiere cartas mira primero **qué encaja con tu comandante**, no solo qué es popular en general. Usa los datos de EDHREC de ese comandante: en qué porcentaje de sus mazos se juega cada carta y su **sinergia** (cuánto más se juega con él que con otros comandantes de sus colores). La popularidad general solo desempata.

- **Generar automático**, **Paso a paso** (con la etiqueta «Sinergia» y el «% de mazos» en cada carta), **Sugerencias rápidas** (también propone cortar lo que casi nadie juega con tu comandante) y **A presupuesto** ordenan así las cartas.
- La IA (**Optimizar**, **Que la IA lo genere**, **A presupuesto con IA** y **¿Encaja esta carta?**) recibe la lista de cartas con sinergia que te faltan y las del mazo que casi nadie juega con tu comandante, con la orden de preferir la sinergia a los staples genéricos.
- Si EDHREC no tiene datos de un comandante (muy nuevo o poco jugado), se usa el texto del comandante (tipos de criatura y temas como fichas, contadores o cementerio).

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

- **Optimizar con IA**: lee cómo está montado el mazo y qué pide el comandante, te deja elegir el estilo (reforzar el actual, otro arquetipo o «a mi manera») y el **presupuesto de la mejora** (lo máximo que quieres gastar sumando las cartas nuevas), y propone cortes y añadidos. Cada añadido muestra su precio y su sinergia; los que se pasan del presupuesto se descartan. Cada añadido se comprueba en Scryfall: que exista, que sea legal y que esté en tu identidad de color.
- **Guía del mazo** (IA): cómo se juega el mazo, para ti o para compartir (sustituye a la antigua «Radiografía», que hacía casi lo mismo): el mazo en una frase, cómo gana, mulligan, primeros turnos, medio juego, cómo cerrar, cartas clave, combos, qué le cuesta y consejos. Puedes **copiarla** o, si el mazo está en Mis mazos, **guardarla con él**: entonces se ve en Mis mazos (botón «Guía»), en Analizar («Ver su guía») y en el **enlace compartido**, para que tus amigos sepan jugarlo. Si cambias el mazo, la guía avisa de que es de una versión anterior.
- **Importar por enlace**: pega en el cuadro de la lista el enlace de un mazo público de **Archidekt** y pulsa «Analizar mazo»: se trae solo, con su comandante (sin sideboard ni maybeboard). **Moxfield** no deja leer sus mazos desde otras webs, así que al pegar un enlace suyo te explica cómo copiarlo: en Moxfield, «Export» → «Copy for MTGA», y pegar la lista.
- **Copiar lista** en el formato que quieras: *para Moxfield / Arena* (secciones Commander y Deck), *para Archidekt* (`1x Carta` con la etiqueta `[Commander]`) o *texto simple* (`*CMDR*` en el comandante).
- **Sugerencias rápidas** (sin IA): rellena lo que le falta al esqueleto con las cartas más jugadas en tus colores.
- **A presupuesto**: escribes un precio máximo («déjamelo en 100 €») y propone cambios carta por carta, de la más cara a la más barata, hasta bajar de esa cifra. Sin IA cambia cada carta por una de las más jugadas que cumple la misma función (ramp por ramp, robo por robo, una criatura del tema por otra del tema…) y cuesta mucho menos; con IA, Claude elige los cambios pensando en la sinergia, y la web comprueba que cada cambio sea legal, esté en tus colores y salga más barato. Nada se aplica hasta que pulsas «Cambiar» o «Aplicar todos».
- **Novedades para tu mazo**: cartas nuevas (no reimpresiones) de los últimos 5 meses en tus colores, previews incluidas. Primero salen las que encajan con tu comandante, con la razón: «Sinergia +X %» (EDHREC) o su tema, por ejemplo «Tema «vampire»» (la tribu del comandante manda sobre temas genéricos como las fichas). Después, el resto de novedades.
- **Editar paso a paso**: abre el mazo en el constructor guiado.
- **Guardar en Mis mazos** / **Guardar cambios**.

### Construir

Eliges comandante (y partner o fondo si lo tiene), tema, bracket y **presupuesto del mazo** (lo que quieres que cueste entero, comandante incluido; vacío = sin límite), y:

- **Que la IA lo genere**: Claude arma las 99 (o 98 con dos comandantes) teniendo en cuenta las cartas nuevas.
- **Generar automático** (sin IA): las cartas más jugadas según EDHREC, con cuotas de ramp, robo e interacción y las tierras repartidas según tus colores.
- **Presupuesto total**: con presupuesto, las cartas se eligen con un tope por carta holgado y, si el mazo aun así se pasa, se cambian las más caras por alternativas baratas con la misma función (lo mismo que «A presupuesto» de Analizar) hasta bajar del total. La IA recibe también el presupuesto y lo que cuesta el comandante. Al terminar te dice cuánto cuesta el mazo y cuántas cartas se cambiaron; si no se puede bajar del total sin perder la función de las cartas (por ejemplo, porque el comandante ya es muy caro), te lo avisa.
- **Mi colección**: *Primero las que tengo* pone delante las cartas que marcaste en Colección (salvo que otra tenga mucha más sinergia con el comandante) y *Solo las que tengo* usa únicamente las tuyas, más tierras básicas. Tus cartas entran como candidatas aunque no estén entre las más jugadas. Con IA, Claude recibe tus cartas de esos colores, y en modo «solo» se descartan las que proponga y no tengas. Al terminar te dice cuántas cartas tuyas usa y cuántas te faltan (con su precio); en el panel «Tu colección» de Analizar puedes pasarlas a la lista de deseos.
- Lista de **comandantes nuevos** de los últimos 4 meses.

### Paso a paso

Un constructor guiado:

1. **Eliges comandante**: buscador, filtro por colores («exactos» o «que contengan»), estilos (Fichas, Contadores +1/+1, Agresivo, Aristócratas, Cementerio, Artefactos, Hechizos, Tierras, Voltron, Vida) y los más jugados.
2. **Montas el mazo por categorías**, cada una con su objetivo. **Los objetivos se adaptan a tu comandante**: con los datos de EDHREC se calcula cuántas cartas de cada categoría lleva de media un mazo real de ese comandante (sumando, por categoría, en qué porcentaje de sus mazos aparece cada carta) y se reparte el espacio sin tierras en esas proporciones. Por ejemplo, Kinnan pide unas 21 de aceleración y ningún barrido; Light-Paws (voltron de auras), 13 de protección y solo 4 de aceleración. En cada paso se ve el objetivo adaptado y el general («con Kinnan se suelen jugar 21; lo general son 10»), y con **«Usar las generales»** vuelves a las cifras de siempre (la elección se recuerda). Si EDHREC no tiene datos suficientes del comandante, se usan las generales:

   | Paso | Objetivo general |
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
6. **Mi colección** (en «Filtrar»): *Primero las que tengo* pone tus cartas delante en las sugerencias de cada paso y *Solo las que tengo* esconde el resto. Las tuyas llevan la etiqueta **La tengo**, y debajo ves cuántas cartas del mazo son tuyas y cuánto costaría lo que falta. El Autorrellenar (con y sin IA) respeta esta opción.
7. **Autorrellenar**: cuando ya has puesto las cartas que tenías claras (10, 15, 85…) y no sabes qué más meter, completa el mazo hasta 100:
   - **Con IA**: Claude mira tu comandante y **las cartas que ya has puesto** (tribus, tipos y mecánicas que se repiten) y elige las que faltan, cubriendo primero las categorías que van cortas y manteniendo tu bracket y tu precio máximo por carta. También recibe las cartas con más sinergia según EDHREC.
   - **Rápido (sin IA)**: las que más encajan con el comandante en las categorías que faltan, y luego para el plan del comandante.
   - En los dos casos te enseña la **propuesta agrupada por categoría**, con el motivo de cada carta y el coste total, y **no añade nada hasta que pulsas «Añadir las marcadas»**; puedes desmarcar las que no quieras. Cada carta de la IA se comprueba en Scryfall (que exista, sea legal, esté en tus colores, no esté repetida y respete el precio); si alguna no vale, su hueco se cubre con las que más encajan. Los huecos de tierras que queden se rellenan con básicas según tus colores.

Arriba ves siempre las cartas que llevas (de 100), el precio, el coste medio, el bracket y los Game Changers; a la derecha, tu mazo por categorías y la curva. El borrador se guarda solo. Con **Analizar mazo** pasas a la pestaña Analizar, con **Guardar en Mis mazos** lo guardas y con **+ Nuevo mazo** vuelves a elegir comandante para empezar otro (si el actual tiene cambios sin guardar, te ofrece guardarlo antes).

También sirve para **editar mazos que ya tienes**: desde Analizar o desde Mis mazos, pulsa «Editar paso a paso» y se abre en el primer paso incompleto.

### Mis mazos

Tus mazos guardados, cada uno con el arte del comandante, sus colores, cartas, precio, bracket, nota y fecha.

- **Añadir**: «+ Crear mazo» (te lleva a Paso a paso para elegir comandante), «Pegar lista» (también admite el enlace de un mazo de Archidekt), «Importar archivo» (.txt de Moxfield, Archidekt o ManaBox, varios a la vez, o una copia .json) o guardando desde Analizar / Paso a paso.
- **En cada mazo**: Abrir, Editar paso a paso, Copiar lista, Renombrar, Duplicar y Borrar.
- **Historial de versiones**: cada vez que guardas un mazo con cambios en la lista, la versión anterior se guarda en su historial (las últimas 20, también en la nube). El botón **Historial** de cada mazo muestra las versiones con su fecha, qué cartas entraron y salieron en cada una y, si las hay, notas como «Sugerencias de Pablo». Desde cada versión puedes **Comparar con la actual** (abre la pestaña Comparar) o **Restaurarla**; la versión que había pasa al historial, así que también se puede deshacer.
- **Buscar** por nombre o comandante.
- **Exportar copia**: descarga todos tus mazos en un .json.
- **Nube**: entra con GitHub o con tu email y se sincronizan entre dispositivos (ver [Mis mazos y la nube](#mis-mazos-y-la-nube)).
- **Compartir y recibir sugerencias**: «Compartir» te da un enlace; tus amigos marcan qué quitarían y qué añadirían, y tú decides qué aplicar (ver [Compartir un mazo](#compartir-un-mazo-y-recibir-sugerencias)).
- Si tienes la colección rellena, cada mazo dice **cuántas cartas te faltan**.
- **Publicar**: lo pone en la **Comunidad** con el nombre de autor que elijas (por defecto, tu usuario de GitHub). «✓ En la comunidad» lo quita.

#### Comunidad

La segunda pestaña de «Mis mazos» (`#comunidad`): los mazos que ha publicado todo el mundo, con su comandante, colores, precio, bracket, nota, autor y cuántas sugerencias tienen.

- **Buscar** por nombre, comandante o autor.
- **Ver y sugerir**: abre el mazo carta a carta y le marcas qué quitarías y qué añadirías, igual que con un enlace compartido. No hace falta cuenta. Su dueño lo recibe en «Mis mazos» como cualquier otra sugerencia.
- **Guardar una copia**: lo copia a tus mazos para jugarlo o modificarlo.
- De cada mazo solo se ve el nombre, los comandantes, la lista y el autor que eligió su dueño; nunca su email ni su cuenta.

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

### Instalar como app en el móvil

Forja EDH se puede instalar como una app más, con su icono y a pantalla completa (sin la barra del navegador):

- **Android (Chrome)** y **ordenador (Chrome o Edge)**: aparece el botón **Instalar app** arriba (o la opción «Instalar» / «Añadir a pantalla de inicio» del menú del navegador).
- **iPhone / iPad**: abre la web en **Safari**, pulsa **Compartir** (el cuadrado con la flecha) y elige **Añadir a pantalla de inicio**. El botón **Instalar app** de arriba lo explica.

Al mantener pulsado el icono hay accesos directos a Paso a paso, Mis mazos y Probar mano. La app siempre carga la versión más reciente de la web; si no hay conexión, abre la última que se guardó (para buscar cartas sí hace falta internet). En pantallas pequeñas la cabecera es más compacta, las pestañas se deslizan y la mano de Probar mano y las sugerencias de Paso a paso caben mejor.

Por dentro: `manifest.json` (nombre, colores, iconos de `icons/`) y `sw.js` (service worker con estrategia «red primero»).

### Apoyar la web (Bizum y PayPal)

El botón **☕ Apoyar** de la cabecera abre una ventana con dos formas de ayudar: el número de **Bizum** con un botón para copiarlo (se envía desde la app del banco) y un enlace a **PayPal.me**, donde quien quiera elige la cantidad y paga con su cuenta o con tarjeta. Los dos datos están en `js/config.js` (`BIZUM` y `PAYPAL`): si dejas uno vacío, desaparece esa opción, y si dejas los dos, desaparece el botón. Ojo: son públicos, los ve cualquiera que abra la web.

### Sugerencias

El botón **Sugerencias** (arriba) abre un formulario para mandar ideas o avisar de fallos: eliges si es una idea, algo que no funciona u otra cosa, lo escribes y, si quieres, pones tu nombre. No hace falta cuenta. Si has entrado con tu cuenta en «Mis mazos», debajo ves las que has enviado, si ya se han leído y la respuesta.

Los administradores las ven en la pantalla **Admin**, arriba del todo: nuevas, pendientes o todas; les cambian el estado (Enviada, Leída, ¡Hecha!, Descartada), las responden o las borran. Se guardan en la tabla `feedback` de Supabase: quien envía no puede leer las de los demás.

Para activarlo hay que ejecutar en Supabase la parte de `supabase/schema.sql` que empieza por «Sugerencias para la web» (o el archivo entero, que se puede ejecutar varias veces).

### Novedades

El botón **Novedades** de arriba abre la lista de lo último que se ha añadido a la web, agrupado por fecha y con un enlace para ir a probar cada cosa. El botón muestra cuántas novedades no has visto todavía (se recuerda en tu navegador). Se puede enlazar directamente: https://forja-edh-web.vercel.app/#novedades

Para añadir una novedad, se pone **arriba** en `js/changelog.js` con el siguiente número de `id`, la fecha, un título, un texto corto pensado para quien visita la web y la pestaña donde está (`ir`).

### Probar mano

- Roba 7 cartas con las imágenes reales y haz mulligan con la regla de Commander (el primero es gratis; luego eliges qué cartas van al fondo).
- **Juega los primeros turnos** en solitario: cada turno robas (puedes elegir si se roba en el turno 1, como en multijugador), bajas una tierra y lanzas hechizos si te llega el maná. El maná lo dan las tierras y las piedras o criaturas de maná (las criaturas, a partir del turno siguiente). Los hechizos de ramp que buscan tierras las ponen solas en el campo, y el comandante se lanza desde la zona de mando con su impuesto. Hay un registro de todo lo que pasa.
- **Simular mil partidas**: juega 1.000 partidas automáticas y te dice el porcentaje de mulligans, de manos atascadas, el turno medio en que sale el comandante y, turno a turno, las tierras y el maná medios y en cuántas partidas llevas una tierra por turno.

### Jugar online

El botón **Jugar** (arriba) abre una página aparte, `jugar.html`, para jugar partidas de Commander con amigos, cada uno desde su casa. Funciona como una mesa de verdad: **no aplica las reglas**, cada uno mueve sus cartas y los demás lo ven al momento.

1. **Elige tu mazo** (de «Mis mazos» o pegando una lista) y escribe tu nombre.
2. **Crea una sala** (2 a 4 jugadores, pública o privada) o **únete**: a una de la lista de salas abiertas, con su código de 6 letras o con el enlace que te pasen (`jugar.html#sala=CÓDIGO`). Quien llega cuando la partida ya ha empezado, mira, y si queda sitio puede pulsar **Pedir entrar** y elegir su mazo: al anfitrión le sale la solicitud («Dejarle entrar» o «Rechazar») y, si acepta, el nuevo jugador roba su mano inicial (con mulligan) y juega después del último de la ronda.
3. El anfitrión (quien creó la sala) elige las vidas y pulsa **Empezar**: se sortea el orden y cada uno roba 7 con **mulligan** de Commander (el primero gratis; luego eliges qué cartas van al fondo).

En la mesa:
- **Arrastra** las cartas entre la mano, el campo, el cementerio, el exilio, la biblioteca y la zona de mando. Doble clic en una carta de la mano (o en tu comandante) la juega.
- **Clic** en un permanente lo gira o lo endereza. **Clic derecho** (pulsación larga en el móvil): contadores, boca abajo, copiar como ficha, mandar a otra zona…
- **Biblioteca**: clic para robar; clic derecho para robar varias, barajar, buscar, mirar las X de arriba, moler, revelar o exiliar. **Mirar las X de arriba** te deja ordenarlas con las flechas (la primera queda arriba del todo) y elegir a dónde va cada una: encima, debajo, cementerio, exilio o mano; se aplica todo junto al pulsar «Hecho» (sirve para adivinar, vigilar y similares). Al ver la biblioteca, el cementerio o el exilio puedes **filtrar** por nombre o tipo (en inglés o con palabras como «criatura», «tierra», «instantáneo»).
- **Enseñar cartas**: clic derecho en una carta de tu mano → «Enseñar a los demás» o «Enseñar toda la mano»; «Revelar la de arriba» en la biblioteca. A los demás les sale un aviso con las imágenes, y en el registro quedan en miniatura (al pasar el ratón se ven en grande).
- **Fuerza y resistencia en la carta**: cada criatura del campo muestra su fuerza y resistencia abajo a la derecha (verde si está por encima de lo impreso, rojo si está por debajo). En las tuyas, **clic** en el cuadro de la fuerza o de la resistencia suma 1 y **clic derecho** resta 1; es aparte de los contadores +1/+1 (que siguen con `+`/`−`). El contador (+1/+1 o lealtad) sale arriba a la derecha.
- **Contadores de habilidad**: tecla `H` sobre una carta (o clic derecho → «Fuerza/resistencia y contadores de habilidad…») para ponerle o quitarle contadores de vuela, dañar primero, doble daño, toque mortal, vínculo vital, arrollar, vigilancia, amenaza, alcance, indestructible, antimaleficio, prisa o infectar. Salen en la carta como etiquetas (AR, TM, VV…). Los cambios de fuerza/resistencia y estas habilidades cuentan en el combate y los ven los demás; al salir del campo, la carta los pierde.
- **Deshacer**: «↶ Deshacer» arriba (o `Ctrl+Z`) vuelve atrás tu última acción en tu mesa, hasta 30 seguidas; queda en el registro («deshace: juega Sol Ring»). No se puede deshacer más allá de barajar, buscar o mirar la biblioteca, del mulligan ni del resultado de un combate.
- **Combate** (una ayuda, no un juez):
  - **Atacar**: en tu turno, ratón sobre una criatura y tecla `K` (o clic derecho → «Atacar…»), y eliges a quién: un jugador o uno de sus planeswalkers (o batallas). El botón **⚔ Atacar** ataca con todas tus criaturas enderezadas. Atacar gira la criatura, salvo con vigilancia; `K` otra vez la quita del ataque.
  - **Bloquear**: el atacado pone el ratón sobre una criatura suya enderezada y pulsa `K` (o clic derecho → «Bloquear…») y elige a qué atacante bloquea. Avisa si el atacante vuela o tiene amenaza. Al terminar, «Bloqueos listos» (o «No bloqueo»).
  - **Resolver daño**: el atacante ve una ventana con cada atacante y sus bloqueadores y el resultado: vidas perdidas, daño de comandante (si ataca el comandante), veneno (infectar), lealtad de los planeswalkers, vida ganada por vínculo vital y qué criaturas mueren. Tiene en cuenta arrollar, vínculo vital, toque mortal, dañar primero, doble daño, infectar e indestructible. La fuerza y la resistencia se pueden corregir (equipos, auras, efectos) y se puede desmarcar una criatura que no deba morir. Al aplicar, cada jugador recibe el resultado en su mesa.
  - Fuerza, resistencia y habilidades salen de Scryfall; los contadores de una criatura cuentan como +1/+1 y los de un planeswalker como su lealtad (los planeswalkers entran con su lealtad inicial). Al pasar el turno, el combate se olvida.
- **Señalar**: clic derecho en una carta del campo (tuya o de otro jugador) → «Señalar», o ratón encima y tecla `S`; clic derecho en el panel de un jugador → «Señalar a…». Brilla 5 segundos en la pantalla de todos y queda en el registro. Sirve para decir a quién atacas o qué carta es el objetivo.
- **Cartas de dos caras**: en el campo, clic derecho → **Transformar** (o tecla `T`) para darles la vuelta; los demás ven la cara nueva. Al salir del campo vuelven a su cara de delante.
- **Comandante**: si va al cementerio o al exilio vuelve solo a la zona de mando, y cada vez que lo lanzas desde ahí suma el impuesto (+2).
- **Vidas, veneno y daño de comandante** de cada rival (suma 21 y se marca en rojo). **Fichas** (busca cualquier ficha de Magic por su nombre en inglés) y **dados** (d6, d20 y moneda).
- **Pasar turno** (botón o tecla `Espacio`): al empezar tu turno se enderezan tus permanentes; robar lo haces tú (clic en la biblioteca o tecla `R`), como en la mesa.
- **Perder y ganar**: pierdes al llegar a 0 vidas, a 10 contadores de veneno o a 21 de daño del comandante de un mismo rival. Te sale «Has perdido» (puedes seguir mirando), los demás te ven como eliminado y tus turnos se saltan. Cuando solo queda uno, a todos les sale quién ha ganado. Si fue un error al contar, «Ha sido un error: volver» te devuelve a la partida. Con **Rendirse** te retiras cuando quieras (cuenta como perder).
- **Si alguien se desconecta**: en su panel, el anfitrión puede **saltar su turno** (si se fue en su turno) o **darlo por eliminado**, para que la partida no se quede parada. Si vuelve a entrar, ve que lo dieron por eliminado y puede reincorporarse con «Ha sido un error: volver».
- **Un panel por jugador**: con dos, uno encima del otro; con tres o cuatro, en cuadrantes (tú abajo). Cada panel tiene de fondo el arte de su comandante, sus **vidas** arriba a la izquierda, su nombre arriba en el centro, su **mano** abajo a la izquierda (la de los rivales, en dorsos de carta) y sus zonas abajo a la derecha: **BIB**, **CEM** y **EXILIO** con la última carta a la vista y **CMD** con el comandante. El panel de quien tiene el turno se marca en dorado. En el tuyo, la flecha junto a las vidas despliega el veneno y el daño de comandante.
- **Atajos de teclado** (botón «Atajos» o tecla `?`). Con el ratón encima de una carta tuya: `G` girar/enderezar, `C` copiarla (crea una ficha igual), `J` jugarla, `M` a la mano, `Supr` al cementerio, `X` al exilio, `A`/`Z` encima/debajo de la biblioteca, `V` boca abajo, `T` transformar, `S` señalar (también las cartas de los demás), `K` atacar o bloquear, `H` fuerza/resistencia y contadores de habilidad, `+`/`−` contadores. En cualquier sitio: `Ctrl+Z` deshacer, `R` robar, `B` barajar, `E` enderezar todo, `Espacio` o `P` pasar turno, `F` crear ficha, `D` dado, `L` registro. El menú del clic derecho también enseña la tecla de cada opción.
- A la derecha, el **registro** de todo lo que hace cada uno y el **chat**. Pasa el ratón por una carta para verla en grande.
- Si recargas o se te cierra la página, vuelve a entrar en la sala (mismo enlace) y recuperas tu mesa. Quien entra a mitad de partida (o se reconecta) recibe del anfitrión lo último del registro y del chat. Las mesas guardadas en el navegador se borran solas a la semana.

Cómo funciona por dentro: usa **Supabase Realtime** (el mismo proyecto de Supabase de «Mis mazos»; no hace falta crear tablas ni ejecutar SQL). Cada navegador manda a los demás solo lo público de su mesa; tu mano y tu biblioteca nunca salen de tu navegador (los demás solo ven cuántas cartas tienes). No hace falta cuenta para jugar.

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
   - `CLAUDE_MODEL` (opcional): por defecto `claude-haiku-5-5`, el más barato (0,10 $ / 0,50 $ por millón de tokens de entrada / salida). Si quieres respuestas más finas: `claude-sonnet-5-5` (2 $ / 10 $) o `claude-opus-5-5` (4 $ / 20 $).
3. **Deployments → ⋯ → Redeploy** en el último despliegue, para que lea las variables.
4. En la web, entra en «Mis mazos» y usa la IA en Analizar o Construir.

Si no pones `ALLOWED_EMAILS` (ni `APP_PASSWORD`, la protección antigua por contraseña), la función **se niega a usar la clave**, para que nadie pueda gastar tu saldo por un olvido. La IA en local (`serve.ps1`) no cambia: sigue usando tu cuenta de Claude sin clave.

### Pantalla Admin: quién tiene IA y cuánto se gasta

Solo para el administrador (tú): con la sesión iniciada aparece el botón **Admin** arriba (o https://forja-edh-web.vercel.app/#admin).

- **Acceso a la IA**: escribe un email y pulsa **Dar acceso**, o pulsa **Dar IA** en alguien de la lista «Gente que ha entrado en la web». Puedes **pausar** o **quitar** el acceso. Los cambios son al momento, sin tocar Vercel. Tu amigo tiene que entrar en «Mis mazos» con una cuenta que tenga ese email.
- **Consumo**: lo gastado este mes frente a tu límite (escríbelo una vez; se recuerda), respuestas y tokens, un gráfico de gasto por día de los últimos 30 días, el gasto por persona y por función (Optimizar, Autorrellenar, ¿Encaja?…) y las últimas respuestas. El coste se calcula con los precios de la API; el dato exacto siempre está en la consola de Anthropic. Solo cuenta la IA de la web publicada.

Cómo funciona por dentro: los administradores son los de `ALLOWED_EMAILS` en Vercel **y** la tabla `admins` de Supabase. El resto de personas con IA están en la tabla `ai_access`, y cada respuesta se apunta en `ai_usage` (ver `supabase/schema.sql`). Las reglas de la base de datos hacen que solo un administrador pueda ver o cambiar esas tablas, aunque alguien abra `#admin` a mano. Para añadir otro administrador: `insert into public.admins (email) values ('su@email.com');` en el SQL Editor y añadir su email a `ALLOWED_EMAILS`.

Coste aproximado con Claude Opus 5.5 (4 $ por millón de tokens de entrada y 20 $ por millón de salida):

| Acción | Coste aproximado |
|---|---|
| Diagnóstico de estilo | 0,02–0,05 $ |
| Mejoras para un estilo | 0,05–0,15 $ |
| Guía del mazo | 0,02–0,10 $ (con Haiku, céntimos) |
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

El enlace solo deja ver el nombre del mazo, los comandantes y la lista; nada de tu cuenta. Las sugerencias solo las ves tú. Dejar de compartir un mazo también lo quita de la comunidad.

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
js/edhrec.js          datos de EDHREC de cada comandante: sinergia y % de mazos (cliente de /api/edhrec)
js/compare.js         pestaña «Comparar»
js/goldfish.js        pestaña «Probar mano»: partida en solitario y simulación
js/collection.js      colección y lista de deseos (datos)
js/colview.js         pestaña «Colección» y panel «Tu colección» de Analizar
js/decks.js           «Mis mazos» en el navegador
js/cloud.js           sincronización de «Mis mazos» y de la colección con Supabase, inicio de sesión, compartir y sugerencias
js/shared.js          vista del mazo compartido (#compartido/…) para sugerir cambios
js/exchange.js        importar por enlace (Archidekt) y exportar con el formato de cada web
js/changelog.js       lista de «Novedades» (lo último añadido, para quien visita la web)
js/admin.js           pantalla Admin (#admin): sugerencias, acceso a la IA y consumo
js/feedback.js        pestaña «Sugerencias» (#sugerencias): enviar ideas o fallos y ver las respuestas
jugar.html            página «Jugar»: salas y mesa de juego online
css/play.css          estilos de «Jugar»
js/play.js            «Jugar»: vestíbulo, sala, mesa, mulligan, arrastrar cartas, registro y chat
js/playnet.js         salas en tiempo real con Supabase Realtime (Presence y Broadcast)
js/combat.js          «Jugar»: cálculo del daño de combate (arrollar, vínculo vital, toque mortal…)
manifest.json         datos de la app instalable (nombre, colores, iconos)
sw.js                 service worker: app instalable y sin conexión (red primero)
icons/                iconos de la app
js/config.js          URL y clave publicable de Supabase (vacías = sin nube)
supabase/schema.sql   tablas (mazos, sugerencias y colección), reglas de seguridad y funciones para compartir y para la comunidad
api/claude.js         función de Vercel que llama a Claude con el SDK oficial
api/archidekt.js      función de Vercel: puente con la API pública de Archidekt para importar mazos
api/combos.js         función de Vercel que consulta Commander Spellbook (su API no admite llamadas desde el navegador)
api/edhrec.js         función de Vercel que lee los datos de EDHREC de cada comandante (tampoco admite llamadas desde el navegador)
dev/serve.ps1         servidor local: sirve la web y hace de /api/claude (con Claude Code), /api/combos y /api/edhrec
vercel.json           configuración de la función (hasta 300 s)
package.json          dependencia de la función: @anthropic-ai/sdk
```

### Servicios

| Servicio | Para qué | Plan |
|---|---|---|
| [Scryfall](https://scryfall.com/docs/api) | Cartas, imágenes, precios (TCGplayer y Cardmarket), legalidad, ranking de EDHREC | Gratis, sin cuenta |
| [Commander Spellbook](https://commanderspellbook.com) | Combos | Gratis, sin cuenta |
| [EDHREC](https://edhrec.com) | Qué se juega con cada comandante y su sinergia | Gratis, sin cuenta |
| [Vercel](https://vercel.com) | Publicar la web (y la función de IA) | Hobby, gratis |
| [Supabase](https://supabase.com) | Base de datos e inicio de sesión de Mis mazos; salas en tiempo real de «Jugar» | Free (hasta 200 conexiones a la vez) |
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

**«La comunidad aún no está activada»**
Vuelve a ejecutar `supabase/schema.sql` entero en el **SQL Editor** de Supabase (añade las columnas y funciones de la comunidad; no borra nada).

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
