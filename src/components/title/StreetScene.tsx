/**
 * 시작 화면의 배경 장면 — 대낮 골목의 횡단보도.
 *
 * 전에는 어두운 노을 그라디언트 위에 검은 스카이라인이었다. 부드럽기는 한데
 * **게임의 첫 화면이 아니라 문서 표지**로 보였다 — 화면에 사람이 없고, 카메라가
 * 도시를 멀리서 내려다보기만 했다.
 *
 * 바꾼 기준 셋:
 *
 * - **대낮이다.** 노을이 아니라 환한 낮이고 채도가 높다. 어두운 화면은 차분하지만
 *   「놀러 가는 곳」으로 읽히지 않는다.
 * - **카메라가 길바닥 높이다.** 스카이라인을 보여 주는 대신 횡단보도 한복판에
 *   선다. 지평선을 화면 위쪽에 두어 바닥을 크게 남긴다.
 * - **아이와 동료가 화면 안에 있다.** 배경만 있는 화면과 누군가 걸어오는 화면은
 *   다른 것을 약속한다.
 *
 * 그림은 전부 우리 것이다. 색은 게임이 쓰는 값을 그대로 가져온다
 * (`player/appearance.ts`의 「노을」, `dokebi/roster.ts`) — 시작 화면에서 본 아이가
 * 들어가면 다른 아이인 것이 이 화면에서 가장 김새는 일이다.
 *
 * **3D도 이미지 파일도 쓰지 않는다.** 랜딩에서 three.js를 건드리면 초기 다운로드
 * 예산이 무너지고(`tests/bundleBudget.test.ts`), 외부 에셋은 허용 목록이 막는다.
 * SVG 도형이라 전송 바이트는 마크업뿐이다.
 */

const SKIN = "#f2caa6";
const HAIR = "#2a1f2b";
const HOODIE = "#ff8a3d";
const HOODIE_DARK = "#e0702a";
const PANTS = "#3b4a6b";
const SHOE = "#22202a";
const BAG = "#2fd4c4";

/** 도깨비 넷 중 화면에 세우는 셋. 몸색과 악센트는 도감이 쓰는 값이다 */
const CHORONG = { body: "#ffd76b", accent: "#fff4cf" };
const GEUEUM = { body: "#57505f", accent: "#ff8a3d" };
const MULBINEUL = { body: "#2f9fd4", accent: "#c9f7ff" };

const ASPHALT = "#565660";
const ASPHALT_LIGHT = "#6a6a74";
const SIDEWALK = "#cfcbc4";
const LANE_BLUE = "#2f7fd4";
const TACTILE = "#f5c542";

/** 바닥에 눕는 그림자. 넷이 같은 방향으로 져야 같은 빛 아래 서 있는 것으로 보인다 */
function Shadow({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.3} fill="#1c1c24" opacity="0.28" />;
}

/**
 * 아이 — 옆모습으로 걷는다.
 *
 * 처음에는 정면으로 세워 뒀는데, 정면 부동자세는 **서 있는 그림**이지
 * 어디론가 가는 그림이 아니다. 첫 화면이 약속해야 하는 것은 「여기서 논다」이고,
 * 그건 걷는 자세에서 나온다.
 *
 * 보드를 옆구리에 낀다. 게임의 첫 여정 두 번째 단계가 보드를 꺼내는 것이라
 * (`quest/questContent.ts`) 화면과 안이 같은 말을 한다.
 *
 * 그늘을 한 겹 넣는다. 평면 색만 쌓으면 도형이 되고, 아래쪽에 어두운 색이
 * 한 번 들어가야 덩어리로 보인다.
 */
function Kid({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} stroke="#241d2a" strokeWidth="3">
      {/* 뒤쪽 다리와 팔 — 먼저 그려야 몸 뒤로 간다 */}
      <path d="M-6 46 L-22 74 L-14 80 L4 52 Z" fill="#2f3c58" />
      <path d="M-24 76 L-6 84 L-10 92 L-30 86 Z" fill={SHOE} />
      <path d="M-12 4 L-30 28 L-22 34 L-4 12 Z" fill={HOODIE_DARK} />

      {/* 가방 */}
      <rect x="-26" y="-2" width="20" height="34" rx="8" fill={BAG} />

      {/* 몸통 — 앞으로 살짝 기운다. 수직으로 세우면 다시 서 있는 그림이 된다 */}
      <path d="M-16 -6 L20 -10 L26 34 Q4 44 -14 36 Z" fill={HOODIE} />
      <path d="M-14 22 L26 18 L26 34 Q4 44 -14 36 Z" fill={HOODIE_DARK} />

      {/* 앞쪽 다리 */}
      <path d="M6 40 L24 68 L14 74 L-2 46 Z" fill={PANTS} />
      <path d="M12 70 L30 78 L26 88 L8 80 Z" fill={SHOE} />

      {/* 앞쪽 팔 — 보드를 낀다 */}
      <path d="M14 2 L34 20 L26 28 L8 12 Z" fill={HOODIE} />
      <circle cx="32" cy="26" r="7" fill={SKIN} />
      <rect x="6" y="26" width="52" height="12" rx="6" fill="#4bbf7a" transform="rotate(-8 30 32)" />
      <circle cx="18" cy="40" r="4" fill="#2a2630" />
      <circle cx="46" cy="36" r="4" fill="#2a2630" />

      {/* 머리 — 옆얼굴 */}
      <circle cx="6" cy="-30" r="24" fill={SKIN} />
      <path d="M-18 -34 Q-14 -60 8 -60 Q30 -60 30 -38 Q16 -48 -2 -44 Q-12 -42 -18 -34 Z" fill={HAIR} />
      <circle cx="16" cy="-30" r="3.4" fill="#241d2a" stroke="none" />
      <path d="M20 -20 Q26 -18 28 -23" stroke="#241d2a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

/**
 * 도깨비 하나.
 *
 * 셋이 **덩어리 모양으로** 갈려야 한다 — 초롱은 위가 밝은 등불, 그을음은 아래가
 * 무거운 연기, 물비늘은 납작한 물웅덩이다. 같은 원 셋을 색만 바꿔 놓으면
 * 「넷을 모으는 게임」이라는 말이 이 화면에서 거짓이 된다.
 *
 * 각자에 그늘을 한 겹 넣는다. 평면 색 하나로는 스티커가 되고, 아래가 어두워져야
 * 바닥 위에 놓인 것으로 보인다.
 *
 * 셋 다 **가는 쪽을 본다.** 아이가 오른쪽으로 걷는데 동료가 정면을 보고 있으면
 * 같이 가는 것이 아니라 각자 서 있는 것이 된다.
 */
function Dokebi({
  x,
  y,
  scale,
  kind,
}: {
  x: number;
  y: number;
  scale: number;
  kind: "chorong" | "geueum" | "mulbineul";
}) {
  const tone = kind === "chorong" ? CHORONG : kind === "geueum" ? GEUEUM : MULBINEUL;

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} stroke="#241d2a" strokeWidth="3">
      {kind === "chorong" && (
        <>
          {/* 등불 — 위가 밝고 손잡이가 달렸다. 떠 있어서 다리가 없다 */}
          <rect x="-3" y="-44" width="6" height="12" rx="3" fill={tone.accent} />
          <path d="M-14 -32 L14 -32 L20 -6 Q0 6 -20 -6 Z" fill={tone.body} />
          <path d="M-19 -8 L19 -8 L20 -6 Q0 6 -20 -6 Z" fill="#e0b449" />
          <path d="M-11 -30 L11 -30 L13 -18 Q0 -12 -13 -18 Z" fill={tone.accent} />
          <circle cx="1" cy="-18" r="3" fill="#241d2a" stroke="none" />
          <circle cx="11" cy="-19" r="3" fill="#241d2a" stroke="none" />
        </>
      )}
      {kind === "geueum" && (
        <>
          {/* 연기 — 아래가 무겁고 윤곽이 뭉개진다 */}
          <path
            d="M-30 16 Q-38 -10 -14 -18 Q-4 -32 12 -22 Q34 -16 28 14 Q0 26 -30 16 Z"
            fill={tone.body}
          />
          <path d="M-30 16 Q0 26 28 14 Q26 22 0 26 Q-26 24 -30 16 Z" fill="#413b49" />
          <circle cx="6" cy="-6" r="5" fill={tone.accent} stroke="none" />
          <circle cx="16" cy="-8" r="3.4" fill="#241d2a" stroke="none" />
          <circle cx="4" cy="-10" r="3.4" fill="#241d2a" stroke="none" />
        </>
      )}
      {kind === "mulbineul" && (
        <>
          {/* 물웅덩이 — 납작하고 결이 있다 */}
          <ellipse cx="0" cy="2" rx="32" ry="17" fill={tone.body} />
          <path d="M-32 4 Q0 22 32 4 Q30 16 0 19 Q-30 16 -32 4 Z" fill="#227fae" />
          <ellipse cx="-10" cy="-4" rx="10" ry="4" fill={tone.accent} opacity="0.95" stroke="none" />
          <ellipse cx="12" cy="2" rx="7" ry="3" fill={tone.accent} opacity="0.8" stroke="none" />
          <circle cx="14" cy="-6" r="3.2" fill="#241d2a" stroke="none" />
          <circle cx="2" cy="-8" r="3.2" fill="#241d2a" stroke="none" />
        </>
      )}
    </g>
  );
}

export function StreetScene() {
  /*
   * 지평선을 화면 위쪽(y=300)에 둔다. 바닥이 크게 남아야 「길 위에 서 있다」가
   * 되고, 가운데가 비어야 걸어오는 인물이 놓일 자리가 생긴다.
   */
  const HORIZON = 300;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="title-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fc4f5" />
          <stop offset="60%" stopColor="#bfe4ff" />
          <stop offset="100%" stopColor="#eaf6ff" />
        </linearGradient>
        <linearGradient id="title-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ASPHALT} />
          <stop offset="100%" stopColor={ASPHALT_LIGHT} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1200" height={HORIZON + 20} fill="url(#title-sky)" />

      {/* 먼 도시 — 납작한 밝은 회청색. 여기서 색을 쓰면 앞의 인물이 묻힌다 */}
      {[
        [40, 130, 120],
        [150, 96, 74],
        [230, 168, 92],
        [330, 120, 66],
        [400, 150, 110],
        [520, 104, 80],
        [610, 176, 96],
        [716, 128, 72],
        [800, 158, 118],
        [930, 110, 86],
        [1030, 174, 100],
        [1140, 126, 70],
      ].map(([bx, bh, bw]) => (
        <g key={bx}>
          <rect x={bx} y={HORIZON - bh} width={bw} height={bh} fill="#a8bdd0" />
          <rect x={bx} y={HORIZON - bh} width={bw} height="8" fill="#93aac0" />
        </g>
      ))}

      {/* 가로수 — 도시와 길 사이의 한 겹 */}
      {[120, 470, 860, 1120].map((tx) => (
        <g key={tx}>
          <rect x={tx - 4} y={HORIZON - 46} width="8" height="46" fill="#6b5442" />
          <circle cx={tx} cy={HORIZON - 56} r="30" fill="#4e9c5c" />
          <circle cx={tx - 18} cy={HORIZON - 44} r="20" fill="#59ad68" />
          <circle cx={tx + 18} cy={HORIZON - 46} r="21" fill="#438b50" />
        </g>
      ))}

      {/*
       * 상점 줄 — 간판이 있어야 「동네」로 읽힌다. 색은 몇 칸에만 넣는다.
       * 전부 칠하면 앞에 선 인물이 배경에 묻힌다.
       */}
      {[
        [0, "#e2453c"],
        [96, "#f5c542"],
        [192, "#3fa66b"],
      ].map(([sx, tone], index) => (
        <g key={index}>
          <rect x={Number(sx)} y={HORIZON - 92} width="92" height="92" fill="#ded7cc" />
          <rect x={Number(sx) + 6} y={HORIZON - 84} width="80" height="20" fill={String(tone)} />
          <rect x={Number(sx) + 18} y={HORIZON - 46} width="56" height="46" fill="#7f8aa0" />
        </g>
      ))}

      {/* 버스 — 도시가 움직이고 있다는 유일한 신호다 */}
      <g stroke="#241d2a" strokeWidth="3">
        <rect x="586" y={HORIZON - 104} width="228" height="104" rx="14" fill="#4bbf7a" />
        <rect x="604" y={HORIZON - 88} width="86" height="40" rx="6" fill="#cfeaff" />
        <rect x="702" y={HORIZON - 88} width="52" height="40" rx="6" fill="#cfeaff" />
        <rect x="766" y={HORIZON - 88} width="34" height="40" rx="6" fill="#cfeaff" />
        <rect x="606" y={HORIZON - 40} width="188" height="16" rx="6" fill="#e8f7ee" />
        <circle cx="642" cy={HORIZON} r="17" fill="#2a2630" />
        <circle cx="762" cy={HORIZON} r="17" fill="#2a2630" />
      </g>

      <rect x="0" y={HORIZON} width="1200" height={800 - HORIZON} fill="url(#title-road)" />

      {/*
       * 횡단보도. 아래로 갈수록 넓고 두껍게 그려야 원근이 생긴다 — 같은 폭으로
       * 깔면 바닥이 아니라 벽에 붙인 줄무늬로 보인다.
       */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
        const t = index / 7;
        const y = HORIZON + 40 + t * t * 470;
        const height = 12 + t * t * 54;
        const inset = 150 - t * 150;
        return (
          <rect
            key={index}
            x={inset}
            y={y}
            width={1200 - inset * 2}
            height={height}
            fill="#f2f0ea"
            opacity={0.92}
          />
        );
      })}

      {/* 오른쪽 자전거도로와 점자블록 — 한국 길의 표지다 */}
      <path d="M1010 300 L1200 300 L1200 800 L900 800 Z" fill={LANE_BLUE} opacity="0.55" />
      <path d="M1150 300 L1200 300 L1200 800 L1080 800 Z" fill={SIDEWALK} />
      {[0, 1, 2, 3, 4, 5].map((index) => {
        const t = index / 5;
        return (
          <rect
            key={index}
            x={1168 - t * t * 70}
            y={340 + t * t * 420}
            width={10 + t * t * 34}
            height={(10 + t * t * 34) * 0.5}
            fill={TACTILE}
          />
        );
      })}

      {/* 가드레일 — 자전거도로와 차도 사이. 원근을 따라 낮아진다 */}
      {[0, 1, 2, 3].map((index) => {
        const t2 = index / 3;
        const rx = 1120 - t2 * t2 * 190;
        const ry = 330 + t2 * t2 * 380;
        const rh = 30 + t2 * t2 * 70;
        return <rect key={index} x={rx} y={ry - rh} width={7 + t2 * t2 * 9} height={rh} fill="#dfe4ea" />;
      })}

      {/* 왼쪽 보도와 볼라드 */}
      <path d="M0 300 L190 300 L60 800 L0 800 Z" fill={SIDEWALK} />
      {[0, 1, 2].map((index) => {
        const t = index / 2;
        const height = 26 + t * t * 60;
        return (
          <rect
            key={index}
            x={150 - t * t * 120}
            y={360 + t * t * 330 - height}
            width={8 + t * t * 12}
            height={height}
            rx="4"
            fill="#e8622f"
          />
        );
      })}

      {/*
       * 아이와 도깨비 셋. 아이를 가운데에서 오른쪽으로 밀고 도깨비를 왼쪽으로
       * 펼친다 — 한 줄로 세우면 행렬이 되고, 흩어 두어야 같이 걷는 무리가 된다.
       */}
      <Shadow cx={556} cy={618} rx={48} />
      <Shadow cx={700} cy={640} rx={44} />
      <Shadow cx={840} cy={608} rx={40} />
      <Shadow cx={992} cy={650} rx={74} />

      <Dokebi x={556} y={548} scale={1.4} kind="mulbineul" />
      <Dokebi x={700} y={562} scale={1.34} kind="geueum" />
      <Dokebi x={840} y={520} scale={1.5} kind="chorong" />
      <Kid x={992} y={528} scale={1.6} />
    </svg>
  );
}
