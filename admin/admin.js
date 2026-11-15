const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const iconPaths = {
  external: "M13 5h6v6m0-6-9 9m7-1v6H5V7h6",
  plus: "M12 5v14M5 12h14",
  logout: "M10 4H5v16h5m2-8h8m-3-3 3 3-3 3",
  megaphone: "M4 10v4h4l8 4V6l-8 4H4zm4 4 2 5m9-9 2-2m-2 6 2 2",
  upload: "M12 16V4m-4 4 4-4 4 4M5 15v5h14v-5",
  save: "M5 4h12l3 3v13H4V4h1zm3 0v6h8V4M8 20v-6h8v6",
  eye: "M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6zm13 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0z",
  eyeOff: "m3 3 18 18M9 6a11 11 0 0 1 3 0c6 0 10 6 10 6a18 18 0 0 1-3 3m-3 2a10 10 0 0 1-4 1c-6 0-10-6-10-6a18 18 0 0 1 4-4",
  edit: "m4 16 12-12 4 4-12 12H4zm10-10 4 4",
  trash: "M4 7h16m-10 0V4h4v3M6 7l1 13h10l1-13m-8 4v5m4-5v5",
  close: "m6 6 12 12M18 6 6 18",
  copy: "M9 9h11v11H9zM15 6V4H4v11h2",
  settings: "M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4",
};

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[name]}"></path></svg>`;
}

document.querySelectorAll("[data-icon]").forEach((element) => {
  element.insertAdjacentHTML("afterbegin", icon(element.dataset.icon));
});

function inventoryButton(action, product, variant, glyph, label) {
  return `<button type="button" class="icon-button ${action === "deleteV" ? "danger" : ""}"
    data-a="${action}" data-p="${esc(product)}" data-v="${esc(variant || "")}"
    aria-label="${esc(label)}" title="${esc(label)}">${icon(glyph)}</button>`;
}

let catalog,
  token = "",
  repo = "",
  branch = "",
  baseSha = "",
  demo = false,
  dirty = false,
  edit = {},
  pendingDelete;
const uploads = new Map();
let busy = false;
function status(t) {
  $("#status").textContent = t;
}
function changed() {
  dirty = true;
  $("#dirty").textContent = "Hay cambios sin publicar.";
  render();
}
function safePhoto(p) {
  p = String(p || "").replace(/^\/+/, "");
  return p.startsWith("assets/productos/") && !p.split("/").includes("..")
    ? "../" + p
    : "";
}
async function api(path, method = "GET", body) {
  const r = await fetch("https://api.github.com/repos/" + repo + "/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!r.ok)
    throw Error(
      r.status === 401
        ? "La sesión venció. Vuelve a iniciar sesión con GitHub."
        : r.status === 403
          ? "GitHub rechazó el acceso. Verifica la instalación de MODAC Admin y el permiso Contents: Read and write."
          : r.status === 404
            ? "GitHub no encontró el recurso. Verifica el repositorio, la rama y el acceso de la aplicación."
            : r.status === 409 || r.status === 422
              ? "GitHub rechazó el cambio. Revisa si la rama avanzó o tiene reglas de protección."
              : `GitHub respondió ${r.status}. No se publicaron los cambios.`,
    );
  return r.status === 204 ? null : r.json();
}
function decode64(s) {
  return new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)),
  );
}
function start() {
  $("#login").hidden = true;
  $("#workspace").hidden = false;
  loadStoreContent();
  $("#dirty").textContent = "";
  render();
  status(
    demo
      ? "Modo demostración: los cambios solo existen en esta pestaña."
      : "Conectado. Puedes editar y publicar tu catálogo.",
  );
}
let authConfig, authPopup, authOrigin;
fetch("config.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((c) => {
    authConfig = c;
    if (!c.auth_url || !c.repo) {
      $("#authNotice").textContent =
        "El acceso con GitHub está preparado, pendiente de conectar al repositorio y activar la autenticación.";
      $("#githubLogin").disabled = true;
    }
  })
  .catch(() => {
    $("#authNotice").textContent =
      "No se pudo cargar la configuración del acceso.";
    $("#githubLogin").disabled = true;
  });
$("#githubLogin").onclick = () => {
  if (!authConfig?.auth_url || !authConfig?.repo) return;
  try {
    const url = new URL(authConfig.auth_url);
    if (url.protocol !== "https:")
      throw Error("El acceso requiere una dirección HTTPS.");
    repo = authConfig.repo;
    branch = authConfig.branch || "main";
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
      throw Error("Configura el repositorio del catálogo.");
    authOrigin = url.origin;
    authPopup = window.open(url.href, "modac-github", "width=600,height=750");
    if (!authPopup)
      throw Error("Permite la ventana de inicio de sesión de GitHub.");
    status("Completa el inicio de sesión en GitHub.");
  } catch (e) {
    status(e.message);
  }
};
window.addEventListener("message", async (event) => {
  if (
    event.origin !== authOrigin ||
    event.source !== authPopup ||
    event.data?.type !== "modac-github-auth"
  )
    return;
  authPopup?.close();
  if (event.data.error) {
    status(
      "No se pudo iniciar sesión. Revisa que tu cuenta tenga acceso al repositorio.",
    );
    return;
  }
  if (typeof event.data.access_token !== "string") return;
  try {
    token = event.data.access_token;
    const ref = await api("git/ref/heads/" + encodeURIComponent(branch));
    baseSha = ref.object.sha;
    const file = await api(
      "contents/productos.json?ref=" + encodeURIComponent(baseSha),
    );
    catalog = JSON.parse(decode64(file.content));
    if (!Array.isArray(catalog.productos))
      throw Error("Formato del catálogo no válido.");
    demo = false;
    start();
  } catch (e) {
    token = "";
    status(e.message);
  }
});
$("#localPreview").onclick = async () => {
  try {
    catalog = await fetch("../productos.json", { cache: "no-cache" }).then(
      (r) => r.json(),
    );
    demo = true;
    start();
  } catch {
    status("Abre el panel desde un servidor web o GitHub Pages.");
  }
};
$("#logout").onclick = () => {
  if (dirty && !confirm("¿Cerrar sin publicar tus cambios?")) return;
  token = "";
  catalog = null;
  uploads.clear();
  dirty = false;
  $("#workspace").hidden = true;
  $("#login").hidden = false;
  status("Sesión cerrada.");
};
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
$("#inventorySearch").addEventListener("input", render);
function render() {
  const query = $("#inventorySearch").value.trim().toLocaleLowerCase("es");
  const matchingProducts = catalog.productos.filter((product) => {
    const details = product.variantes.map((variant) =>
      [variant.id, variant.color, variant.talla].join(" "),
    );
    return [product.nombre, ...details]
      .join(" ")
      .toLocaleLowerCase("es")
      .includes(query);
  });
  $("#adminProducts").innerHTML = matchingProducts
    .map(
      (p) =>
        `<article class="product">
          <div class="product-head">
            <div><h3>${esc(p.nombre)}</h3><p>${esc(p.categoria)}${p.visible ? "" : " · Oculto"}</p></div>
            <div class="icon-group">
              ${inventoryButton("toggleP", p.id, "", p.visible ? "eyeOff" : "eye", p.visible ? "Ocultar diseño" : "Mostrar diseño")}
              ${inventoryButton("editP", p.id, "", "edit", "Editar diseño")}
              ${inventoryButton("addV", p.id, "", "plus", "Agregar color o talla")}
            </div>
          </div>
          ${p.variantes.map((v) => `<div class="variant">
            <img src="${esc(uploads.get(v.foto)?.preview || safePhoto(v.foto))}" alt="${esc(v.color)}">
            <div class="variant-detail"><strong>${esc(v.color)} · ${esc(v.talla)}</strong>
              <span>S/ ${Number(v.precio).toFixed(2)}${v.visible ? "" : " · Oculta"}</span></div>
            <div class="icon-group">
              ${inventoryButton("editV", p.id, v.id, "edit", "Editar variante")}
              ${inventoryButton("toggleV", p.id, v.id, v.visible ? "eyeOff" : "eye", v.visible ? "Ocultar variante" : "Mostrar variante")}
              ${inventoryButton("deleteV", p.id, v.id, "trash", "Eliminar variante")}
            </div>
          </div>`).join("")}
        </article>`,
    )
    .join("");
  $("#adminProducts")
    .querySelectorAll("[data-a]")
    .forEach((b) => (b.onclick = () => action(b.dataset)));
}
function action(a) {
  let p = catalog.productos.find((p) => p.id === a.p),
    v = p?.variantes.find((v) => v.id === a.v);
  if (a.a === "toggleP") {
    p.visible = !p.visible;
    changed();
  }
  if (a.a === "toggleV") {
    v.visible = !v.visible;
    changed();
  }
  if (a.a === "deleteV") {
    pendingDelete = { p, v };
    $("#confirm").showModal();
  }
  if (["editP", "addV", "editV"].includes(a.a)) openEditor(a.a, p, v);
}
$("#cancelDelete").onclick = () => $("#confirm").close();
$("#confirmDelete").onclick = () => {
  const { p, v } = pendingDelete;
  p.variantes = p.variantes.filter((x) => x !== v);
  if (!p.variantes.length) p.visible = false;
  $("#confirm").close();
  changed();
};
$("#newProduct").onclick = () => openEditor("new");
$("#cancelEditor").onclick = () => $("#editor").close();
function openEditor(mode, p, v) {
  edit = { mode, p, v };
  $("#editForm").reset();
  $("#editorTitle").textContent =
    mode === "new"
      ? "Nuevo diseño"
      : mode === "addV"
        ? "Agregar variante"
        : mode === "editV"
          ? "Editar variante"
          : "Editar diseño";
  $("#name").value = p?.nombre || "";
  $("#category").value = p?.categoria || "Otros diseños";
  $("#showProduct").checked = p?.visible ?? true;
  $("#editorStatus").textContent = "";
  $("#variantFields").hidden = mode === "editP";
  $("#variantFields").querySelectorAll("input, select").forEach((field) => {
    field.disabled = mode === "editP";
  });
  $("#color").required = mode !== "editP";
  $("#name").readOnly = mode === "addV" || mode === "editV";
  $("#category").disabled = mode === "addV" || mode === "editV";
  $("#showProduct").disabled = mode === "addV" || mode === "editV";
  $("#color").value = v?.color || "";
  $("#variantSize").value = v?.talla || "M";
  $("#price").value = v?.precio || catalog.precio;
  $("#showVariant").checked = v?.visible ?? true;
  $("#preview").style.display = v ? "block" : "none";
  $("#preview").src = v
    ? uploads.get(v.foto)?.preview || safePhoto(v.foto)
    : "";
  $("#file").value = "";
  $("#editor").showModal();
}
$("#file").onchange = () => {
  let f = $("#file").files[0];
  if (f) {
    $("#preview").src = URL.createObjectURL(f);
    $("#preview").style.display = "block";
  }
};
async function processImage(f) {
  if (f.size > 20 * 1024 * 1024)
    throw Error("La foto debe pesar menos de 20 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(f.type))
    throw Error("Usa una foto JPG, PNG o WebP.");
  const bitmap = await createImageBitmap(f);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const url = c.toDataURL("image/webp", 0.88);
  if (!url.startsWith("data:image/webp"))
    throw Error(
      "Tu navegador no permite convertir esta foto. Prueba con Chrome o Edge.",
    );
  return { base64: url.split(",")[1], preview: url };
}
$("#editForm").onsubmit = async (e) => {
  e.preventDefault();
  const b = e.submitter;
  b.disabled = true;
  try {
    let { mode, p, v } = edit;
    const name = $("#name").value.trim();
    if (!name) throw Error("Escribe el nombre del diseño.");
    if (mode === "editP") {
      p.nombre = name;
      p.categoria = $("#category").value;
      p.visible = $("#showProduct").checked;
    } else {
      let file = $("#file").files[0];
      if (!v && !file) throw Error("Selecciona una foto para la variante.");
      let price = Number($("#price").value);
      if (!(price > 0)) throw Error("El precio debe ser mayor a cero.");
      let foto = v?.foto;
      if (file) {
        let u = await processImage(file);
        foto = "assets/productos/polo-" + crypto.randomUUID() + ".webp";
        uploads.set(foto, u);
      }
      let variant = {
        id: v?.id || "MODAC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        color: $("#color").value.trim(),
        talla: $("#variantSize").value,
        precio: price,
        foto,
        visible: $("#showVariant").checked,
      };
      if (!variant.color) throw Error("Escribe el color.");
      if (mode === "new") {
        p = {
          id: "diseno-" + crypto.randomUUID().slice(0, 8),
          nombre: name,
          categoria: $("#category").value,
          visible: $("#showProduct").checked,
          variantes: [],
        };
        catalog.productos.push(p);
      }
      if (v) Object.assign(v, variant);
      else p.variantes.push(variant);
    }
    changed();
    $("#editor").close();
  } catch (err) {
    $("#editorStatus").textContent = err.message;
  } finally {
    b.disabled = false;
  }
};
$("#publish").onclick = async () => {
  if (!dirty) {
    status("No hay cambios pendientes.");
    return;
  }
  if (demo) {
    status(
      "Estás en demostración: no se publicó nada. Conecta tu repositorio para guardar.",
    );
    return;
  }
  if (busy) return;
  busy = true;
  $("#publish").disabled = true;
  $("#workspace").inert = true;
  try {
    status("Guardando en GitHub…");
    const ref = await api("git/ref/heads/" + encodeURIComponent(branch));
    if (ref.object.sha !== baseSha)
      throw Error(
        "El repositorio cambió desde que lo abriste. Recarga y vuelve a aplicar los cambios para no sobrescribirlos.",
      );
    const parent = await api("git/commits/" + baseSha),
      tree = [];
    const referenced = new Set(
      catalog.productos.flatMap((p) => p.variantes.map((v) => v.foto)),
    );
    for (const [path, u] of uploads) {
      if (!referenced.has(path)) continue;
      const blob = await api("git/blobs", "POST", {
        content: u.base64,
        encoding: "base64",
      });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    tree.push({
      path: "productos.json",
      mode: "100644",
      type: "blob",
      content: JSON.stringify(catalog, null, 2) + "\n",
    });
    const t = await api("git/trees", "POST", {
      base_tree: parent.tree.sha,
      tree,
    });
    const commit = await api("git/commits", "POST", {
      message: "Actualizar catálogo MODAC desde administración",
      tree: t.sha,
      parents: [baseSha],
    });
    await api("git/refs/heads/" + encodeURIComponent(branch), "PATCH", {
      sha: commit.sha,
      force: false,
    });
    baseSha = commit.sha;
    dirty = false;
    uploads.clear();
    $("#dirty").textContent = "Cambios guardados en GitHub.";
    status(
      "Guardado. GitHub Pages mostrará los cambios al terminar su actualización.",
    );
    render();
  } catch (err) {
    status(err.message + " Tus cambios siguen en el borrador de esta pestaña.");
  } finally {
    busy = false;
    $("#workspace").inert = false;
    $("#publish").disabled = false;
  }
};

const defaultCustomDescription =
  "Cuéntanos qué diseño imaginas. Completa los datos y comparte tu referencia para cotizar tu polo personalizado.";

function loadStoreContent() {
  const { personalizacion, promocion, anuncio } = catalog.contenido || {};
  $("#customTitle").value = personalizacion?.titulo ?? "Personaliza tu estampado";
  $("#customDescription").value = personalizacion?.descripcion ?? defaultCustomDescription;
  $("#promoDescription").value = promocion?.descripcion ?? "";
  $("#bannerTitle").value = anuncio?.titulo ?? "";
  $("#bannerMessage").value = anuncio?.mensaje ?? "";
  $("#bannerAction").value = anuncio?.accion ?? "";
  $("#bannerActive").checked = anuncio?.activo === true;
  $("#bannerPreview").hidden = true;
  $("#contentStatus").textContent = "";
}

$("#previewBanner").onclick = () => {
  $("#previewBannerTitle").textContent = $("#bannerTitle").value.trim();
  $("#previewBannerMessage").textContent = $("#bannerMessage").value.trim();
  const action = $("#bannerAction");
  $("#previewBannerAction").textContent = action.value ? action.selectedOptions[0].text : "";
  $("#bannerPreview").hidden = false;
};

$("#storeContent").onsubmit = (event) => {
  event.preventDefault();
  const titulo = $("#customTitle").value.trim();
  const descripcion = $("#customDescription").value.trim();
  const anuncio = {
    titulo: $("#bannerTitle").value.trim(),
    mensaje: $("#bannerMessage").value.trim(),
    accion: $("#bannerAction").value,
    activo: $("#bannerActive").checked,
  };
  if (!titulo || !descripcion || (anuncio.activo && (!anuncio.titulo || !anuncio.mensaje))) {
    $("#contentStatus").textContent =
      "Completa el título y la descripción de personalización. Un anuncio visible requiere título y mensaje.";
    return;
  }
  catalog.contenido = {
    ...catalog.contenido,
    personalizacion: { titulo, descripcion },
    promocion: { descripcion: $("#promoDescription").value.trim() },
    anuncio,
  };
  changed();
  $("#contentStatus").textContent = "Contenido agregado a tu borrador.";
};

const adEditor = $("#adEditor");
const adVariants = $("#adVariants");
const adNetwork = $("#adNetwork");
const adText = $("#adText");
const adStatus = $("#adStatus");

function prepareAdText() {
  const selected = Array.from(adVariants.selectedOptions);
  if (selected.length > 2) {
    adText.value = "";
    adStatus.textContent = "Elige hasta dos variantes.";
    $("#copyAd").disabled = true;
    return;
  }
  const highlights = selected.map((option) => "👕 " + option.textContent);
  const catalogUrl = new URL("../", location.href).href;
  const whatsapp = String(catalog.whatsapp).replace(/\D/g, "");
  const contact =
    adNetwork.value === "Facebook"
      ? [
          "Mira el catálogo: " + catalogUrl,
          "Pide por WhatsApp: https://wa.me/" + whatsapp,
        ]
      : [
          "Consulta diseños y tallas por WhatsApp al +" + whatsapp + ".",
          "#MODAC #Polos #Estampados",
        ];
  adText.value = [
    "Elige tus polos favoritos en MODAC",
    "2 polos de la colección por S/ " + Number(catalog.precio_duo).toFixed(2),
    "Algodón peinado jersey 30/1.",
    ...highlights,
    "",
    ...contact,
  ].join("\n");
  adStatus.textContent = "";
  $("#copyAd").disabled = false;
}

$("#openAd").onclick = () => {
  const options = catalog.productos
    .filter((product) => product.visible)
    .flatMap((product) =>
      product.variantes
        .filter((variant) => variant.visible)
        .map(
          (variant) =>
            new Option(
              [product.nombre, variant.color, variant.talla].join(" · "),
              variant.id,
            ),
        ),
    );
  adVariants.replaceChildren(...options);
  prepareAdText();
  adEditor.showModal();
};
adNetwork.onchange = prepareAdText;
adVariants.onchange = prepareAdText;
$("#closeAd").onclick = () => adEditor.close();
$("#copyAd").onclick = async () => {
  try {
    await navigator.clipboard.writeText(adText.value);
    adStatus.textContent = "Texto copiado.";
  } catch {
    adText.focus();
    adText.select();
    adStatus.textContent = "Texto seleccionado. Cópialo con Ctrl+C o Cmd+C.";
  }
};
