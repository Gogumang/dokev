"use client";

/**
 * 3D 런타임 — 캔버스, 플레이어, 추적 카메라, 성능 계측.
 *
 * 이 파일의 핵심은 "속도 연동 카메라"다. 이동 코드를 바꾸지 않고 FOV·거리·시선
 * 선행·착지 흔들림만 속도에 연동해도 체감 속도가 크게 달라진다. TRAILER_FEATURE_
 * ANALYSIS 3.3절이 말하는 "이동 자체가 놀이"의 대부분이 여기서 만들어진다.
 */

import { Canvas } from "@react-three/fiber";
import { useCallback, useMemo } from "react";
import * as THREE from "three";

import {
  CAMERA,
  } from "@/game/config/tuning";
import {
  } from "@/game/player/locomotion";
import {
  } from "@/game/systems/input";
import { Enemies } from "@/game/combat/Enemies";
import { dokebiPreset } from "@/game/dokebi/roster";
import { watchContextLoss } from "@/game/systems/contextLoss";
import {
  } from "@/game/systems/vending";
import {
  } from "@/game/scene/cameraRig";
import type { PlayerLink, SceneProps } from "@/game/scene/sceneTypes";

/*
 * 타입은 sceneTypes가 갖고 있다. HUD 여러 곳이 예전부터 이 파일에서
 * RuntimeStats를 가져오고 있어 여기서 다시 내보낸다 — 임포트 경로를 한꺼번에
 * 바꾸는 것은 이 정리의 목적이 아니다.
 */
export type { RuntimeStats } from "@/game/scene/sceneTypes";
import { ClueGlow } from "@/game/quest/ClueGlow";
import { pendingClues } from "@/game/quest/clues";
import { PlayerRig } from "@/game/scene/PlayerRig";
import { PostProcessing } from "@/game/scene/PostProcessing";
import { Boss } from "@/game/combat/Boss";
/*
 * 파일 이름이 규칙(`Shrine.tsx` + `shrineBody.ts`)을 따른다. 복수형
 * `SpiritGates.tsx`로 두었더니 macOS의 대소문자 구분 없는 파일 시스템에서
 * 순수 모듈 `spiritGates.ts`와 같은 파일로 취급돼 타입 검사가 막혔다.
 */
import { SpiritGates } from "@/game/world/SpiritGate";
import { gateCollider, SPIRIT_GATES } from "@/game/world/spiritGates";
import { DEFAULT_WEAPON } from "@/game/combat/weapons";
import { BOSS_HOME } from "@/game/combat/bossSim";
import { Shrines } from "@/game/dokebi/Shrine";
import { BLIP_FLOAT_COUNT } from "@/game/systems/minimap";
import { PLAYER_COMBAT } from "@/game/combat/playerCombat";
import {
  } from "@/game/quest/dialogue";
import {
  isTransparentFilter,
  photoFilterPreset,
  } from "@/game/systems/photoFilter";
import { timeOfDayPreset } from "@/game/world/timeOfDay";
import {
  } from "@/game/quest/questRunner";
import { Companion } from "@/game/dokebi/Companion";
import {
  createGrappleView,
  GrappleVisuals,
  } from "@/game/player/GrappleVisuals";
import { FilterOverlay } from "@/game/scene/FilterOverlay";
import { City } from "@/game/world/City";
import { SkyDome } from "@/game/world/SkyDome";
import { ZoneAtmosphere } from "@/game/world/ZoneAtmosphere";
import { WorldLighting } from "@/game/world/WorldLighting";
import { Crowd } from "@/game/world/Crowd";
import { Traffic } from "@/game/world/Traffic";

export function GameScene(props: SceneProps) {
  const { layout, details, quality, reducedMotion } = props;

  /*
   * 아직 조사하지 않은 흔적 목록.
   *
   * `useMemo`로 감싸고 의존성에 `found.length`를 넣었다가 **린트 억제 주석까지
   * 달게 됐다** — 제자리로 미는 배열이라 정체가 안 바뀌어 길이로 볼 수밖에
   * 없었기 때문이다. 그냥 매 렌더 계산한다: 이 컴포넌트는 프레임마다 다시
   * 그리지 않고(공유 객체를 `useFrame`에서 직접 쓴다) 흔적은 셋뿐이다.
   *
   * 자식은 좌표를 키로 쓰므로 배열이 새로 만들어져도 다시 붙지 않는다.
   */
  const pendingClueList = pendingClues(props.clueView.found);

  // 플레이어와 동료가 공유하는 링크. 스폰 지점으로 초기화해 첫 프레임에
  // 동료가 원점에서 날아오는 그림을 막는다.
  /*
   * 가장 가까운 주민. 군중이 매 프레임 채우고 PlayerRig가 읽는다.
   *
   * 매 프레임 바뀌므로 상태가 아니라 공유 객체다 — 씬의 다른 연결들과 같다.
   */
  const residentCandidate = useMemo(
    () => ({ index: -1, distanceSquared: Number.POSITIVE_INFINITY }),
    [],
  );

  const playerLink = useMemo<PlayerLink>(
    () => ({
      position: { ...layout.spawn },
      speed: 0,
      facing: 0,
      grounded: true,
      attackQueued: false,
      // 시작 무기. 저장하지 않는다 — 판마다 방망이로 시작하는 편이 배우기 쉽다.
      weapon: DEFAULT_WEAPON,
      summoned: true,
      abilityRequests: 0,
      bossSlamHit: false,
      summonHeal: 0,
      /*
       * 대장의 자리. 보스가 매 프레임 덮어쓴다 — 여기 값은 첫 프레임에만
       * 쓰이고, `bossHittable`이 false라 그 프레임에는 아무것도 못 맞힌다.
       */
      bossX: 0,
      bossZ: 0,
      bossHittable: false,
      bossBoltDamage: 0,
      /*
       * 이어받은 판에서도 보스를 눕힌 사실이 남아야 한다. 새 저장 필드는
       * 필요 없다 — 보스 여정을 마쳤다는 것이 이미 저장되어 있다.
       */
      bossDefeated: props.resumeFrom?.bossDefeated === true,
      /*
       * 이어받은 수에서 시작한다 — 지도는 하나 남았다는데 목표가 0/3이면
       * 어긋난다. 공유 목록이 아니라 **이어받기 값**을 읽는다: 공유 목록은
       * 매 프레임 바뀌므로 이 객체가 안정적일 수 없다.
       */
      cluesFound: props.resumeFrom?.foundClues?.length ?? 0,
      // stats와 같은 객체를 쓴다. 두 벌을 만들면 사운드가 보는 수와 실제 사건이 어긋난다.
      cues: props.stats.combat,
      attackElapsed: null,
      playerHp: PLAYER_COMBAT.maxHp,
      playerDowned: false,
      respawnRequested: false,
      abilityAggroScale: 1,
      abilityRegenScale: 1,
      enemyBlips: new Float32Array(BLIP_FLOAT_COUNT),
      enemyBlipCount: 0,
      companionX: 0,
      companionZ: 0,
      companionVisible: false,
      companionAbilityReady: true,
      companionLightRange: 0,
      defeatedTotal: props.resumeFrom?.defeatedTotal ?? 0,
    }),
    [layout.spawn, props.resumeFrom, props.stats.combat],
  );

  /**
   * 플레이어가 부딪히는 것들 — 건물 뒤에 **문 셋**을 덧붙인다.
   *
   * 한 배열로 합쳐 두고 문 쪽 칸만 매 프레임 제자리에서 고친다. 프레임마다
   * 새 배열을 만들면 이것을 받는 리그가 매번 다른 참조를 보게 되고, 그러면
   * 참조가 바뀔 때마다 딸린 것들이 다시 만들어진다.
   */
  const gateBoxes = useMemo(() => SPIRIT_GATES.map((gate) => gateCollider(gate, false)), []);
  const walkColliders = useMemo(
    () => [...layout.colliders, ...gateBoxes],
    [layout.colliders, gateBoxes],
  );

  const grappleView = useMemo(() => createGrappleView(), []);

  /*
   * 하늘·안개·조명을 한 곳에서 꺼낸다. 세 군데가 각자 색을 들고 있으면
   * 시간대를 바꿀 때 하나가 빠져 지평선에 색 경계가 남는다.
   */
  const sky = timeOfDayPreset(props.timeOfDay);
  const filter = photoFilterPreset(props.photoFilter);

  /* 함께 다니는 도깨비들. 해금 판정은 PlayClient가 한다 */
  const companionOrder = props.companionParty;

  /*
   * 그 자리가 벽인지 판정한다. 로봇 스폰이 쓴다.
   *
   * 여유(margin)를 두는 이유: 벽에 딱 붙어 생기면 몸통 절반이 건물에 묻힌다.
   * 충돌체 목록은 한 번 만들어지고 바뀌지 않으므로 useCallback으로 고정한다 —
   * 참조가 바뀌면 Enemies가 적을 통째로 다시 만든다.
   */
  const isBlocked = useCallback(
    (x: number, z: number) => {
      const margin = 1.2;
      return layout.colliders.some(
        (box) =>
          x >= box.minX - margin &&
          x <= box.maxX + margin &&
          z >= box.minZ - margin &&
          z <= box.maxZ + margin,
      );
    },
    [layout.colliders],
  );

  const onCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      gl.setClearColor(sky.sky);
      /*
       * 컨텍스트 손실 감시. 여기서 거는 이유는 캔버스 요소를 얻을 수 있는
       * 가장 이른 시점이기 때문이다. 해제는 캔버스가 사라질 때 같이 되므로
       * 별도 정리가 필요 없다 — 리스너가 그 요소에만 붙어 있다.
       */
      watchContextLoss(gl.domElement, props.contextView);
    },
    [sky.sky, props.contextView],
  );

  return (
    <Canvas
      shadows={quality.shadows}
      dpr={[1, quality.maxPixelRatio]}
      /*
       * preserveDrawingBuffer는 사진 저장에 필수다. 끄면 toBlob이 빈 이미지를
       * 준다. 약간의 성능 비용이 있지만 포토 모드가 동작하지 않는 것보다 낫다.
       */
      gl={{
        antialias: quality.antialias,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
        /*
         * 톤매핑을 끈다.
         *
         * R3F 기본값은 ACES 필믹이다. 실사 렌더에서는 맞지만 카툰 룩과는
         * 상극이다 — 채도를 눌러 회색 쪽으로 당기고 밝은 쪽을 눕혀서,
         * 파스텔로 올려 둔 벽 색이 화면에서는 도로 바래 보인다. 간판·노면
         * 표시는 `toneMapped={false}`라 그것만 채도가 살아 있었고, 그래서
         * **같은 도시 안에서 색 계열이 둘로 갈라져 있었다.**
         *
         * 끄는 대신 광원 세기를 낮춰야 한다(timeOfDay). 합이 1을 넘으면
         * 눌러 줄 곡선이 없어 벽이 그냥 흰색으로 날아간다.
         */
        toneMapping: THREE.NoToneMapping,
      }}
      camera={{ fov: CAMERA.fovBase, near: 0.1, far: quality.fogFar + 60 }}
      onCreated={onCreated}
      /*
       * 캔버스 크기 측정 옵션.
       *
       * 기본값은 스크롤 이벤트에 디바운스를 건다. 이 화면은 스크롤이 없고,
       * 마운트 직후의 첫 측정이 디바운스에 걸려 유실되면 씬이 0x0으로 남아
       * 아무것도 그려지지 않는다. 디바운스를 끄고 offsetSize로 직접 읽는다.
       */
      resize={{ scroll: false, debounce: 0, offsetSize: true }}
      /*
       * 톤(흑백·대비)은 사각형으로 만들 수 없어 CSS로 건다. **포토 모드에서만**
       * — 색 얹기 사각형과 같은 조건이다. 저장할 때는 `useCapture`가 화면에
       * 실제로 걸린 값을 그대로 읽어 사진에 옮기므로 둘이 갈라지지 않는다.
       */
      style={{
        position: "absolute",
        inset: 0,
        filter: props.photoMode && filter.tone ? filter.tone : undefined,
      }}
    >
      {/* 안개 색과 배경색을 맞춰야 먼 곳이 안개 속으로 자연스럽게 사라진다 */}
      <color attach="background" args={[sky.sky]} />
      {/* 하늘 돔이 그 배경을 덮는다 — 배경색은 돔이 뜨기 전 한 프레임과 폴백이다 */}
      <SkyDome preset={sky} viewDistance={quality.fogFar} />
      <fog attach="fog" args={[sky.sky, quality.fogNear, quality.fogFar]} />
      {/*
        * 구역에 따라 안개 거리와 색을 옮긴다. 선언된 `fog`가 출발점이고,
        * 이쪽이 매 프레임 그 값을 고친다 — 리렌더 없이.
        */}
      <ZoneAtmosphere quality={quality} preset={sky} viewer={props.stats} />
      <WorldLighting quality={quality} worldHalfExtent={layout.halfExtent} preset={sky} viewer={playerLink} />
      <City
        layout={layout}
        details={details}
        quality={quality}
        viewer={playerLink}
        nightGlow={sky.nightGlow}
      />
      {/* 시민과 차량은 시각 요소일 뿐이다 — 충돌체에 넣지 않는다 */}
      {/*
        가장 가까운 주민은 군중이 알려 주고, 누가 반응할지는 PlayerRig가
        정한다 — 간판과 같은 키를 쓰므로 둘을 아는 한 곳이어야 한다.
      */}
      <Crowd
        quality={quality}
        reducedMotion={reducedMotion}
        talk={{ viewer: playerLink, candidate: residentCandidate }}
      />
      <Traffic
        quality={quality}
        reducedMotion={reducedMotion}
        halfExtent={layout.halfExtent}
        glow={sky.nightGlow}
      />
      <PlayerRig
        {...props}
        playerLink={playerLink}
        colliders={walkColliders}
        grappleView={grappleView}
        residentCandidate={residentCandidate}
      />
      {/*
        빛으로 여는 문. 상자를 매 프레임 제자리에서 고치므로 리그가 보는
        목록과 **같은 객체**여야 한다 — 복사해 넘기면 문이 그림이 된다.
      */}
      <SpiritGates
        link={playerLink}
        boxes={gateBoxes}
        view={props.gateView}
        reducedMotion={props.reducedMotion}
      />
      <GrappleVisuals view={grappleView} />
      {/* 색보정은 포토 모드에서만. 플레이 중에는 화면을 가리기만 한다 */}
      {props.photoMode && !isTransparentFilter(filter) && <FilterOverlay filter={filter} />}
      {/* 미니 보스 — 광장 반대편 교차로에 서 있다 */}
      <Boss
        link={playerLink}
        frozen={props.photoMode}
        home={BOSS_HOME}
        reducedMotion={reducedMotion}
        view={props.bossView}
        /* 만난 도깨비가 곧 전력이다 — 보스와 마주치면 전부 불려 나온다 */
        met={props.metDokebi}
      />

      {/* 아직 만나지 못한 도깨비가 기다리는 자리 */}
      <Shrines
        link={playerLink}
        questView={props.questView}
        met={props.metDokebi}
        reducedMotion={reducedMotion}
      />
      {/* 도깨비 동료 — 플레이어 링크를 매 프레임 읽어 따라온다 */}
      {/*
        만난 도깨비가 모두 따라온다. 맨 앞은 지금 고른 도깨비다 — 데리고
        다니기로 고른 동료가 뒤에 서 있으면 선택이 무의미해 보인다.
      */}
      {companionOrder.map((id, index) => (
        <Companion
          key={id}
          target={playerLink}
          command={playerLink}
          reducedMotion={reducedMotion}
          spirit={dokebiPreset(id)}
          effects={playerLink}
          slot={index}
        />
      ))}
      {/*
        동료 빛에 드러나는 흔적.

        도감이 「주변에 숨은 흔적을 잠깐 빛나게 한다」고 약속하는데 흔적은
        월드에 그려지지도 않았다. 목록은 찾은 개수가 바뀔 때만 다시 만든다 —
        흔적은 셋뿐이고 늘기만 한다.

        **동료보다 뒤에 둔다.** 이 컴포넌트는 동료가 쓴 빛 반경을 *읽는* 쪽이고,
        R3F는 JSX 형제 순서대로 프레임을 돈다. 앞에 두었더니 `PlayerRig`가 막
        0으로 되돌린 값을 읽어 **아무것도 드러나지 않았다** — 적이 동료 뒤에
        있는 것과 같은 이유다(되돌리기 → 합치기 → 읽기).
      */}
      <ClueGlow link={playerLink} clues={pendingClueList} reducedMotion={reducedMotion} />
      {/* 장난감 로봇 적 — 같은 링크에서 위치·방향·공격 입력을 읽는다 */}
      {/*
        후처리는 씬의 마지막에 단다.
        **priority 1이라 R3F의 자동 렌더가 꺼지고 여기가 유일한 렌더 지점이
        된다.** 저사양에서는 아예 달지 않는다 — 달지 않아야 자동 렌더가
        돌아온다(구독이 없으면 R3F가 다시 그린다).
      */}
      {quality.postProcessing && <PostProcessing stats={props.stats} />}

      <Enemies
        frozen={props.photoMode}
        link={playerLink}
        halfExtent={layout.halfExtent}
        isBlocked={isBlocked}
        spawn={layout.spawn}
        quality={quality}
        reducedMotion={reducedMotion}
      />
    </Canvas>
  );
}
