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
 * 아이.
 *
 * 정면으로 걸어온다. 게임 안의 비례(머리가 크고 다리가 짧은 아이 체형)를 따라야
 * 들어갔을 때 같은 인물로 읽힌다.
 */
function Kid({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    /*
     * 외곽선을 두른다. 배경이 밝아지면서 인물이 바닥에 녹아붙었다 — 만화적인
     * 인물을 사실적인 배경 위에 세울 때 선이 그 둘을 갈라 준다.
     */
    <g transform={`translate(${x} ${y}) scale(${scale})`} stroke="#241d2a" strokeWidth="3">
      <rect x="-26" y="-6" width="52" height="58" rx="16" fill={HOODIE} />
      <path d="M-26 20 L-26 44 Q0 56 26 44 L26 20 Z" fill={HOODIE_DARK} />
      {/* 가방끈이 어깨 앞으로 넘어온다 — 실루엣의 포인트 색 */}
      <rect x="-15" y="-4" width="6" height="34" rx="3" fill={BAG} />
      <rect x="9" y="-4" width="6" height="34" rx="3" fill={BAG} />

      {/* 팔 — 걷는 중이라 앞뒤로 벌어진다 */}
      <rect x="-38" y="2" width="14" height="36" rx="7" fill={HOODIE} />
      <rect x="24" y="8" width="14" height="34" rx="7" fill={HOODIE_DARK} />
      <circle cx="-31" cy="42" r="7" fill={SKIN} />
      <circle cx="31" cy="46" r="7" fill={SKIN} />

      <rect x="-19" y="48" width="16" height="34" rx="7" fill={PANTS} />
      <rect x="3" y="48" width="16" height="30" rx="7" fill={PANTS} />
      <rect x="-23" y="78" width="24" height="12" rx="6" fill={SHOE} />
      <rect x="1" y="74" width="24" height="12" rx="6" fill={SHOE} />

      <circle cx="0" cy="-26" r="26" fill={SKIN} />
      <path
        d="M-27 -30 Q-22 -58 0 -58 Q22 -58 27 -30 Q14 -42 0 -40 Q-14 -42 -27 -30 Z"
        fill={HAIR}
      />
      <circle cx="-9" cy="-24" r="3.4" fill="#241d2a" stroke="none" />
      <circle cx="9" cy="-24" r="3.4" fill="#241d2a" stroke="none" />
      <path
        d="M-7 -12 Q0 -6 7 -12"
        stroke="#241d2a"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * 도깨비 하나.
 *
 * 셋이 덩어리 모양으로 갈려야 한다 — 초롱은 위가 밝은 등불, 그을음은 아래가
 * 무거운 연기, 물비늘은 납작한 물웅덩이다. 같은 원 셋을 색만 바꿔 놓으면
 * 「넷을 모으는 게임」이라는 말이 이 화면에서 거짓이 된다.
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
          <circle cx="0" cy="0" r="26" fill={tone.body} />
          <path d="M-18 -14 Q0 -34 18 -14 Z" fill={tone.accent} />
          <rect x="-4" y="-38" width="8" height="10" rx="3" fill={tone.accent} />
        </>
      )}
      {kind === "geueum" && (
        <>
          <path
            d="M-28 18 Q-34 -12 -12 -20 Q0 -32 14 -20 Q34 -12 28 18 Q0 28 -28 18 Z"
            fill={tone.body}
          />
          <circle cx="0" cy="-2" r="6" fill={tone.accent} />
        </>
      )}
      {kind === "mulbineul" && (
        <>
          <ellipse cx="0" cy="4" rx="30" ry="18" fill={tone.body} />
          <ellipse cx="-8" cy="-1" rx="9" ry="5" fill={tone.accent} opacity="0.9" />
          <ellipse cx="10" cy="6" rx="7" ry="4" fill={tone.accent} opacity="0.75" />
        </>
      )}
      <circle cx="-8" cy="-2" r="3" fill="#241d2a" stroke="none" />
      <circle cx="8" cy="-2" r="3" fill="#241d2a" stroke="none" />
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
      <Shadow cx={330} cy={628} rx={50} />
      <Shadow cx={492} cy={652} rx={46} />
      <Shadow cx={648} cy={620} rx={42} />
      <Shadow cx={816} cy={664} rx={76} />

      <Dokebi x={330} y={552} scale={1.45} kind="mulbineul" />
      <Dokebi x={492} y={568} scale={1.36} kind="geueum" />
      <Dokebi x={648} y={538} scale={1.28} kind="chorong" />
      <Kid x={816} y={538} scale={1.66} />
    </svg>
  );
}
