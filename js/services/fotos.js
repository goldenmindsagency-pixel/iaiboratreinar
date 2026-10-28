// Fotos: reduz a imagem no aparelho antes de enviar e guarda no Cloudinary.
// No modo demonstração, a foto reduzida fica no próprio navegador.
import { CONFIG } from "../config.js";
import { sessao } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const LIMITE_ENTRADA = 25 * 1024 * 1024;

export function fotosConfiguradas() {
  return sessao.modoDemo || Boolean(CONFIG.cloudinary?.cloudName && CONFIG.cloudinary?.uploadPreset);
}

function carregarImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ErroSistema("validacao", "Não foi possível ler esta imagem. Tente uma foto em JPG ou PNG."));
    };
    img.src = url;
  });
}

/** Redimensiona para no máximo `lado` px e converte para JPEG */
export async function comprimir(arquivo, { lado = 1600, qualidade = 0.78 } = {}) {
  if (!arquivo.type.startsWith("image/") && !TIPOS.includes(arquivo.type)) {
    throw new ErroSistema("validacao", "Envie apenas imagens (JPG, PNG ou WEBP).");
  }
  if (arquivo.size > LIMITE_ENTRADA) throw new ErroSistema("validacao", "A imagem é muito grande (máximo 25 MB).");
  const img = await carregarImagem(arquivo);
  const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", qualidade));
  if (!blob) throw new ErroSistema("validacao", "Não foi possível processar a imagem.");
  return { blob, largura: w, altura: h, canvas };
}

/**
 * Envia uma foto. pasta: ex. "gandu/limpeza".
 * Retorna { url, publicId, largura, altura }.
 */
export async function enviarFoto(arquivo, pasta = "geral") {
  if (!navigator.onLine && !sessao.modoDemo) throw new ErroSistema("sem-conexao", "Sem internet: não é possível enviar fotos agora.");
  if (sessao.modoDemo) {
    const { canvas } = await comprimir(arquivo, { lado: 640, qualidade: 0.6 });
    return { url: canvas.toDataURL("image/jpeg", 0.6), publicId: "", largura: canvas.width, altura: canvas.height };
  }
  if (!fotosConfiguradas()) throw new ErroSistema("configuracao", "O envio de fotos ainda não foi configurado (Cloudinary).");
  const { blob, largura, altura } = await comprimir(arquivo);
  const form = new FormData();
  form.append("file", blob, "foto.jpg");
  form.append("upload_preset", CONFIG.cloudinary.uploadPreset);
  form.append("folder", `iai-gestao/${pasta}`.replace(/[^a-zA-Z0-9/_-]/g, ""));
  let resposta;
  try {
    resposta = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CONFIG.cloudinary.cloudName)}/image/upload`, {
      method: "POST",
      body: form,
    });
  } catch (e) {
    throw new ErroSistema("sem-conexao", "Falha de conexão ao enviar a foto. Tente novamente.", e);
  }
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !json.secure_url) {
    throw new ErroSistema("desconhecido", `O serviço de fotos recusou o envio${json?.error?.message ? `: ${json.error.message}` : "."}`);
  }
  return { url: json.secure_url, publicId: json.public_id || "", largura: json.width || largura, altura: json.height || altura };
}

/** URL de miniatura (Cloudinary gera a versão reduzida automaticamente) */
export function miniatura(url, lado = 240) {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/c_fill,w_${lado},h_${lado},q_auto,f_auto/`);
}
