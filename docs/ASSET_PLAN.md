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

### 3.1 동료의 정체 — 메인 그림으로 고정

메인 그림에 나온 **곰·로봇·검은 고양이·버섯**을 게임의 네 도깨비로 사용한다.
Meshy 입력 정본은 `assets/concepts/meshy/`에 있다. GLB 반입 때 `roster.ts`의 이름,
사연, 능력 설명도 이 네 외형에 맞게 함께 바꾼다.

### 3.2 도시를 어디까지 바꾸는가

건물은 **모델로 만들지 않는다.** 절차적 생성이 구역마다 다른 도시를 만드는데,
모델로 바꾸면 그 다양성이 죽는다. 도시는 **다시 칠하는** 것이지 다시 만드는
것이 아니다 (6절).

## 4. 예산

지금 외부 에셋은 아홉이다 — `character.glb`(920KB), `title-street.webp`(137KB),
배경 차량 셋(`public/models/traffic-*.glb`, 59~73KB), 동료 셋
(`public/models/companion-*.glb`, 399~597KB), 미니 보스
(`public/models/boss-scrap-foreman.glb`, 758KB). 남은 동료는 로봇 하나다.

| 항목 | 지금 | 상한 |
|---|---|---|
| 초기 다운로드(공통 번들) | 128KB gzip | **그대로.** 새 GLB는 하나도 안 들어간다 |
| GLB 총합 | 3.1MB | **5MB** |
| GLB 하나 | 920KB (캐릭터) | 캐릭터 **2MB** · 대장 **800KB** · 동료 **650KB** · 차량 **350KB** |

**전부 지연 로드.** 도깨비는 만난 뒤에 받는다.

셀 셰이딩이라 **노멀·러프니스맵이 필요 없다.** 알베도 한 장만 남기고 버린다.

## 5. 무엇을 만들 것인가 — 코드의 어디를 바꾸는가

값이 큰 순서. 각 줄의 「지금」은 실제 파일이다.

| 순위 | 대상 | 지금 (프리미티브) | 삼각형 / 텍스처 |
|---|---|---|---|
| 1 | **동료 4종** | `dokebi/` + 캡슐·구 조합 | 3~6k / 512² |
| 2 | ~~**플레이어**~~ | `public/character.glb` **교체 완료** (2026-08-26) | 10,424 / 1024² |
| 3 | 적 로봇 2종 | `combat/enemyBody.ts`, `Enemies.tsx` | 2~3k / 512² **공유 머티리얼** |
| 4 | 미니 보스 | `combat/bossBody.ts`, `Boss.tsx` — GLB **반입 완료**, 배선은 아직 | 9,329 / 512² |
| 5 | 탈것 6종 | `player/RiddenVehicle.tsx` | 400~900 / 256² |
| 6 | ~~버스·승용차·배달 밴~~ | `world/Traffic.tsx` **배선 완료** (2026-08-26) | 1,778~1,988 / 512² |
| 7 | 거리 소품 | `world/City.tsx`, `FacadeGroup.tsx` | 300~1500 / 512² **한 장에 모아서** |
| 8 | 보행자 | `world/Crowd.tsx` (인스턴싱 24기+) | 1~2k / 512² 공유 |

**로봇 둘과 보행자는 반드시 머티리얼 하나를 공유해야 한다.** 인스턴싱이 깨지면
드로우콜이 수십 개 늘고 프레임이 무너진다(현재 드로우콜 73).

건물 4종의 리뉴얼 정본은 `assets/concepts/meshy/buildings/README.md`, 배경 차량
3종의 Meshy 입력 정본은 `assets/concepts/meshy/vehicles/README.md`에 있다.

### 배경 차량 반입 실측 (2026-08-26)

Meshy 출력을 그대로 쓸 수 없다는 것이 여기서 분명해졌다.

| | 원본 | 반입 후 | 기준 |
|---|---:|---:|---:|
| 파일 | 117~120MB | 103~122KB | 350KB |
| 삼각형 | 3,029,904 | 1,778~1,988 | 800~1,500 |
| 텍스처 | 알베도+노멀+메탈러프 | 알베도 512² webp | 알베도 512² |
| 크기(길이×폭×높이) | 4.0×4.1×4.0m 꼴 | 3.6×1.7×1.5 / 5.2×2.1×2.6 / 4.2×1.9×2.1 | 차선 폭 1.7 |

**세 축을 각각 눌러 넣었다.** 처음에는 길이만 맞췄는데 폭이 2.29·3.30·2.85m로
나왔다. 차선 중심은 도로 중심선 ±1.6이라 마주 오는 차와 3.2m 간격뿐이고, 그
안에 3.3m짜리 미니버스가 들어가면 **두 차가 겹친 채로 지나간다.** 미니버스는
높이 3.45m로 상점 차양보다도 높았다.

런타임에서 눌러 맞추지 않고 정점을 미리 눌러 넣은 이유: 배율을 코드에 두면 그
값이 세 군데(차체·전조등·충돌)로 흩어지고 어느 하나가 낡는다. 지금은 파일이 곧
크기이고, 그 사실을 `tests/trafficFleet.test.ts`가 GLB를 열어 대조한다.

**아직 기준에 못 미치는 것 둘.** 삼각형이 1.3배 남았고(더 줄이면 지붕 곡면이
각진다), 바퀴가 차체와 한 메시라 반입 규칙 2항(바퀴 네 개 분리)을 못 지켰다.
셋이 각자 텍스처를 들고 있는 것(4항)은 **인스턴싱에는 문제가 없다** — 차종마다
`InstancedMesh`가 하나씩이라 드로우콜은 차종 수만큼이고, 아틀라스로 합쳐도
셋이 하나가 되지는 않는다.

### 플레이어 교체 실측 (2026-08-26)

| | 원본 | 반입 후 | 기준 |
|---|---:|---:|---:|
| 파일 | 13.5MB | 920KB | 2MB |
| 삼각형 | 10,424 | **10,424** | 8,000~15,000 |
| 텍스처 | 알베도+발광 2048² PNG | 알베도 1024² webp | 1024² |
| 동작 | 19개 | 6개 | — |

**단순화를 하지 않았다.** 삼각형이 이미 기준 안이라 줄일 이유가 없었고, 사람
몸은 실루엣이 조금만 뭉개져도 눈에 띈다. 줄인 것은 텍스처와 안 쓰는 동작이다.

동작 이름 계약(`characterClips.ts`의 `CLIP`)을 새 이름으로 옮겼다. 검사가
**양방향**이라 파일에 남길 동작도 정확히 여섯이어야 한다.

| 상태 | 예전 | 지금 |
|---|---|---|
| 달리기 | `Armature\|running\|baselayer` | `Running` |
| 걷기 | `Armature\|walking_man\|baselayer` | `Walking` |
| 공격 | `Armature\|Attack\|baselayer` | `Left_Jab_from_Guard` |
| 쓰러짐 | `Armature\|Dead\|baselayer` | `Knock_Down` |
| 서 있기 | `Armature\|Arise\|baselayer` (일어서는 동작으로 때움) | `Idle_15` (**진짜 idle**) |
| 능력 | `Armature\|Skill_03\|baselayer` | `Lunge_Spin_Kick` |

서 있는 동작이 생긴 것이 가장 큰 차이다 — 예전에는 일어서는 동작의 끝 자세로
버텼다.

### 미니 보스 반입 실측 (2026-08-26)

| | 원본 | 반입 후 | 기준 |
|---|---:|---:|---:|
| 파일 | 12.4MB | 528KB | 600KB |
| 삼각형 | 10,367 | 9,329 | 6,000~10,000 |
| 텍스처 | 알베도+발광 2048² PNG | 알베도 512² webp | 512² |
| 동작 | 8개 | **8개 그대로** | — |

팔레트가 정본과 그대로 맞는다 — 연보라 회색 몸통, 크림 주둥이, 민트 포획 코어,
산호색 위험 표시.

**동작을 하나도 안 버렸다.** 동료와 다르다: 보스는 `BossPhase`가 일곱이라
받은 여덟에 전부 대응하는 자리가 있다.

| 단계 | 동작 |
|---|---|
| `idle` | `Idle_03` |
| `chase` | `Running` · `Walking` |
| `windup` (예고) | `baseball_pitching` — 던지려고 팔을 드는 모양이 그대로 예고다 |
| `slam` (내려치기) | `Axe_Spin_Attack` |
| `stagger` (비틀거림) | `Skill_01` · `Skill_03` |
| `down` (쓰러짐) | `falling_down` |

### 동료 셋 반입 실측 (2026-08-26)

| | 흰곰 | 버섯 | 검은 고양이 | 기준 |
|---|---:|---:|---:|---:|
| 원본 | 10.6MB | 10.7MB | 9.1MB | — |
| 반입 후 | 394KB | 249KB | 293KB | 600KB |
| 삼각형 | 5,639 | 4,592 | 4,161 | 3,000~6,000 |
| 동작 | 11 → 5 | 15 → 4 | 12 → 5 | — |

텍스처는 셋 다 알베도+발광 2048² PNG로 왔고, 알베도 512² webp만 남겼다.

**어느 파일이 어느 동료인지 이름으로는 알 수 없었다.** 셋 다
`Meshy_AI_Meshy_Merged_Animations (n).glb`였다. 알베도를 꺼내 이 폴더의 컨셉
그림과 대조해서 갈랐고, 실루엣(높이 띠별 폭·깊이)이 같은 답을 냈다 — 버섯은
위에서 두 번째 띠가 둥글고 넓은 갓, 고양이는 맨 위가 넓고 납작한 귀다.

#### 동작 이름이 셋 다 다르다

| 상태 | 흰곰 | 버섯 | 검은 고양이 |
|---|---|---|---|
| 달리기 | `Running` | `Running` | `Running` |
| 걷기 | `Walking` | **없음** | `Walking` |
| 서 있기 | `Stand_Up1` | `Stand_Up9` | `Stand_Up4` |
| 공격·능력 | `Attack`·`Punch_Combo` | `Kung_Fu_Punch` | `Sword_Judgment` |
| 쓰러짐 | — | — | `Knock_Down` |

셋이 공유하는 이름은 `Running` 하나뿐이다. 플레이어처럼 이름 상수 하나
(`characterClips.ts`의 `CLIP`)로는 못 묶는다 — **동료마다 클립 지도가 따로**
있어야 하고, 그 지도가 `roster.ts`의 도깨비와 짝이 된다.

**버섯에는 걷기가 없다.** 반입 때 고를 수 있는 것이 없었다. 달리기를 느리게
재생하거나, Meshy에서 걷기를 다시 뽑아야 한다.

스킨 메시라 차량과 다르게 다룬다: `join`·`flatten`·`instance`·`palette`를 끄지
않으면 뼈와 스킨이 흩어진다.

**파일의 절반이 애니메이션이었다**(721KB 중 410KB). 단순화로는 더 못 줄인다 —
메시는 이미 바닥이고 draco는 트랙을 압축하지 않는다. 게임에 대응하는 상태가
있는 다섯만 남겼다: `Running`·`Walking`·`Attack`·`Punch_Combo`·`Stand_Up1`.
버린 여섯(핸드스탠드 플립, 펀치 콤보 둘, 구르기 둘, 돌려차기)은 상태가 생기면
원본에서 다시 꺼내면 된다.

크기 규약은 `character.glb`와 같다 — Armature 스케일 0.01에 모델 높이 1.7이고,
화면 쪽이 `MODEL_HEIGHT`로 나눠 쓴다. 곰만 따로 맞출 것이 없다.

### 통째로 만들지 않는 것

- **도시 전체 건물 세트** — 대표 건물 이미지는 파사드·지붕·소품 모듈의 디자인
  기준으로 사용한다. 퀘스트 건물과 랜드마크만 선택적으로 GLB로 반입한다
- **지형·수면** — 이미 있고 예산을 통째로 먹는다
- **도로 메시** — 타일 가능한 아스팔트 베이스 한 장에 차선·횡단보도·연석·보수
  자국을 절차형 레이어로 얹는다. 도로 종류별 GLB는 만들지 않는다
- **부두·찌·물고기** — 상자와 이름으로 족하다
- **우산·도깨비 능력 VFX** — 상태에 맞춰 펼침·확산·소멸해야 하므로
  `UmbrellaGlider.tsx`와 `CompanionAbilityVfx.tsx`의 절차형 지오메트리가 정본이다

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

### 7.2 동료 넷

곰·로봇·검은 고양이·버섯의 최종 입력 이미지와 캐릭터별 프롬프트는
`assets/concepts/meshy/README.md`를 정본으로 사용한다. 이 문서에 프롬프트를
복제하지 않는다 — 한쪽만 수정되어 외형이 다시 갈라지는 것을 막기 위해서다.

### 7.3 플레이어

최종 입력 이미지와 무기별 장착 포즈는
`assets/concepts/meshy/players/README.md`를 정본으로 사용한다.

```
child adventurer — a cheerful kid around ten years old, chunky rounded proportions,
big head, cream and warm-grey clothes with one teal accent (cap or bag),
round glasses, a small backpack, sneakers, side-walking friendly pose
```

### 7.4 적과 보스

일반 적은 아래 로봇 계열을 유지한다. 보스 3종의 최종 동물형 이미지와 프롬프트는
`assets/concepts/meshy/bosses/README.md`를 정본으로 사용한다. 곰은 내려치기,
토끼는 신호 방출, 코끼리는 포획·회수 역할이다.

```
scrap robot (melee)  — knee-high junk robot from mismatched household parts,
                       rounded boxy torso, one dented socket at the chest center,
                       short stubby arms, warm-grey painted metal, comic, not scary
scrap robot (gunner) — same family, one forearm replaced by a wide barrel,
                       taller head, readable from far away
```

### 7.5 탈것·짐승·차량

배경 교통 차량의 최종 이미지와 차종별 프롬프트는
`assets/concepts/meshy/vehicles/README.md`를 정본으로 사용한다.

```
kick scooter — city scooter, narrow deck, single front post, small fat wheels
city bike    — upright city bicycle, rounded frame, no branding
skateboard   — simple deck with fat wheels, one bright accent color
toy car      — child-sized open toy car, rounded body, four fat wheels
jeju pony    — small stocky pony, short legs, thick mane, gentle face,
               simple four-leg rig for a walk cycle
jet ski      — child-sized personal watercraft, broad rounded hull, raised saddle,
               short handlebar post, no wheels, readable front-to-back silhouette
city minibus — rounded cream and teal minibus, big front window, small wheels
```

### 7.6 건물 리뉴얼

번화가·언덕 주택가·시장·옛 마을의 대표 이미지와 Meshy 반입 기준은
`assets/concepts/meshy/buildings/README.md`를 정본으로 사용한다. 전체 도시를
네 GLB로 반복하지 않고 절차형 파사드·지붕·옥상 소품에 형태와 팔레트를 옮긴다.

### 7.7 거리 소품 (한 장에 모아서)

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
     --texture-compress webp --texture-size 512 --simplify --compress quantize
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

### 8.1 Draco를 쓰지 않는다

`--compress draco`는 **쓰면 안 된다.** 앱의 `GLTFLoader`에 DRACO 디코더가
설정돼 있지 않아서, 압축한 파일은 통째로 못 읽는다. 그런데 **오류가 나지
않는다** — 로더가 조용히 실패하고 화면에는 절차적 몸(fallback)이 대신 선다.
실제로 캐릭터와 대장을 그렇게 넣고 「화면에 떴다」고 착각했다.

`--compress quantize`를 쓴다. `KHR_mesh_quantization`은 three가 기본으로
알고, 압축률은 Draco보다 낮지만(캐릭터 588KB → 920KB) 예산 안이다.
`EXT_texture_webp`도 three가 기본으로 안다.

**확인 방법**: `gltf-transform inspect`의 `extensionsRequired`에 three가 모르는
것이 있으면 안 된다. 그리고 반드시 화면에서 본다 — 모델이 아니라 fallback이
서 있는 것을 구분하는 유일한 방법이다.

스킨 메시는 `--join`·`--flatten`·`--instance`·`--palette`를 **끈다.** 켜 두면
뼈와 스킨이 흩어진다.

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
