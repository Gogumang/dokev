# Meshy 배경 차량 입력 정본

타이틀 화면의 둥근 차체, 크림·청록·코랄 팔레트와 두 단계 툰 음영을 공유하는
배경 교통 차량이다. 세 이미지는 각각 별도의 Meshy Image-to-3D 작업에 넣는다.

| 차량 | 입력 이미지 | 월드 용도 | 기준 길이 |
|---|---|---|---|
| 소형 승용차 | `traffic-compact-car-v1.png` | 일반 차로의 가장 많은 차량 | 3.6m |
| 시내 미니버스 | `traffic-city-minibus-v1.png` | 버스 전용차로와 주요 교차로 | 5.2m |
| 동네 배달 밴 | `traffic-delivery-van-v1.png` | 시장·주택가의 낮은 빈도 차량 | 4.2m |

## Meshy 반입 규칙

1. 한 작업에는 차량 이미지 하나만 올리고 **Remove Background**를 켠다.
2. 바퀴 네 개를 차체와 분리된 메시로 정리한다. 생성 결과가 붙어 있으면 DCC에서
   분리하고 각 바퀴 피벗을 축 중심에 둔다.
3. 문·와이퍼·거울은 움직이지 않는다. 배경 차량에는 실내와 문 열림 애니메이션이
   필요 없다.
4. 세 차량은 알베도 아틀라스와 툰 머티리얼 하나를 공유한다. 차종마다 재질을
   새로 만들면 인스턴싱 이점이 사라진다.
5. 기준 길이에 맞춰 스케일을 통일하고, 전방을 로컬 `+Z`, 바닥 중심을 원점으로 둔다.
6. 차종당 800~1,500 triangles, 알베도 512², 압축 후 GLB 350KB 이하를 목표로 한다.

## Meshy 프롬프트

### 소형 승용차

```text
small four-door compact city hatchback, rounded hood and roof, short overhangs,
four separate chunky wheels, simple windows and circular lights, warm coral body,
cream roof and bumpers, restrained teal trim, dark charcoal windows and tires
```

### 시내 미니버스

```text
compact low-floor city minibus, rounded rectangular body, large windshield,
simple side windows and broad door seams, four separate chunky wheels, cream
upper body, muted teal lower body, small coral and golden accents
```

### 배달 밴

```text
small neighborhood delivery van, rounded cab and cargo box in one soft silhouette,
short wheelbase, four separate chunky wheels, blank cargo panels, warm cream body,
muted warm-grey lower panels, one restrained teal door panel
```

### 공통 접미

```text
stylized game asset, chunky rounded forms, dark-brown edge definition, two-step
toon shading, soft matte finish, game-ready low poly, clean topology, one shared
material family, no interior, no readable text, no license number, no logo
```

```text
negative: photorealistic, real-world brand, thin fragile mirrors, sharp sports-car
lines, open doors, people, environment, gradient-heavy shading, PBR micro-detail,
text, watermark
```

## 이미지 생성 기준

세 PNG는 내장 이미지 생성 도구로 만들었다. `public/title-street.webp`는 색·형태·
마감의 참고로만 사용했고, 차량 디자인은 새로 만들었다. 공통 구성은 밝은 단색
배경, 근직교 정면 3/4뷰, 차량 전체와 네 바퀴가 보이는 단독 오브젝트다.
