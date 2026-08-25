# Meshy 동료 캐릭터 입력 정본

`public/title-street.webp`의 동료 네 종을 Meshy Image-to-3D에 넣기 좋게 정리한
전신 PNG다. 팔다리와 발이 겹치지 않는 정면에 가까운 3/4뷰이며, Meshy의 배경
제거가 형태만 읽을 수 있도록 투명 배경 또는 밝은 단색 배경만 사용했다.

| 캐릭터 | 입력 이미지 | 특징 |
|---|---|---|
| 로봇 | `companion-robot-v2.png` | 크림 셸, 검은 얼굴 화면, 청록 눈과 관절, 머리 프로펠러 |
| 흰곰 | `companion-bear-v2.png` | 크림 털, 청록 패딩, 헤드폰, 크로스백 |
| 검은 고양이 | `companion-cat-v1.png` | 둥근 검은 몸, 크림 눈, 연두색 패딩 조끼 |
| 버섯 | `companion-mushroom-v1.png` | 청록 갓, 크림 몸, 잎 싹, 목걸이 카메라 |

## Meshy에 넣는 순서

1. 캐릭터 하나당 PNG 하나를 별도의 Image-to-3D 작업으로 올린다.
2. 업로드 영역의 **Remove Background**를 켠다. 로봇과 곰은 밝은 단색 배경이고,
   고양이와 버섯은 이미 투명하다.
3. 아래 캐릭터별 프롬프트에 공통 접미를 이어 붙인다.
4. 첫 생성은 로봇으로 한다. 얼굴 화면, 프로펠러, 팔과 다리가 서로 붙지 않았는지
   확인한 뒤 나머지 셋에 같은 설정을 쓴다.
5. 생성 결과는 반드시 GLB로 내보낸다. 원본 PNG는 이 폴더에 그대로 둔다.

## 캐릭터별 프롬프트

### 로봇

```text
small friendly companion robot, knee-high, oversized rounded cream head with a
glossy dark face screen, exactly two cyan vertical eye lights, two-blade head
propeller, compact oval torso, short separated arms and legs, rounded teal hands
and feet, simple symmetrical silhouette
```

### 흰곰

```text
large friendly upright white bear companion, round cream-white head, tiny ears,
small brown nose, stout torso, very short chunky legs, oversized rounded paws,
muted teal puffer jacket, warm-charcoal pants, gold headphones around the neck,
simple cross-body strap, gentle protective expression
```

### 검은 고양이

```text
small upright black cat companion, large round head, short triangular ears,
compact pear-shaped body, short chunky legs, rounded paws, short visible tail,
two large cream eyes, muted leaf-green padded vest, curious calm expression
```

### 버섯

```text
tiny upright mushroom companion, warm-cream body, oversized rounded turquoise
mushroom cap with a thick cream underside and a few large cream spots, small leaf
sprout on top, simple oval eyes and smile, short separated arms and feet, small
warm-charcoal camera on a short teal neck strap
```

## 공통 접미

```text
stylized game asset, chunky rounded forms, dark-brown edge definition, two-step
toon shading, soft matte finish, cream highlights, muted warm-grey base, restrained
teal accent, game-ready low poly, clean topology, single material, neutral pose
```

```text
negative: photorealistic, realistic fur strands, PBR metal roughness, heavy normal
detail, sharp edges, thin cables, extra limbs, fused arms and legs, gradient-heavy
shading, pure grey, pure white, text, watermark, brand logo
```

## 이미지 생성 정본 프롬프트

네 PNG는 내장 이미지 생성 도구로 만들었다. 공통 생성 규칙은 다음과 같다.

```text
Use case: stylized-concept
Asset type: Meshy Image-to-3D input, game character concept
Reference: public/title-street.webp for character identity; the isolated robot for
shared finish and palette
Composition: one full-body character, centered, near-front three-quarter view no
more than 15 degrees, relaxed A-pose, arms slightly away from torso, feet separated
Style: polished stylized 3D, chunky rounded forms, dark-brown edge definition,
two-step toon shading, soft matte surfaces, cream highlights, restrained teal
Constraints: preserve the referenced identity, clean unoccluded silhouette, plain
background or genuine alpha transparency, no floor, no cast shadow, no text,
no logo, no watermark
```

캐릭터별 주제와 의상은 위의 Meshy 프롬프트를 그대로 사용했다. 고양이는 원본 생성
중 섞여 들어온 가방과 끈을 제거했고, 로봇은 원본 그림에 없는 주황색 부품을
크림·청록으로 보정했다. 밝은 캐릭터인 로봇과 곰은 투명 배경 추출 시 생긴 밝은
잔여 픽셀을 피하려고 Meshy가 권장하는 밝은 단색 배경으로 최종 저장했다.

## 다른 입력 에셋

- [플레이어와 무기 장착 포즈 7종](./players/README.md) — 중립 본체 + 무기별 손·자세 기준
- [무기 6종](./weapons/README.md) — `combat/weapons.ts`의 전체 로스터
- [보스 3종](./bosses/README.md) — 현재 고물 대장 + 같은 계열의 확장 콘셉트 2종
- [배경 교통 차량 3종](./vehicles/README.md) — 승용차·미니버스·배달 밴
- [구역별 건물 4종](./buildings/README.md) — 절차형 도시 리뉴얼 기준 + 선택적 Meshy 랜드마크
