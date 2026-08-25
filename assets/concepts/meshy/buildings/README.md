# 도시 건물 리뉴얼 정본

타이틀 화면의 크림·청록·따뜻한 회색 바탕, 둥근 모서리와 굵은 덩어리를 현재
절차형 도시에 옮기기 위한 구역별 대표 건물이다.

| 구역 | 기준 이미지 | 핵심 실루엣 |
|---|---|---|
| 번화가 | `building-downtown-mixeduse-v1.png` | 좁고 높은 5층, 둥근 코너, 반복 창 베이 |
| 언덕 주택가 | `building-hillside-home-v1.png` | 2층 주택, 외부 계단, 옥상 물탱크 |
| 노을 시장 | `building-market-shop-v1.png` | 낮은 코너 상점, 굵은 차양, 빈 간판 판 |
| 옛 마을 | `building-oldtown-courtyard-v1.png` | 낮은 ㄱ자 집, 굵은 기와지붕, 돌 기단 |

## 어떻게 사용하나

기본 사용법은 **건물 전체를 GLB로 교체하는 것이 아니라 절차형 건물의 디자인
기준으로 쓰는 것**이다. 현재 `cityLayout.ts`가 필지와 높이를 만들고,
`FacadeGroup.tsx`, `RoofMeshes.tsx`, `cityDetails.ts`가 창·지붕·간판·옥상 소품을
조합한다. 이미지의 다음 요소를 그 모듈에 옮기면 도시의 다양성을 유지할 수 있다.

- 번화가: 크림 수평 띠, 둥근 코너 인상, 청록 창, 옥상 셋백과 물탱크
- 주택가: 따뜻한 회분홍 옹벽, 외부 계단, 청록 난간, 코랄 문
- 시장: 두꺼운 줄무늬 차양, 낮은 층고, 빈 원형·가로형 간판
- 옛 마을: 크림 벽, 밝은 돌 기단, 자주빛 짙은 기와, 청록 대문

Meshy로 직접 3D화할 수도 있지만, 네 모델을 모든 필지에 반복하지 않는다.
가까이 접근하는 퀘스트 건물이나 구역 랜드마크에만 GLB를 쓰고 나머지는 절차형으로
유지한다. 직접 반입할 때는 건물당 8~15k triangles, 알베도 512²~1024²,
단일 머티리얼, 압축 후 GLB 600KB 이하를 목표로 한다.

## 도로는 하나면 되는가

**기본 아스팔트 재질은 하나면 충분하다.** 도로 전체를 Meshy 메시 하나로 만들지는
않는다. 현재 구현도 `textures.ts`의 단일 아스팔트 타일을 반복하고 아래 요소를
별도 절차형 레이어로 얹는다.

- 흰색·황색 차선과 붉은 자전거도로·파란 버스전용차로
- 횡단보도, 연석, 보도블록과 노란 점자블록
- 배수구·맨홀, 아스팔트 골재·보수 자국·균열
- 지형 높이와 구역 경계에 따른 도로 형태

따라서 도로용 추가 3D 에셋은 필요 없다. 한 장의 타일 가능한 아스팔트 베이스와
절차형 오버레이 조합이 반복감, 교차로 연결, 경사 대응과 성능에 가장 적합하다.

## Meshy 공통 프롬프트

각 이미지를 별도의 Image-to-3D 작업에 넣고 **Remove Background**를 켠 뒤 아래
접미를 사용한다.

```text
stylized city building, chunky rounded forms, thick readable architectural parts,
dark-brown edge definition, two-step toon shading, soft matte surfaces, warm cream
and tinted warm-grey base, restrained teal and coral accents, game-ready low poly,
clean topology, single material, complete building visible
```

```text
negative: photorealistic, glass skyscraper, razor-thin railings or roof tiles,
dense cables, micro-detail, dramatic perspective, environment, people, cars,
readable text, brand logo, watermark
```

## 이미지 생성 기준

네 PNG는 내장 이미지 생성 도구로 만들었다. `public/title-street.webp`는 팔레트와
둥근 형태 언어의 참고로만 사용했다. 모든 이미지는 밝은 단색 배경, 근직교 정면
3/4뷰, 기단부터 지붕까지 잘리지 않는 단독 건물로 생성했다.
