# Meshy 무기 입력 정본

`src/game/combat/weapons.ts`에 정의된 여섯 무기를 각각 독립 GLB로 만들기 위한
입력이다. 주인공과 무기를 한 모델로 합치지 않는다. 각 GLB의 손잡이 원점을
캐릭터 오른손 소켓에 붙인다.

실제 손 크기와 양손 지지 위치는 [플레이어 장착 포즈](../players/README.md)를
정본으로 사용한다.

| 코드 ID | 게임 이름 | 입력 이미지 | 실루엣 역할 |
|---|---|---|---|
| `sword` | 장난감 칼 | `toy-sword-v1.png` | 짧고 넓은 빠른 근접 |
| `bat` | 장난감 방망이 | `toy-bat-v1.png` | 길고 가벼운 기본 근접 |
| `hammer` | 초장축 고무 망치 | `rubber-hammer-v3.png` | 주인공 키보다 긴 손잡이와 상체보다 큰 양면 헤드 |
| `popgun` | 딱총 | `toy-popgun-v1.png` | 짧고 단순한 한 발 원거리 |
| `beam` | 유령 잡는 광선총 | `ghost-beam-v1.png` | 큰 포획 총구와 청록 코어 |
| `bow` | 장난감 활 | `toy-bow-v1.png` | 길고 정밀한 최장거리 |

## Meshy 입력

무기마다 작업을 하나씩 분리하고 업로드 영역의 **Remove Background**를 켠다.
Smart Topology를 쓸 때도 손잡이와 본체가 붙어 있는지, 활의 줄이 끊기지 않았는지
먼저 확인한다. 탄·광선·화살은 GLB에 넣지 않고 게임의 투사체와 이펙트로 그린다.

아래 프롬프트 뒤에 공통 접미와 부정 프롬프트를 이어 붙인다.

### `sword`

```text
short broad rounded toy sword, blunt cream plastic blade, wide teal oval hand
guard, coral wrapped grip, cream pommel, fast child-safe melee weapon
```

### `bat`

```text
long lightweight foam-plastic toy bat, fat rounded teal striking end, narrower
cream handle with teal grip bands, restrained coral end cap, no spikes
```

### `hammer`

```text
colossal double-sided rubber mallet, 2.3 meters total length, 1.35-meter-wide teal
cylindrical head with a 0.8-meter diameter, two enormous coral striking faces,
thick cream protective rings, 1.55-meter straight two-handed charcoal grip with
widely separated hand zones, absurdly long and oversized hero weapon
```

망치는 다른 무기와 같은 손 크기로 줄이지 않는다. 게임 월드 기준 전체 길이는
주인공 키의 약 1.7배, 헤드 폭은 어깨 너비의 약 2.2배로 맞춘다. 손잡이 노출 길이는
약 1.55m로 두 손 사이를 넓게 벌릴 수 있어야 한다. 헤드가 화면에서 주인공 상체보다
작거나 손잡이가 주인공 키보다 짧으면 `v3` 정본과 다른 스케일이다. 이전
`rubber-hammer-v1.png`와 `rubber-hammer-v2.png`는 형태 이력으로만 보존한다.

## Meshy 리깅·Animate 구조

망치는 **리깅하지 않는 독립 강체 GLB**다. Meshy 공식 리깅 문서도 props·건물·
차량은 Auto Rig 대상이 아니라고 명시한다. 다음 순서로 반입한다.

1. `rubber-hammer-v3.png`만 Image-to-3D에 넣어 망치 GLB를 만든다.
2. 결과를 한 덩어리의 연결된 메시로 정리한다. 손잡이 밴드나 헤드 링이 떠 있으면
   합치고, Remesh 후에도 손잡이 축이 곧은지 확인한다.
3. 망치 자체에는 본과 스킨 웨이트를 만들지 않는다.
4. DCC에서 오른손 주 그립 위치를 모델 원점으로 옮기고 전방을 로컬 `+Z`로 맞춘다.
5. 런타임에서 망치 루트를 캐릭터 오른손 본에 붙인다. 왼손은 손잡이 위쪽의 보조
   그립 목표에 IK로 맞춘다.
6. 휘두르기·내려찍기는 Meshy Animate가 캐릭터에 적용한 전투 동작을 사용한다.
   초대형 양손 동작과 맞는 프리셋이 없으면 리깅된 FBX를 Blender/Maya로 내보내
   캐릭터 동작만 보정한다. 망치 메시를 변형해서 동작을 만들지 않는다.

공식 참고: [Meshy Rigging](https://docs.meshy.ai/en/webapp/guides/3d-model/rigging),
[Meshy Animate](https://docs.meshy.ai/en/webapp/guides/animate).

### `popgun`

```text
compact rounded toy popgun, short wide trumpet muzzle, cream molded shell, teal
barrel ring and grip, coral trigger, simple single-shot silhouette
```

### `beam`

```text
ghost-catching beam blaster, oversized circular capture muzzle with three thick
cream petals around a cyan energy core, cream shell, dark inset chamber, teal
energy rings, child-sized grip, paranormal gadget rather than a firearm
```

### `bow`

```text
child-sized toy recurve bow, thick rounded cream limbs, teal outer caps, coral
central grip, continuous dark-brown string, molded plastic, no arrow or quiver
```

### 공통 접미

```text
standalone stylized game asset, one connected object, chunky rounded forms,
dark-brown edge definition, two-step toon shading, matte molded plastic, simple
game-ready low-poly geometry, single material, no character, no text, no logo
```

```text
negative: photorealistic, real weapon, sharp dangerous edge, military detail,
wood grain, real steel, thin fragile parts, extra objects, floating pieces,
floor, cast shadow, watermark
```

## 이미지 생성 프롬프트 규격

내장 이미지 생성 도구에는 각 무기 설명과 함께 다음 구도를 사용했다.

```text
Use case: stylized-concept
Asset type: Meshy Image-to-3D input, standalone game weapon
Reference: public/title-street.webp for world palette; companion-robot-v2.png for
cream/teal toy material finish
Composition: exactly one complete weapon, near-orthographic three-quarter product
view, centered with generous padding, no crop
Scene/backdrop: uniform very light warm-gray studio background
Constraints: one connected object only, no hands, character, stand, floor, shadow,
text, logo, or watermark
```
