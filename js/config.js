/*
 * ============================================================
 *  IAÍ GESTÃO — CONFIGURAÇÃO
 *  Este é o ÚNICO arquivo que precisa ser preenchido para o
 *  sistema funcionar com o banco de dados real.
 *
 *  Enquanto "apiKey" estiver vazio, o sistema abre em
 *  MODO DEMONSTRAÇÃO (dados salvos só neste navegador).
 *
 *  Nada aqui é segredo: estes valores são públicos por natureza.
 *  A proteção dos dados é feita pelas regras do Firestore
 *  (arquivo firebase/firestore.rules).
 * ============================================================
 */
export const CONFIG = {
  // Firebase Console > Configurações do projeto > Seus apps > App da Web > Configuração do SDK
  firebase: {
    apiKey: "AIzaSyAjgwnZa5zqwEEJzWB3WF3OpFNZpEiJOvc",
    authDomain: "iai-gestao.firebaseapp.com",
    projectId: "iai-gestao",
    storageBucket: "iai-gestao.firebasestorage.app",
    messagingSenderId: "446475104853",
    appId: "1:446475104853:web:e22b7eb483375d0effdadc",
  },

  // Cloudinary > Dashboard (Cloud name) e Settings > Upload > Upload presets (preset "Unsigned")
  cloudinary: {
    cloudName: "e0whlvnr",
    uploadPreset: "iai_gestao",
  },

  // Não altere depois que o sistema estiver em uso: os logins dependem deste domínio.
  dominioLogin: "usuarios.iaigestao.app",

  // Versão da biblioteca oficial do Firebase carregada do servidor do Google.
  versaoFirebase: "10.12.2",
};
