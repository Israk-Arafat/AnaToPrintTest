//React Bootstrap

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("[AnaToPrint] App starting");
console.log("[AnaToPrint] Base URL:", import.meta.env.BASE_URL);
console.log("[AnaToPrint] Mode:", import.meta.env.MODE);
console.log("[AnaToPrint] Location:", window.location.href);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
