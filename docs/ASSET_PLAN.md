# 에셋 제작 계획 — 시작 화면 그림에 맞춰 도시와 캐릭터를 다시 만든다

> 갱신: 2026-08-25
> 기준: `public/title-street.webp` (시작 화면 그림). 이 문서의 모든 색과 형태
> 규칙은 그 한 장에서 **실측해서** 뽑았다.

## 1. 왜 다시 쓰는가

시작 화면을 그림 한 장으로 바꾸면서 **화면과 게임이 다른 말을 하기 시작했다.**

- 그림 속 동료는 로봇·검은 고양이·버섯·곰인데, 코드의 도깨비는 초롱·그을음·
  물비늘·자정이다. 들어가면 다른 것이 나온다.
- 그림의 도시는 민트·크림·따뜻한 회녹색인데, 우리 도시는 회색이다.

이 문서는 그 간극을 메우는 목록이다.

## 2. 그림에서 잰 것 (추측 아님)

`public/title-street.webp`를 300×168로 줄여 픽셀을 셌다.

### 2.1 채도 분포 — 뜻밖의 결과

| 채도 구간 | 시작 화면 그림 | 우리 도시(달빛 광장 실측) |
|---|---|---|
| 고채도 (>60%) | 11.0% | **14.7%** |
| 40~60% | 19.4% | 5.0% |
| 25~40% | 22.8% | 7.9% |
| 10~25% | **37.2%** | 15.0% |
| 거의 무채색 (<10%) | 9.6% | **57.4%** |
| 평균 채도 | 0.316 | 0.230 |

**우리 도시가 오히려 원색이 더 많다.** 차이는 원색이 아니라 **바탕**이다.

그림에는 **순수한 회색이 거의 없다**(<10%가 9.6%뿐). 아스팔트도 벽도 옅게
색을 띤다. 우리 도시는 절반 넘게 진짜 회색이다.

**그래서 A-1(원색을 악센트로 가두기)을 풀 필요가 없다.** 고채도 예산은 이미
우리가 더 쓰고 있다. 고칠 것은 **바탕을 물들이는 것**이다 — 회색을 10~25%
채도의 색으로 옮긴다.

### 2.2 대표색

| 역할 | 색 | 비중 |
|---|---|---|
| 바탕 그늘 | `#505050` `#303030` `#707070` | 15% |
| 바탕 — 따뜻한 회녹색 | `#707050` `#505030` | 9% |
| 바탕 — 따뜻한 회분홍 | `#705050` `#907070` | 8% |
| 하이라이트 크림 | `#f0d0d0` `#f0d0b0` `#f0f0d0` | 10% |
| 악센트 — 청록 | `#103030` `#305050` | 7% |

읽는 법: **바탕은 회색이 아니라 「따뜻한 회녹색」과 「따뜻한 회분홍」**이고,
밝은 면은 흰색이 아니라 **크림**이다. 청록이 유일한 확실한 악센트다.

### 2.3 형태 규칙

- 모서리가 둥글다. 날카로운 각이 거의 없다.
- 덩어리가 굵고 단순하다. 잔디테일 대신 큰 면 몇 개.
- 외곽선이 있다(어두운 갈색 계열, 검정 아님).
- 그늘이 **두 단계**다 — 본색 + 아래쪽 어두운 색. 그라디언트가 아니다.

## 3. 먼저 정할 것 둘

이걸 정하지 않으면 만든 것이 서로 안 맞는다.

### 3.1 동료의 정체 — **정해 주셔야 합니다**

| 안 | 내용 | 대가 |
|---|---|---|
| **A. 동료를 생물로 바꾼다** | 도깨비 넷을 그림처럼 동물·사물 캐릭터로 다시 설계 | `roster.ts`의 사연·능력 글을 다시 씀. 시작 화면과 게임이 같아짐 |
| B. 그림을 도깨비에 맞춘다 | 그림을 다시 생성해 등불·연기·물웅덩이 정령으로 | 지금 그림을 버림 |

**A를 권한다.** 그림이 이미 마음에 드신 쪽이고, 「도깨비」라는 이름은 유지하면서
생김새만 생물 쪽으로 옮기면 된다 — 한국 설화의 도깨비도 원래 사물에 깃든다.

### 3.2 도시를 어디까지 바꾸는가

건물은 **모델로 만들지 않는다.** 절차적 생성이 구역마다 다른 도시를 만드는데,
모델로 바꾸면 그 다양성이 죽는다. 도시는 **다시 칠하는** 것이지 다시 만드는
것이 아니다 (6절).

## 4. 예산

지금 외부 에셋은 둘이다 — `character.glb`(1.1MB), `title-street.webp`(137KB).

| 항목 | 지금 | 상한 |
|---|---|---|
| 초기 다운로드(공통 번들) | 128KB gzip | **그대로.** 새 GLB는 하나도 안 들어간다 |
| GLB 총합 | 1.1MB | **5MB** |
| GLB 하나 | 1.1MB | **600KB**(압축 후) |

**전부 지연 로드.** 도깨비는 만난 뒤에 받는다.

셀 셰이딩이라 **노멀·러프니스맵이 필요 없다.** 알베도 한 장만 남기고 버린다.

## 5. 무엇을 만들 것인가 — 코드의 어디를 바꾸는가

값이 큰 순서. 각 줄의 「지금」은 실제 파일이다.

| 순위 | 대상 | 지금 (프리미티브) | 삼각형 / 텍스처 |
|---|---|---|---|
| 1 | **동료 4종** | `dokebi/` + 캡슐·구 조합 | 3~6k / 512² |
| 2 | **플레이어** | `public/character.glb` (교체) | 8~15k / 1024² |
| 3 | 적 로봇 2종 | `combat/enemyBody.ts`, `Enemies.tsx` | 2~3k / 512² **공유 머티리얼** |
| 4 | 미니 보스 | `combat/bossBody.ts`, `Boss.tsx` | 6~10k / 512² |
| 5 | 탈것 5종 | `player/RiddenVehicle.tsx` | 400~900 / 256² |
| 6 | 버스·승용차 | `world/Traffic.tsx` | 800~1500 / 512² 아틀라스 |
| 7 | 거리 소품 | `world/City.tsx`, `FacadeGroup.tsx` | 300~1500 / 512² **한 장에 모아서** |
| 8 | 보행자 | `world/Crowd.tsx` (인스턴싱 24기+) | 1~2k / 512² 공유 |

**로봇 둘과 보행자는 반드시 머티리얼 하나를 공유해야 한다.** 인스턴싱이 깨지면
드로우콜이 수십 개 늘고 프레임이 무너진다(현재 드로우콜 73).

### 만들지 않는 것

- **건물** — 절차적 생성의 다양성이 죽는다
- **지형·수면** — 이미 있고 예산을 통째로 먹는다
- **부두·찌·물고기** — 상자와 이름으로 족하다

## 6. 도시는 모델이 아니라 색을 바꾼다

2.1절의 결론대로 **바탕을 물들인다.** 정본은 `src/game/world/cityPalettes.ts`다.

| 상수 | 지금 | 어디로 |
|---|---|---|
| `ROAD_SURFACE_COLOR` | `#d6d4da` (거의 무채색) | 따뜻한 회녹색 쪽 — 채도 10~25% |
| `SHOPFRONT_PALETTE` | `#efe6d6` | 크림 (`#f0d0b0` 계열) |
| `ROOFTOP_PALETTE` | `#9aa3ad` `#6f6a7d` | 청록 섞인 회색 |
| `HILLSIDE_PALETTE` | `#bab4a6` `#a29b8d` | 따뜻한 회분홍 쪽 |
| `ROCK_PALETTE` | `#7d8378` `#8f8b80` | 그대로 두어도 된다 (이미 색이 있다) |

**검사가 막는다.** `tests/paletteRestraint.test.ts`가 「어디에나 있는 색은 채도가
낮다」와 「고채도가 3분의 1을 넘지 않는다」를 지킨다. 바탕을 10~25%로 옮기는 것은
그 규칙 **안에서** 하는 일이라 통과해야 정상이다 — 통과 못 하면 너무 올린 것이다.

## 7. Meshy 프롬프트

영어로 쓴다. **원작 게임 이름이나 캐릭터 이름을 넣지 않는다** — 넣으면 학습된
그 외형이 나오고, 그건 우리 것이 아니다.

### 7.1 공통 접미 (모든 프롬프트 뒤에)

```
stylized game asset, chunky rounded forms, thick dark-brown outlines,
two-step flat shading (base color plus one darker underside), single material,
soft matte finish, cream highlights, muted warm-grey base with a slight tint,
teal accent, game-ready low poly, clean topology, T-pose neutral
```

```
negative: photorealistic, PBR metal roughness, heavy normal detail, sharp edges,
gradient shading, pure grey, pure white, text, watermark, brand logo,
realistic human proportions
```

### 7.2 동료 넷 (3.1의 A안 기준)

이름은 유지하고 생김새만 생물 쪽으로 옮긴다.

```
chorong   — a small round lantern creature the size of a house cat, cream body,
            a warm glowing dome on its head like a paper lamp, two stubby legs,
            tiny curious eyes, eager forward-leaning posture

geueum    — a soot creature, dark charcoal fur with a warm-grey tint, heavy
            rounded bottom, sleepy half-closed eyes, no visible limbs, a small
            teal spark at the chest

mulbineul — a water creature, pale teal, flat wide body like a rounded shell,
            scale-like ripples across its back, short legs, calm slow posture

jajeong   — a night creature, deep muted purple-grey, tall and soft,
            upper half fading darker, faint cream glow at the core, quiet
```

### 7.3 플레이어

```
child adventurer — a cheerful kid around ten years old, chunky rounded proportions,
big head, cream and warm-grey clothes with one teal accent (cap or bag),
round glasses, a small backpack, sneakers, side-walking friendly pose
```

### 7.4 적과 보스

```
scrap robot (melee)  — knee-high junk robot from mismatched household parts,
                       rounded boxy torso, one dented socket at the chest center,
                       short stubby arms, warm-grey painted metal, comic, not scary
scrap robot (gunner) — same family, one forearm replaced by a wide barrel,
                       taller head, readable from far away
scrap boss           — a junk robot twice a child's height, heavy rounded shoulders,
                       long arms that can raise overhead, deep chest socket
```

### 7.5 탈것·짐승·차량

```
kick scooter — city scooter, narrow deck, single front post, small fat wheels
city bike    — upright city bicycle, rounded frame, no branding
skateboard   — simple deck with fat wheels, one bright accent color
toy car      — child-sized open toy car, rounded body, four fat wheels
jeju pony    — small stocky pony, short legs, thick mane, gentle face,
               simple four-leg rig for a walk cycle
city minibus — rounded cream and teal minibus, big front window, small wheels
```

### 7.6 거리 소품 (한 장에 모아서)

```
korean street prop set — vending machine, striped shop awning, painted wall panel,
traffic cone, park bench, bollard, tactile paving block, storm drain,
all in one scene, uniform scale, shared palette of cream / warm grey / teal
```

## 8. 반입 절차

1. **glb로 내보낸다** (fbx 아님)
2. **줄인다**
   ```
   npx @gltf-transform/cli optimize in.glb out.glb \
     --texture-compress webp --texture-size 512 --simplify --compress draco
   ```
3. **버린다** — 노멀·러프니스·메탈릭 맵. 툰 셰이딩은 알베도만 쓴다
4. **잰다** — 600KB를 넘으면 폴리나 텍스처를 더 줄인다
5. **둔다** — `public/models/`
6. **검사를 연다** — 이유와 **새 상한**을 함께 적는다:
   - `tests/forbiddenApis.test.ts` 허용 목록 + 파일 수 상한 + **개별 크기 자**
   - `tests/projectStructure.test.ts`의 무거운 파일 예외
   - `tests/bundleBudget.test.ts`와 문서의 수치
7. **지연 로드** — `/play`에서, 그것도 필요할 때
8. **실측 기록** — 드로우콜·삼각형·힙을 재서 PROJECT_PLAN 18절에 적는다
   (현재 드로우콜 73 / 삼각형 209,324 / 힙 51MB)

## 9. 하지 말 것

- **초기 번들에 넣기** — 랜딩은 3D를 하나도 싣지 않는다
- **에셋마다 다른 머티리얼** — 인스턴싱이 깨진다
- **리깅 없는 모델에 애니메이션 기대하기** — 조랑말은 다리 뼈가 있어야 걷는다
- **4k 텍스처** — 이 화면 크기에서 512²와 구분되지 않는다
- **한 번에 다 만들기** — 첫 하나에서 나온 문제가 나머지에 그대로 있다

## 10. 순서

1. **3.1을 정한다** (동료의 정체). 이게 안 정해지면 1순위를 못 만든다
2. **초롱 하나**를 끝까지 — 생성 → 압축 → 반입 → 화면. 여기서 압축 설정과
   실제 크기가 정해지고, 나머지 셋의 예산이 그 수치로 확정된다
3. **도시 다시 칠하기**(6절)를 병행한다. 모델이 없어도 지금 바로 할 수 있고,
   화면 인상이 가장 크게 바뀌는 작업이다
4. 로봇 둘(공유 머티리얼) → 보스 → 탈것 → 차량 → 소품 → 보행자
5. 단계마다 `pnpm test`·`pnpm build`와 **화면 확인**을 함께 한다. 이 저장소에서
   가장 자주 난 사고는 「값은 맞는데 화면에서는 아무 일도 안 일어남」이었다
