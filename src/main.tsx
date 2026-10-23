import { createRoot } from "react-dom/client";
import "./index.css";
import "./ui/responsive.css";
import App from "./ui/App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
