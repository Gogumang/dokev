# Meshy 보스 입력 정본

보스는 모두 도깨비 에너지를 기계에 가두는 같은 회사의 동물 마스코트 제품군이다.
어린이가 바로 알아보는 곰·토끼·코끼리 실루엣에 크림·따뜻한 회색 바탕, 청록
구조물, 산호색 위험 표시, 민트색 포획 코어를 공유한다. 날카롭거나 공포스럽게
만들지 않고 크기와 기능으로 위협을 구분한다.

| 단계 | 이름 | 입력 이미지 | 상태 | 전투 실루엣 |
|---|---|---|---|---|
| 미니 | 고물 대장 곰 | `scrap-foreman-bear-v2.png` | 현재 코드에 구현 | 곰 귀·발바닥, 무릎까지 오는 긴 팔, 내려치기 |
| 중간 | 신호 감시 토끼 | `signal-warden-rabbit-v2.png` | 미래 확장 콘셉트 | 귀 안테나, 가슴 신호등 3개, 양손 원형 방출기 |
| 최종 | 회수국장 코끼리 | `recovery-director-elephant-v2.png` | 미래 확장 콘셉트 | 큰 귀, 코 흡입기, 배의 포획 코어 3개 |

`*-v1.png` 세 장은 이전 인간형 로봇안이다. 비교와 롤백을 위해 보존하지만 새
Meshy 작업은 동물형 `*-v2.png`를 사용한다.

## Meshy 입력

각 PNG를 별도의 Image-to-3D 작업으로 올리고 **Remove Background**를 켠다.
보스는 리깅과 공격 애니메이션이 필요하므로 팔과 몸통 사이, 두 다리 사이가
막히지 않았는지 먼저 확인한다. 고물 대장의 팔은 머리 위로 올라갈 수 있어야 한다.
토끼의 귀와 손목 방출기, 코끼리의 귀와 코는 몸통에 붙어 버리면 안 된다.

### 고물 대장

```text
large upright bear construction-toy boss twice a child's height, unmistakable round
bear ears, short cream muzzle and dark nose, huge rounded lavender-gray padded
torso, exactly two very long thick arms hanging near the knees, oversized rounded
bear paws for an overhead slam, short legs, cream work boots, one mint captive-
spirit core in a round belly window, coral repair plates and teal fasteners
```

### 신호 감시자

```text
tall upright rabbit city-signal toy boss three times a child's height, two long
cream rabbit ears used as antennas with teal tips, rounded rabbit cheeks and tiny
dark nose, narrow cream torso with three stacked coral amber and teal signal
lenses, exactly two long arms with oversized circular emitter mitts, sturdy
separated legs, mint captive-spirit core in the abdomen
```

### 회수국장

```text
enormous upright elephant rescue-toy boss four times a child's height, huge rounded
cream ears with teal inner panels, exactly one thick flexible trunk ending in a
blunt vacuum-cup collector, broad charcoal-and-cream drum torso, large recessed
belly cage with exactly three mint spirit lights behind thick teal bars, exactly
two massive arms with rounded mitts, short powerful legs and wide cream feet
```

### 공통 접미

```text
full-body stylized animal game boss, animal silhouette first and machinery second,
one connected character, chunky rounded low-poly forms, dark-brown edge definition,
two-step toon shading, matte painted vinyl and molded plastic, playful modern-city
machinery, neutral rig-friendly stance, arms separated from torso, feet apart,
single material
```

```text
negative: horror, gore, realistic military mech, spikes, sharp edges, extra limbs,
thin loose wires, photorealism, scenery, floor, cast shadow, text, logo, watermark
```

## 이미지 생성 프롬프트 규격

내장 이미지 생성 도구에는 각 보스 설명과 함께 다음 구도를 사용했다.

```text
Use case: stylized-concept
Asset type: Meshy Image-to-3D input, full-body game boss character
Reference: public/title-street.webp for the city world and rounded toy language;
the matching v1 boss only for its combat function, not its humanoid silhouette
Composition: exactly one complete boss, centered full body, near-front three-quarter
view no more than 15 degrees, neutral stance, arms away from torso, feet apart,
all parts visible with generous padding
Scene/backdrop: uniform very light warm-gray studio background
Constraints: one connected character only, no weapon, floor, shadow, scenery,
text, logo, or watermark
```
