// Nube de «Mis mazos» (Supabase, plan gratuito). Mira el README: «Guardar los mazos en la nube».
// Ambos valores son públicos por diseño (la clave «anon»/«publishable» solo deja hacer lo que
// permiten las reglas de seguridad de supabase/schema.sql), así que pueden ir en el repositorio.
// Si se dejan vacíos, la web funciona igual y los mazos se guardan solo en el navegador.
export const SUPABASE_URL = "https://wweqctqcmutzejdczvld.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_mNYz_5vdXhOLO-xCOvZN9g_Nkotf-WQ"; // clave «publishable» (pública)

// Para apoyar la web (botón «Apoyar» de la cabecera). Vacíos los dos = sin botón. Son públicos: los ve cualquiera.
export const BIZUM = "683193365";       // número de Bizum
export const PAYPAL = "JCastarnado";    // usuario de PayPal.me (https://paypal.me/<usuario>)
