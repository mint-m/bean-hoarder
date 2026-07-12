import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 랩(React)은 /lab/ 아래로 빌드된다 — Pages 정적 서빙(v2/public/lab)에 그대로 올라간다.
// 검증 완료 후 /admin을 이 앱으로 교체하는 것이 Phase 3의 마지막 단계.
export default defineConfig({
  base: "/lab/",
  plugins: [react()],
  build: {
    outDir: "../../v2/public/lab",
    emptyOutDir: true,
  },
  server: {
    // 로컬 개발: wrangler pages dev(8790)의 API·공용 CSS를 프록시
    proxy: {
      "/api": "http://localhost:8790",
      "/theme.css": "http://localhost:8790",
      "/lab.css": "http://localhost:8790",
    },
  },
});
