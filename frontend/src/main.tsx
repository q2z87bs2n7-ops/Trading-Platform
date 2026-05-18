import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import DevPanel from "./dev/Panel";
import { queryClient } from "./data/queryClient";
import "./index.css";

// Throwaway probe surface: open with #dev in the URL. Not wired into the
// real App layout; discarded before frontend design begins.
const isDev = window.location.hash === "#dev";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isDev ? <DevPanel /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>,
);
