import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig.json의 paths(`@/*` → `src/*`)를 그대로 읽는다.
    // 별칭을 여기 한 번 더 적으면 tsconfig와 어긋날 때 테스트만 조용히 깨진다.
    tsconfigPaths: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // 렌더러도 DOM도 쓰지 않는 순수 함수만 테스트한다.
    // window가 필요한 곳(settings)은 테스트에서 명시적으로 스텁한다.
    environment: "node",
  },
});
