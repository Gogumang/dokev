"use client";

/*
 * 성능·시뮬레이션 계기판.
 *
 * `WorldHud.tsx`가 799줄이 되어 상한(800)에 닿아 분리했다. 이 패널은 성격이
 * 다르다 — 다른 HUD가 플레이하는 사람에게 보여 주는 것이라면, 여기는 만드는
 * 사람이 무슨 일이 벌어지는지 읽는 곳이다.
 */

import { shallowEqual, useSampled } from "@/components/hud/useSampled";
import { weaponLabel } from "@/game/combat/weapons";
import type { RuntimeStats } from "@/game/scene/sceneTypes";
import type { QualityLevel } from "@/game/systems/quality";

export function PerfPanel({
  stats,
  quality,
  boss,
}: {
  stats: RuntimeStats;
  quality: QualityLevel;
  boss: { distance: number; phase: string };
}) {
  // 4Hz면 읽기에 충분하고 리렌더 비용도 무시할 수 있다.
  const snapshot = useSampled(
    () => ({ ...stats, bossDistance: boss.distance, bossPhase: boss.phase }),
    250,
    shallowEqual,
  );

  /*
   * 아직 한 번도 측정되지 않은 상태를 0으로 보여 주면 안 된다.
   *
   * 계측은 0.5초마다 갱신되는데, 그전까지는 초기값 0이 그대로 보인다. 실제로
   * 이 패널이 「FPS 0 · 드로우콜 0 · 삼각형 0」을 띄우는 것을 보고 렌더 루프가
   * 죽은 줄 알고 한참을 뒤졌다 — 화면은 멀쩡히 그려지고 있었다.
   *
   * 패널이 보이는 동안 FPS가 진짜 0일 수는 없다. 0이면 아직 안 재 본 것이다.
   */
  const measured = snapshot !== null && snapshot.fps > 0;
  const rows: Array<[string, string]> = !snapshot
    ? []
    : !measured
      ? [
          ["측정", "아직 재는 중"],
          ["품질", quality],
        ]
      : [
          ["FPS", snapshot.fps.toFixed(0)],
          ["프레임", `${snapshot.frameMs.toFixed(1)} ms`],
          ["드로우콜", String(snapshot.drawCalls)],
          ["삼각형", snapshot.triangles.toLocaleString("ko-KR")],
          ["힙", snapshot.heapMb > 0 ? `${snapshot.heapMb.toFixed(0)} MB` : "미지원"],
          ["품질", quality],
          /*
           * 속도와 무기.
           *
           * 둘 다 좌하단에 **늘** 붙어 있었다. 속도계는 주석부터 「튜닝 중 수치를
           * 눈으로 확인하기 위한 임시 표시」였는데 그대로 남아, 플레이하는 사람의
           * 화면에서 만드는 사람의 계기가 자리를 차지하고 있었다 — 그 자리가
           * 여기다. 무기는 바꾼 직후 알림으로 따로 뜬다.
           */
          ["속도", `${snapshot.speed.toFixed(1)} m/s`],
          ["무기", weaponLabel(snapshot.weapon)],
          /*
           * 보스 상태.
           *
           * 브라우저에서 보스가 다가오지 않는 것을 40초간 보고도 원인을 못 찾았다 —
           * 눈에 보이는 것이 "안 움직인다"뿐이라 매번 계측을 새로 붙여야 했다.
           * 거리와 단계가 보이면 인지 범위 밖인지, 쫓다 멈춘 것인지 즉시 갈린다.
           */
          [
            "보스",
            Number.isFinite(snapshot.bossDistance)
              ? `${snapshot.bossDistance.toFixed(1)}m ${snapshot.bossPhase}`
              : "미접속",
          ],
        ];

  return (
    <div
      className="hud-scrim rounded-[var(--radius-md)] px-4 py-3"
      style={{ minWidth: "190px" }}
      role="status"
      aria-live="off"
      aria-label="실시간 성능 지표"
    >
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th
                scope="row"
                className="py-0.5 text-left font-normal text-[var(--color-text-secondary)]"
              >
                {label}
              </th>
              <td className="tabular py-0.5 text-right font-semibold">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
