// Campo de fotos: tira/escolhe fotos, envia e mostra miniaturas.
import { html, montar, on, $ } from "../../core/dom.js";
import { icone } from "../../core/icones.js";
import { avisarErro, ampliarFoto } from "../../core/ui.js";
import { enviarFoto, miniatura, fotosConfiguradas } from "../../services/fotos.js";

/** Miniaturas somente leitura */
export function galeria(fotos = []) {
  if (!fotos?.length) return "";
  return html`<div class="fotos">
    ${fotos.map((f) => html`<button type="button" class="foto foto-ampliar" data-ampliar="${f.url}" aria-label="Ampliar foto"><img src="${miniatura(f.url)}" alt="" loading="lazy" /></button>`)}
  </div>`;
}

/** Liga o clique de ampliação das galerias dentro de um elemento */
export function ligarGalerias(el) {
  on(el, "click", "[data-ampliar]", (ev, b) => {
    ev.preventDefault();
    ampliarFoto(b.dataset.ampliar);
  });
}

/**
 * Cria um campo de fotos controlado.
 * campoFotos(container, { fotos, pasta, maximo, aoMudar })
 * Retorna { obter: () => fotos, enviando: () => boolean }
 */
export function campoFotos(container, { fotos = [], pasta = "geral", maximo = 6, aoMudar, rotulo = "Adicionar foto" } = {}) {
  let lista = [...fotos];
  let pendentes = 0;
  const id = `foto-${Math.random().toString(36).slice(2, 8)}`;

  function desenhar() {
    montar(
      container,
      html`<div class="fotos">
        ${lista.map(
          (f, i) => html`<div class="foto">
            <img src="${miniatura(f.url)}" alt="Foto ${i + 1}" data-ampliar="${f.url}" class="foto-ampliar" />
            <button type="button" data-remover="${i}" aria-label="Remover foto">${icone("fechar")}</button>
          </div>`
        )}
        ${Array.from({ length: pendentes }).map(() => html`<div class="foto enviando"></div>`)}
        ${lista.length + pendentes < maximo
          ? html`<label class="btn btn-secundario btn-sm" for="${id}" style="height:76px;flex-direction:column;gap:4px;width:96px;white-space:normal;text-align:center">
              ${icone("camera")}<span style="font-size:11px">${rotulo}</span>
            </label>`
          : ""}
      </div>
      <input type="file" id="${id}" accept="image/*" class="sr-only" multiple />`
    );
    $(`#${id}`, container).addEventListener("change", aoEscolher);
  }

  async function aoEscolher(ev) {
    if (!fotosConfiguradas()) {
      avisarErro(new Error("O envio de fotos ainda não foi configurado (Cloudinary)."));
      return;
    }
    const arquivos = Array.from(ev.target.files || []).slice(0, maximo - lista.length - pendentes);
    ev.target.value = "";
    if (!arquivos.length) return;
    pendentes += arquivos.length;
    desenhar();
    for (const arq of arquivos) {
      try {
        const foto = await enviarFoto(arq, pasta);
        lista.push(foto);
      } catch (e) {
        avisarErro(e);
      } finally {
        pendentes--;
        desenhar();
        aoMudar?.(lista);
      }
    }
  }

  on(container, "click", "[data-remover]", (ev, b) => {
    lista.splice(Number(b.dataset.remover), 1);
    desenhar();
    aoMudar?.(lista);
  });
  on(container, "click", "img[data-ampliar]", (ev, img) => ampliarFoto(img.dataset.ampliar));
  desenhar();
  return { obter: () => [...lista], enviando: () => pendentes > 0 };
}
