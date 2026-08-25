# Meshy 플레이어와 무기 장착 포즈 정본

타이틀 화면의 주인공을 같은 얼굴·의상·비율로 고정한 플레이어 입력 이미지다.
`player-neutral-v1.png`는 캐릭터 GLB 생성용이고, 나머지 여섯 장은 무기 크기,
손잡이 위치, 양손 접촉과 전투 자세를 맞추는 장착 기준이다.

| 용도 | 이미지 | 손과 자세 |
|---|---|---|
| 캐릭터 본체 | `player-neutral-v1.png` | 무기 없는 A 포즈, 손과 발 분리 |
| 장난감 칼 | `player-sword-v1.png` | 오른손 한손 그립, 칼날을 몸 밖으로 기울임 |
| 장난감 방망이 | `player-bat-v1.png` | 오른손 한손 그립, 타격부를 어깨 밖에 배치 |
| 초장축 고무 망치 | `player-hammer-v3.png` | 긴 손잡이의 위·아래 그립을 벌려 잡는 양손 소켓·IK 기준 |
| 딱총 | `player-popgun-v1.png` | 오른손 그립, 왼손 총열 지지 |
| 유령 잡는 광선총 | `player-beam-v1.png` | 오른손 그립, 왼손 포획 총구 하단 지지 |
| 장난감 활 | `player-bow-v1.png` | 왼손 중심 그립, 오른손 줄 당김 |

## Meshy에 넣는 순서

1. `player-neutral-v1.png`만 Image-to-3D에 넣어 플레이어 본체를 만든다.
2. 무기는 `../weapons/`의 독립 입력 이미지로 각각 별도 GLB를 만든다.
3. 장착 포즈 여섯 장을 보면서 무기 손잡이 원점과 오른손 소켓을 맞춘다.
4. 망치·딱총·광선총·활은 왼손 보조 소켓 또는 IK 목표도 포즈 이미지에 맞춘다.
5. 캐릭터와 무기를 하나의 모델로 굳히지 않는다. 그래야 숫자키 무기 교체가 된다.

### 초대형 망치 스케일

`player-hammer-v3.png`가 망치 장착 크기의 정본이다. 헤드 폭은 주인공 어깨 너비의
약 2.2배이고, 전체 길이는 주인공 키의 약 1.7배다. 오른손은 손잡이 끝의 주 그립,
왼손은 헤드 소켓 가까운 보조 그립에 두어 두 손 사이를 넓게 벌린다. 대기 자세에서는
헤드를 몸 바깥에 둔다. 그래야 얼굴을 가리지 않으면서 무게와 길이가 함께 보인다.

이전 `player-hammer-v1.png`와 `player-hammer-v2.png`는 비율 이력으로만 보존한다.
망치 소켓·IK·공격 포즈를 맞출 때는 `player-hammer-v3.png`와
`../weapons/rubber-hammer-v3.png`만 사용한다.

## Meshy Animate 순서

1. **무기 없는** `player-neutral-v1.png`로 캐릭터 GLB를 만든다. 망치를 든 포즈는
   리깅 입력이 아니라 스케일·소켓·IK 참고 이미지다.
2. 캐릭터를 Remesh한 뒤 A포즈를 유지한 채 Meshy Rigging 또는 Animate에 넣는다.
3. Idle·Walk·Run·Jump·전투 동작을 골라 GLB 또는 FBX로 내보낸다.
4. `rubber-hammer-v3` 강체 GLB를 오른손 본에 붙이고, 왼손은 보조 그립 IK로 맞춘다.
5. 초대형 망치가 몸이나 바닥을 뚫는 프리셋은 쓰지 않는다. 맞는 양손 동작이 없으면
   FBX를 Blender/Maya에서 보정한다.

Meshy는 T/A포즈의 휴머노이드·사족 캐릭터에 Auto Rig와 Animate를 적용하고, props는
리깅 대상에서 제외한다. 그래서 캐릭터와 망치를 한 모델로 굳히지 않는 것이 핵심이다.

## 캐릭터 정본 프롬프트

```text
cheerful child adventurer around ten years old, large rounded head, short dark
hair, cream baseball cap with small colorful patches, round coral glasses,
warm-gray zip hoodie with muted lavender sleeves and restrained teal details,
dark shorts, white crew socks, chunky cream sneakers with teal coral and golden
accents, small compact backpack, friendly face, stylized game character
```

```text
polished stylized 3D, chunky rounded forms, dark-brown edge definition, two-step
toon shading, soft matte surfaces, near-orthographic near-front three-quarter
view, one complete full-body character, uniform very light warm-gray background
```

```text
negative: photorealistic, realistic adult proportions, cropped feet, hidden
hands, extra fingers, fused hand and weapon, floating weapon, extra weapon,
environment, floor, cast shadow, text, logo, watermark
```

장착 포즈는 위 프롬프트에 해당 무기 이미지를 두 번째 참조로 넣고, 표의 손과 자세를
추가해 생성했다. 모든 장에서 얼굴, 모자, 안경, 후드, 반바지, 가방과 신발은
`player-neutral-v1.png`를 그대로 유지한다.
