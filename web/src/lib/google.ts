// Configuración de «Entrar con Google». Las dos variables van en web/.env (nunca en el código). Sin ellas, el botón no sale.
export const googleActivo = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
export const googleCredenciales = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
});
export const COOKIE_OAUTH = "horma_oauth"; // state.verificador.nonce de un solo uso, solo en /auth/google
