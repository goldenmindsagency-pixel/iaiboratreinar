// Roteador por hash (#/caminho?param=valor), compatível com GitHub Pages sem configuração extra.

const rotas = [];
let aoNavegar = null;

/** registrar('/pendencias/:id', { carregar: () => import(...), permitido: () => bool, titulo }) */
export function registrar(padrao, definicao) {
  const nomes = [];
  const regex = new RegExp(
    "^" +
      padrao
        .replace(/\/$/, "")
        .replace(/:([a-zA-Z]+)/g, (_, nome) => {
          nomes.push(nome);
          return "([^/]+)";
        }) +
      "/?$"
  );
  rotas.push({ padrao, regex, nomes, ...definicao });
}

export function lerHash() {
  const bruto = location.hash.replace(/^#/, "") || "/";
  const [caminho, busca = ""] = bruto.split("?");
  const parametrosBusca = Object.fromEntries(new URLSearchParams(busca));
  return { caminho: caminho || "/", busca: parametrosBusca };
}

export function resolver(caminho) {
  for (const rota of rotas) {
    const m = rota.regex.exec(caminho);
    if (m) {
      const params = {};
      rota.nomes.forEach((n, i) => {
        try {
          params[n] = decodeURIComponent(m[i + 1]);
        } catch {
          params[n] = m[i + 1];
        }
      });
      return { rota, params };
    }
  }
  return null;
}

export function navegar(destino, { substituir = false } = {}) {
  const alvo = destino.startsWith("#") ? destino : `#${destino}`;
  if (location.hash === alvo) {
    aoNavegar?.();
    return;
  }
  if (substituir) {
    history.replaceState(null, "", alvo);
    aoNavegar?.();
  } else {
    location.hash = alvo;
  }
}

/** Atualiza parâmetros de busca sem recarregar a página inteira (filtros) */
export function atualizarBusca(parametros, { recarregar = false } = {}) {
  const { caminho, busca } = lerHash();
  const novo = { ...busca, ...parametros };
  Object.keys(novo).forEach((k) => (novo[k] === "" || novo[k] === null || novo[k] === undefined) && delete novo[k]);
  const qs = new URLSearchParams(novo).toString();
  history.replaceState(null, "", `#${caminho}${qs ? `?${qs}` : ""}`);
  if (recarregar) aoNavegar?.();
}

export function iniciarRotas(callback) {
  aoNavegar = callback;
  window.addEventListener("hashchange", () => callback());
}
