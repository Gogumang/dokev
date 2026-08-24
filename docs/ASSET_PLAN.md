# 에셋 제작 계획 — 생성 도구(Meshy 등)로 무엇을 만들 것인가

> 작성일: 2026-08-25
> 대상: `assets/concepts/`에 이미 있는 결과물(아이 캐릭터 3안, 보드 1안)의 다음 단계
> 근거: 코드의 실제 상태(PROJECT_PLAN 「18. 구현 현황」)와 프레임 관찰

## 1. 먼저 정하고 시작하는 것

### 1.1 남의 것을 만들지 않는다

원작 캐릭터의 외형·이름·로고를 그대로 만들지 않는다. 우리가 쫓는 것은 **인상**이지
그 제품이 아니다 — 생성 도구를 쓴다고 달라지지 않는다.

프롬프트에 **원작 게임 이름이나 캐릭터 이름을 넣지 않는다.** 넣으면 학습된 그 외형이
그대로 나오고, 그건 우리 것이 아니다.

### 1.2 예산이 규칙을 정한다

지금 외부 에셋은 **둘**이다 — `public/character.glb`(1.1MB)와 시작 화면 그림
`public/title-street.webp`(137KB). 그 제약이 이 프로젝트의
구조를 만들었다(런타임 캔버스 텍스처, Web Audio 합성, 프리미티브 도시). 도구가 생겼다고
제약을 버리는 것이 아니라 **예산 안에서 다시 여는 것**이다.

| 항목 | 지금 | 새 상한(제안) |
|---|---|---|
| 초기 다운로드(공통 번들) | 128KB gzip | **그대로.** 새 GLB는 하나도 여기 들어가지 않는다 |
| GLB 총합 | 1.1MB | **4MB.** 넘으면 첫 진입이 눈에 띄게 느려진다 |
| 에셋 하나 | — | **600KB 이하**(압축 후) |

**전부 지연 로드다.** 도깨비 넷을 한꺼번에 받지 않는다 — 만난 도깨비만 받는다.

### 1.3 형식과 폴리 예산

셀 셰이딩(`ToonMaterial`)이라 **노멀맵·러프니스맵이 필요 없다.** 알베도 한 장이면 된다.
생성 도구는 기본으로 PBR 네 장을 뱉으므로 **반입할 때 버린다.**

| 종류 | 삼각형 | 텍스처 | 비고 |
|---|---|---|---|
| 도깨비 동료 | 3~6k | 512² | 넷 |
| 적 로봇 | 2~3k | 512² | **최대 24기 인스턴싱** — 이 수를 못 지키면 프레임이 무너진다 |
| 미니 보스 | 6~10k | 512² | 한 기뿐 |
| 조랑말 | 4~6k | 512² | 다리 뼈 넷이면 지금 걸음 코드가 그대로 붙는다 |
| 탈것 | 400~900 | 256² | 킥보드·자전거·장난감차 |
| 도시 소품 | 300~1500 | 512² 아틀라스 | 여러 개를 **한 장에 모아** 받는다 |

## 2. 무엇을 만들 것인가 — 값이 큰 순서

### 2.1 도깨비 동료 넷 — 가장 값이 크다

지금은 캡슐과 구를 합친 프리미티브다. **화면에서 가장 오래, 가장 가까이 보이는 것**이고
도감·대사·능력·사연이 전부 이 넷에 걸려 있다.

넷의 성격이 실루엣으로 갈려야 한다 — 이름만 다르고 덩어리가 같으면 모을 이유가 없다:

- **초롱** — 골목 가로등에서 나온 작은 등불. 둥글고 위가 밝다.
- **그을음** — 굴뚝 그림자 덩어리. 윤곽이 흐리고 아래가 무겁다.
- **물비늘** — 빗물받이에 고인 하늘 한 조각. 납작하고 결이 있다.
- **자정** — 간판이 꺼진 새벽의 조용함. 길고 가늘며 반쯤 잠겨 있다.

### 2.2 고물 로봇 둘(근접·사수)

상자 조합이다. **가슴의 점**(안에 갇힌 빛)이 이 로봇의 정체를 말하는 유일한 조형이므로
모델에도 **가슴 한가운데 파인 자리**가 있어야 한다. 사수는 멀리서도 구분되어야 한다.
인스턴싱을 지키려면 **둘이 같은 머티리얼 한 장**을 써야 한다.

### 2.3 미니 보스 「고물 대장」

절정의 얼굴인데 지금은 큰 상자다. 예고·비틀거림·빈틈이라는 리듬이 이미 있으니
**팔을 드는 동작이 읽히는 실루엣**이면 된다.

### 2.4 조랑말

살아 있는 탈것이라 실루엣이 특히 중요하다. 다리 뼈 넷만 있으면 지금 코드의 대각선
걸음이 그대로 붙는다.

### 2.5 탈것 셋(킥보드·자전거·장난감 자동차)

작고 자주 보인다. 저폴리로 충분하되 셋의 실루엣이 확실히 달라야 한다 — 속도와 조작감이
이미 다르다.

### 2.6 도시 소품 아틀라스

자판기·차양·벤치·라바콘·벽화판. 프레임에서 **실사 배경과 만화 캐릭터를 잇는 「평면 원색
그래픽 한 겹」**으로 확인된 층이다. 개별 GLB가 아니라 한 장에 모아 받아 인스턴싱한다.

### 2.7 만들지 않는 것

- **건물** — 절차적 생성이 구역마다 다른 도시를 만든다. 모델로 바꾸면 그 다양성이 죽는다.
- **지형·수면** — 이미 있고 크기가 커서 예산을 통째로 먹는다.
- **부두·찌·물고기** — 상자와 이름으로 족하다.

## 3. 프롬프트 — 그대로 붙여넣는 것

영어로 쓴다. **실루엣 → 재질 → 스타일 → 금지** 순서이고, 원작 이름은 넣지 않는다.

### 3.1 공통 접미(모든 프롬프트 뒤에)

```
stylized game asset, clean topology, single material, flat matte colors,
soft cel-shaded look, no text, T-pose neutral, game-ready low poly
```

```
negative: photorealistic, PBR metal roughness, heavy normal detail,
text, watermark, brand logo, realistic human proportions
```

### 3.2 도깨비 동료

```
chorong   — a small lantern spirit the size of a cat, rounded body, glowing paper-lamp head,
            two stubby arms, warm light from the top, eager posture
geueum    — a soot spirit, heavy bottom and blurred edges, like a small cloud of chimney smoke
            that learned to stand, half-closed sleepy eyes, no limbs, dark charcoal body
mulbineul — a puddle spirit, flat wide body like a shallow bowl of water, scale-like ripples
            across the surface, pale sky blue, calm slow silhouette
jajeong   — a midnight spirit, tall and thin, upper half fading into darkness,
            faint cool glow at the core, quiet still posture
```

### 3.3 적과 대장

```
scrap robot (melee)  — knee-high junk robot built from mismatched household parts, boxy torso,
                       one dented socket at the center of the chest, short stubby arms,
                       dull grey painted metal, comic proportions, not menacing
scrap robot (gunner) — same family as the melee robot but with a wide barrel replacing one
                       forearm and a taller head, clearly readable from far away
scrap boss           — a junk robot twice a child's height, heavy shoulders, long arms that can
                       be raised overhead, deep socket at the chest, patched plates
```

### 3.4 탈것과 짐승

```
jeju pony    — small stocky pony, short legs, thick mane, gentle face, rideable by a child,
               simple four-leg rig
kick scooter — city share scooter, narrow deck, single front post, small wheels
city bike    — simple upright city bicycle, no branding
toy car      — child-sized open toy car, rounded body, four fat wheels, one bright color
```

### 3.5 소품 아틀라스

```
korean street prop set — vending machine, striped shop awning, painted wall mural panel,
traffic cone, park bench, one scene, uniform scale, shared palette
```

### 3.6 컨셉 이미지(이미지 도구용)

```
character sheet, four orthographic views (front / side / back / three-quarter),
neutral grey background, even flat lighting, no shadows, no perspective,
full body visible, consistent scale across views, flat color blocks
```

실루엣이 먼저다 — 색을 고르기 전에 **검은 실루엣만으로 넷이 구분되는지** 본다.

## 4. 반입 절차 — 이대로 하지 않으면 예산이 깨진다

1. **받기** — glb로 내보낸다.
2. **줄이기**
   ```
   npx @gltf-transform/cli optimize in.glb out.glb \
     --texture-compress webp --texture-size 512 --simplify --compress draco
   ```
3. **버리기** — 노멀·러프니스·메탈릭 맵을 지운다. 툰 셰이딩은 알베도만 쓴다.
4. **재기** — 압축 후 600KB를 넘으면 폴리나 텍스처를 더 줄인다.
5. **두기** — `public/models/`.
6. **검사 갱신** — 두 곳이 막는다. 갱신하지 않으면 통과하지 못한다:
   - `tests/forbiddenApis.test.ts`의 에셋 허용 목록(지금은 `public/character.glb` 하나)
   - `tests/bundleBudget.test.ts`와 문서의 크기 수치
7. **지연 로드** — `/play`에서, 그것도 필요할 때. 도깨비는 만난 뒤에 받는다.
8. **실측 기록** — 드로우콜·삼각형·힙을 재서 PROJECT_PLAN 18절에 적는다.

## 5. 하지 말 것

- **초기 번들에 넣기.** 랜딩은 3D를 하나도 싣지 않는다 — 검사가 막는다.
- **에셋마다 다른 머티리얼.** 인스턴싱이 깨져 드로우콜이 수십 개 는다.
- **리깅 없는 모델에 애니메이션 기대하기.** 조랑말은 다리 뼈가 있어야 걷는다.
- **4k 텍스처.** 이 화면 크기에서 512²와 구분되지 않고 메모리만 먹는다.
- **한 번에 다 만들기.** 하나를 끝까지 해 보고 나머지를 정한다.

## 6. 순서 제안

1. **초롱 하나**를 끝까지 — 생성부터 화면에 서기까지. 여기서 압축 설정과 크기가 정해진다.
2. 나온 수치로 나머지 셋의 예산을 확정한다.
3. 로봇 둘(같은 머티리얼) → 대장 → 조랑말 → 탈것 → 소품 아틀라스.
4. 단계마다 `pnpm test`·`pnpm build`와 **화면 확인**을 함께 한다. 이 프로젝트에서 가장
   자주 난 사고는 「값은 맞는데 화면에서는 아무 일도 안 일어남」이었다.
