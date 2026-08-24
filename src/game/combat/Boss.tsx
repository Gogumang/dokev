"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 * 보스는 useFrame에서 Object3D 변환을 직접 갱신한다. setState로 옮기면
 * 초당 60회 리렌더가 발생한다.
 */
/* eslint-disable react-hooks/immutability */

/**
 * 미니 보스 「고물 대장」 — 렌더.
 *
 * 일반 로봇과 같은 부품(상자)을 쓰되 크기와 색으로 구분한다. 형태를 새로
 * 만들지 않는 이유: 같은 공장에서 나온 큰 놈으로 읽혀야 도시의 이야기가
 * 이어진다.
 *
 * **예고 링이 이 싸움의 핵심 정보다.** 바닥에 퍼지는 원이 없으면 언제 피해야
 * 하는지 알 수 없고, 그러면 체력만 두꺼운 로봇이 된다.
 */

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  BOSS,
  createBoss,
  damageBoss,
  projectBossView,
  consumeBossBoltDamage,
  projectBossPosition,
  recordBossHit,
  recordSlamStart,
  slamHits,
  stepBoss,
  type BossState,
} from "@/game/combat/bossSim";
import type { CombatLink } from "@/game/combat/Enemies";
import { BOSS_BODY } from "@/game/combat/bossBody";
import { isInAttackArc } from "@/game/combat/combatSim";
import { DOKEBI_ORDER, type DokebiId } from "@/game/dokebi/roster";
import {
  canSummon,
  createSummon,
  memberPosition,
  requestSummon,
  roleForDokebi,
  staggerHitsWithMark,
  stepSummon,
  type SummonRole,
  type SummonState,
} from "@/game/combat/summonSim";
import { WEAPONS } from "@/game/combat/weapons";
import { getLampGlowTexture } from "@/game/world/textures";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import { terrainHeight } from "@/game/world/terrain";

/** 단계별 몸통 색 */
const COLOR = {
  normal: "#8a8394",
  windup: "#ff8a3d",
  stagger: "#ffd23f",
  down: "#565061",
} as const;

export interface BossProps {
  link: CombatLink;
  /** 시간을 멈출지 (포토 모드). `Enemies`와 같은 이유 — 포즈를 고르는 동안 맞았다 */
  frozen: boolean;
  /** 서 있는 자리 */
  home: { x: number; z: number };
  reducedMotion: boolean;
  /** HUD가 읽는 보스 상태. 이 컴포넌트가 매 프레임 채운다 */
  view: { engaged: boolean; healthRatio: number; telegraph: boolean; distance: number; phase: string };
  /**
   * 지금까지 만난 도깨비.
   *
   * 보스와 마주치면 **전부** 불려 나온다. 하나를 고르게 하지 않는 이유는
   * `summonSim` 머리말에 적어 두었다 — 고르게 만들면 결국 가장 센 하나만 쓰인다.
   */
  met: readonly DokebiId[];
}

/**
 * 역할별 빛 색.
 *
 * 도감(`roster`)에 색을 두지 않았다. 저기는 성격과 능력 설명이 사는 곳이고, 색은
 * **화면에서 넷을 구분하기 위한** 값이라 그리는 쪽이 정해야 한다. 트레일러 3.4의
 * 「강한 컬러 파티클」을 따라 채도를 낮추지 않는다.
 */
/** 대장 가슴의 점. 일반 로봇과 같은 색이어야 같은 것으로 읽힌다 */
const BOSS_CORE_COLOR = "#7cf5c4";

const SUMMON_COLOR: Record<SummonRole, string> = {
  mark: "#ffe066",
  lure: "#9b8aa6",
  mend: "#5ad2ff",
  burst: "#ff7ad9",
};

/** 화면에 동시에 나올 수 있는 도깨비 수. 로스터가 넷이라 넷이면 충분하다 */
const SUMMON_SLOTS = DOKEBI_ORDER.length;
/** 능력이 터진 자국이 사라지기까지(초) */
const BURST_FADE_SECONDS = 0.45;
/** 자국이 부풀어 오르는 배율. 1이면 터진 티가 안 난다 */
const BURST_GROWTH = 3.4;
/** 도깨비가 떠 있는 높이(m). 보스 몸통 한가운데쯤이라 부딪히는 그림이 된다 */
const SUMMON_HEIGHT = 1.7;
/** 부른 도깨비 몸통의 반지름(m). 동료보다 작다 — 넷이 붙어 돌아도 서로 가리지 않는다 */
const SUMMON_ORB_RADIUS = 0.42;
/** 몸통을 이루는 면 수. 작은 덩어리라 성기게 잡아도 둥글게 보인다 */
const SUMMON_ORB_SEGMENTS = { width: 12, height: 10 } as const;
/** 궤도 좌표에서 보스 회전을 되돌릴 때 쓰는 축. 매 프레임 만들지 않는다 */
const UP = new THREE.Vector3(0, 1, 0);

export function Boss({ link, frozen, home, reducedMotion, view, met }: BossProps) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const boss = useRef<BossState>(createBoss(home.x, home.z));
  /** 공격 판정을 한 번의 휘두르기에 한 번만 적용하기 위한 표시 */
  const struckThisSwing = useRef(false);

  const summon = useRef<SummonState>(createSummon());
  /** 궤도를 도는 도깨비. 슬롯을 미리 잡아 두고 남는 것은 숨긴다 */
  const orbRefs = useRef<(THREE.Mesh | null)[]>([]);
  /** 능력이 터진 자국. 도깨비마다 하나씩이라 슬롯 수가 같다 */
  const burstRefs = useRef<(THREE.Mesh | null)[]>([]);
  /** 자국이 남은 시간(초). 0이면 꺼져 있다 */
  const burstLife = useRef<number[]>(Array.from({ length: SUMMON_SLOTS }, () => 0));
  /**
   * 지난 프레임의 유인 자리.
   *
   * `stepBoss`가 이 프레임 처음에 도는데 유인 자리는 그 뒤에야 나온다. 한 프레임
   * 늦게 쓰는 것이 순서를 뒤집는 것보다 낫다 — 뒤집으면 보스가 아직 움직이지도
   * 않은 자리를 기준으로 도깨비가 돌아 궤도가 매 프레임 튄다.
   */
  const lureTarget = useRef<{ x: number; z: number } | null>(null);

  const geometry = useMemo(
    () => ({
      body: new THREE.BoxGeometry(BOSS_BODY.bodyWidth, BOSS_BODY.bodyHeight, BOSS_BODY.bodyDepth),
      core: new THREE.SphereGeometry(BOSS_BODY.coreRadius, 10, 8),
      head: new THREE.BoxGeometry(BOSS_BODY.headWidth, BOSS_BODY.headHeight, BOSS_BODY.headDepth),
      arm: new THREE.BoxGeometry(BOSS_BODY.armWidth, BOSS_BODY.armHeight, BOSS_BODY.armDepth),
      ring: new THREE.PlaneGeometry(BOSS.slamRadius * 2, BOSS.slamRadius * 2),
      /* 부른 도깨비 — 동료(`companionBody`)와 같은 둥근 덩어리. 스스로 빛난다 */
      orb: new THREE.SphereGeometry(
        SUMMON_ORB_RADIUS,
        SUMMON_ORB_SEGMENTS.width,
        SUMMON_ORB_SEGMENTS.height,
      ),
      /** 능력이 터진 자국. 바닥이 아니라 터진 자리에 세운다 */
      burst: new THREE.PlaneGeometry(1.6, 1.6),
    }),
    [],
  );

  /*
   * 언마운트 시 지오메트리를 해제한다.
   *
   * R3F는 씬 그래프에 붙인 객체는 정리하지만 **컴포넌트가 직접 만들어 넘긴
   * 것은 건드리지 않는다.** 해제하지 않으면 /play를 드나들 때마다 GPU 버퍼가
   * 쌓인다. City.tsx가 이미 같은 방식으로 정리하고 있다.
   */
  useLayoutEffect(() => {
    const created = Object.values(geometry);
    return () => {
      for (const item of created) item.dispose();
    };
  }, [geometry]);


  const ringTexture = useMemo(() => getLampGlowTexture(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((state, rawDelta) => {
    const root = rootRef.current;
    if (!root) return;

    // 멈춘 동안에는 다가오지도 내려치지도 않는다
    const dt = frozen ? 0 : Math.min(rawDelta, MAX_DELTA_SECONDS);
    const px = link.position.x;
    const pz = link.position.z;

    const before = boss.current;
    /*
     * 유인 도깨비가 나와 있으면 보스는 **그쪽**을 쫓는다.
     *
     * 「연기로 몸을 감춰 로봇이 잘 알아보지 못한다」는 그을음의 설명을 전투로
     * 옮긴 것이다. 플레이어 좌표를 그대로 넘기면 도깨비가 아무리 붙어 있어도
     * 보스는 계속 나만 본다 — 그러면 유인이라는 역할이 화면에 없다.
     */
    const chase = lureTarget.current ?? { x: px, z: pz };
    boss.current = stepBoss(before, chase.x, chase.z, dt);

    /* ---------------- 자리 알리기 ---------------- */
    /*
     * 탄은 로봇 쪽(`Enemies`)에서 굴러간다. 자리를 알리지 않으면 딱총만
     * 대장을 통과한다 — 무기마다 통하는 상대가 다르면 규칙이 아니라 결함이다.
     *
     * 쓰러져 있는 동안에는 맞지 않는다. 근접(`damageBoss`)도 같은 규칙이다.
     */
    projectBossPosition(
      link,
      { x: boss.current.x, z: boss.current.z },
      boss.current.phase !== "down",
    );

    const boltDamage = consumeBossBoltDamage(link);
    if (boltDamage > 0) {
      const shot = damageBoss(boss.current, boltDamage);
      boss.current = shot.state;
      recordBossHit(link, shot.downed);
    }

    /* ---------------- 플레이어의 공격 ---------------- */
    if (link.attackQueued) {
      /*
       * 일반 적과 같은 부채꼴 판정을 쓴다. 보스만 다른 규칙을 두면 "저건
       * 왜 안 맞았지"가 생긴다. 판정 함수는 위치만 받으므로 그대로 넘긴다.
       */
      const target = { x: boss.current.x, z: boss.current.z };
      const weapon = WEAPONS[link.weapon];
      if (!struckThisSwing.current && isInAttackArc(target, px, pz, link.facing, weapon)) {
        // 로봇에게 그렇듯 대장에게도 무기 피해가 그대로 들어간다. 여기만
        // 1로 고정하면 「망치를 들었는데 대장에게는 소용없다」가 된다.
        const hit = damageBoss(boss.current, weapon.damage);
        boss.current = hit.state;
        struckThisSwing.current = true;
        recordBossHit(link, hit.downed);
      }
    } else {
      struckThisSwing.current = false;
    }

    /* ---------------- 부른 도깨비 ---------------- */
    const engaged = boss.current.phase !== "idle" && boss.current.phase !== "down";
    const distance = Math.hypot(boss.current.x - px, boss.current.z - pz);
    /*
     * 키를 따로 두지 않고 **마주치면 나온다.**
     *
     * 트레일러의 도깨비는 불러야 오는 소환수가 아니라 옆에 있다가 같이 뛰어드는
     * 동료다(3.5 「플레이어 주변에서 동행」). 조작을 하나 더 외우게 하는 것보다
     * 이쪽이 그 인상에 맞고, 쿨다운이 있어 남발되지도 않는다.
     */
    if (engaged && canSummon(summon.current, distance, met)) {
      summon.current = requestSummon(summon.current, met);
    }

    const tick = stepSummon(summon.current, dt, {
      x: boss.current.x,
      z: boss.current.z,
      down: boss.current.phase === "down",
    });
    summon.current = tick.state;
    lureTarget.current = tick.lureAt;

    if (tick.heal > 0) link.summonHeal += tick.heal;

    /*
     * 표식은 피해가 아니라 **빈틈**이다. 남은 타격 수를 줄여 더 빨리 비틀거리게
     * 만든다 — 0 아래로 내려가면 경직이 풀리지 않으므로 바닥을 둔다.
     */
    if (tick.markHits > 0 && boss.current.phase !== "down") {
      const floor = staggerHitsWithMark(true);
      boss.current = {
        ...boss.current,
        hitsUntilStagger: Math.max(boss.current.hitsUntilStagger - tick.markHits, floor - 1),
      };
    }

    for (let i = 0; i < tick.damage; i += 1) {
      const hit = damageBoss(boss.current);
      boss.current = hit.state;
      if (hit.downed) {
        recordBossHit(link, true);
        break;
      }
    }

    for (const burst of tick.bursts) {
      const slot = DOKEBI_ORDER.indexOf(burst.id);
      if (slot >= 0) burstLife.current[slot] = BURST_FADE_SECONDS;
    }

    /* ---------------- 충격 ---------------- */
    recordSlamStart(link, before.phase, boss.current.phase);

    if (slamHits(boss.current, px, pz)) {
      // 피해는 전투 쪽이 판정한다. 여기서는 "맞았다"만 알린다.
      link.bossSlamHit = true;
    }

    /* ---------------- 렌더 ---------------- */
    root.position.set(boss.current.x, 0, boss.current.z);
    root.rotation.y = boss.current.facing;

    const isDown = boss.current.phase === "down";
    root.rotation.x = isDown ? Math.PI / 2.6 : 0;
    root.position.y = isDown ? -0.4 : 0;

    if (bodyRef.current) {
      const material = bodyRef.current.material as THREE.MeshLambertMaterial;
      const phase = boss.current.phase;
      color.set(
        isDown
          ? COLOR.down
          : phase === "windup" || phase === "slam"
            ? COLOR.windup
            : phase === "stagger"
              ? COLOR.stagger
              : COLOR.normal,
      );
      material.color.copy(color);
    }

    /*
     * 예고 링 — 내려칠 범위를 바닥에 그린다. 예고 시간 동안 작은 원에서
     * 실제 반경까지 자란다. 다 자라는 순간이 곧 판정이다.
     */
    const ring = ringRef.current;
    if (ring) {
      const windup = boss.current.phase === "windup";
      ring.visible = windup;
      if (windup) {
        const grown = 1 - boss.current.timer / BOSS.windupSeconds;
        const scale = reducedMotion ? 1 : 0.35 + grown * 0.65;
        ring.scale.set(scale, scale, 1);
        const material = ring.material as THREE.MeshBasicMaterial;
        material.opacity = 0.25 + grown * 0.35;
      }
    }

    /*
     * 부른 도깨비와 자국.
     *
     * 좌표를 **월드 기준으로** 잡고 보스 그룹의 회전을 빼서 붙인다. 그냥 자식으로
     * 두면 보스가 도는 대로 궤도가 통째로 돌아, 도깨비가 스스로 도는 것이 아니라
     * 보스에 박힌 장식으로 보인다.
     */
    for (let slot = 0; slot < SUMMON_SLOTS; slot += 1) {
      const orb = orbRefs.current[slot];
      const burst = burstRefs.current[slot];
      const member = summon.current.members.find((item) => item.id === DOKEBI_ORDER[slot]);

      if (orb) {
        orb.visible = member !== undefined;
        if (member) {
          const at = memberPosition(member, boss.current.x, boss.current.z);
          orb.position.set(at.x - boss.current.x, SUMMON_HEIGHT, at.z - boss.current.z);
          orb.position.applyAxisAngle(UP, -boss.current.facing);
          /* 위아래로 떠다닌다. 저감 모션에서는 멈춘다 — 작고 빠른 흔들림이라 */
          if (!reducedMotion) orb.position.y += Math.sin(member.angle * 2) * 0.18;
        }
      }

      const life = Math.max(0, burstLife.current[slot] - dt);
      burstLife.current[slot] = life;
      if (burst) {
        burst.visible = life > 0;
        if (life > 0 && orb) {
          const fade = life / BURST_FADE_SECONDS;
          burst.position.copy(orb.position);
          /*
           * **카메라를 보게 돌린다.**
           *
           * 평면이라 그냥 두면 보스의 방향을 따라 서 있고, 옆에서 보면 두께 없는
           * 선이 되어 사실상 안 보인다 — 처음 확인했을 때 능력은 나가는데 화면에
           * 아무것도 안 터졌다.
           */
          burst.lookAt(state.camera.position);
          const grown = 1 + (1 - fade) * BURST_GROWTH;
          burst.scale.set(grown, grown, 1);
          (burst.material as THREE.MeshBasicMaterial).opacity = fade * 0.9;
        }
      }
    }

    projectBossView(view, boss.current, px, pz);
  });

  return (
    <group ref={rootRef} position={[home.x, terrainHeight(home.x, home.z), home.z]}>
      <mesh ref={bodyRef} geometry={geometry.body} position={[0, 1.6, 0]} castShadow>
        <ToonMaterial color={COLOR.normal} />
      </mesh>
      {/*
        가슴의 점 — 일반 로봇과 **같은 조형**이다(`enemyBody.coreRadius`).
        대장만 없으면 「저 안에 갇혀 있다」는 규칙이 대장에게는 해당되지 않는
        것으로 읽힌다. 몸이 큰 만큼 점도 크다.
      */}
      <mesh geometry={geometry.core} position={[0, 1.9, BOSS_BODY.bodyDepth / 2]}>
        <meshBasicMaterial color={BOSS_CORE_COLOR} toneMapped={false} />
      </mesh>
      <mesh geometry={geometry.head} position={[0, 3, 0]} castShadow>
        <ToonMaterial color="#6f6a7d" />
      </mesh>
      <mesh geometry={geometry.arm} position={[1.2, 1.7, 0]} castShadow>
        <ToonMaterial color="#5f6a76" />
      </mesh>
      <mesh geometry={geometry.arm} position={[-1.2, 1.7, 0]} castShadow>
        <ToonMaterial color="#5f6a76" />
      </mesh>

      {/* 예고 링 — 가산 합성이라 깊이 기록을 끈다 (가로등 빛 웅덩이와 같은 이유) */}
      <mesh ref={ringRef} geometry={geometry.ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} visible={false}>
        <meshBasicMaterial
          map={ringTexture}
          color="#ff6b4a"
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/*
        부른 도깨비와 능력 자국.
        슬롯을 미리 잡아 두고 안 쓰는 것은 숨긴다 — 소환할 때마다 메시를 만들면
        보스전 한복판에서 지오메트리를 올리게 되고, 그 순간이 곧 프레임 끊김이다.
      */}
      {DOKEBI_ORDER.map((id, slot) => {
        const color = SUMMON_COLOR[roleForDokebi(id)];
        return (
          <group key={id}>
            <mesh
              ref={(mesh) => {
                orbRefs.current[slot] = mesh;
              }}
              geometry={geometry.orb}
              visible={false}
            >
              {/* 스스로 빛나는 존재다 — 조명을 받으면 그냥 떠다니는 공이 된다 */}
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            <mesh
              ref={(mesh) => {
                burstRefs.current[slot] = mesh;
              }}
              geometry={geometry.burst}
              visible={false}
            >
              <meshBasicMaterial
                map={ringTexture}
                color={color}
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
