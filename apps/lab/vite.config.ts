import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 랩(React)은 /lab/ 아래로 빌드돼 배포 산출물(dist/lab)에 그대로 올라간다.
// 이름이 /admin이던 시절이 있었는데, 이 화면은 관리자 도구가 아니라 등록·QR 발급 화면이라
// 서비스가 부르는 이름(랩/LAB)과 주소를 맞췄다.
export default defineConfig({
  base: "/lab/",
  plugins: [react()],
  build: {
    outDir: "../../dist/lab",
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
