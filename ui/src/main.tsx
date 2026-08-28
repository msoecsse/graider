import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

const ROOT_ELEMENT_ID = "root";
const rootElement = document.getElementById(ROOT_ELEMENT_ID);

if (rootElement === null) {
  throw new Error(`Missing ${ROOT_ELEMENT_ID} element.`);
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
