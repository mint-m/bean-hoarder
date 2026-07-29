import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 랩(React)은 /admin/ 아래로 빌드된다 — Pages 정적 서빙(public/admin)에 그대로 올라간다.
// (프리뷰 검증을 마치고 구 admin.html을 교체한 상태 — Phase 3 완료.)
export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  build: {
    outDir: "../../public/admin",
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
