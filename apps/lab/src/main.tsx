// 랩(등록·관리 화면)의 React 진입점 — base /lab/으로 빌드되어 dist/lab에 올라간다.
// 원두 등록·수정·삭제, 라벨 디자인, 로고 관리, CSV 백업이 전부 이 앱 안에 있다.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
