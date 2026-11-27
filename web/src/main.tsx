import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@juninmd/sonido/styles.css";
import { App } from "./App.tsx";
import "./index.css";
import "./sonido-bridge.css";

/*
 * O Sonido escolhe o tema por `data-theme`; o app segue o sistema. O atributo
 * fica no <html> para o primeiro quadro já nascer com o tema certo — sem ele,
 * o `:root` do pacote (dark) venceria o `light-dark()` dos tokens do app.
 */
const temaDoSistema = window.matchMedia("(prefers-color-scheme: light)");
const aplicaTema = () => {
  document.documentElement.dataset.theme = temaDoSistema.matches
    ? "light"
    : "dark";
};
aplicaTema();
temaDoSistema.addEventListener("change", aplicaTema);

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("elemento #raiz não encontrado");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
