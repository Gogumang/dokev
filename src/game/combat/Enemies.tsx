"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 * 적과 파티클은 useFrame 안에서 InstancedMesh 행렬을 직접 갱신한다.
 * 수십 개를 setState로 옮기면 초당 60회 리렌더가 발생한다.
 */
/* eslint-disable react-hooks/immutability */

/**
 * 장난감 로봇 적 — 렌더와 파티클.
 *
 * 몸통·머리·팔을 각각 InstancedMesh로 묶는다. 적 24기를 개별 Mesh로 두면
 * 드로우콜이 72개가 되지만, 이렇게 묶으면 3개로 끝난다.
 *
 * 피격 파티클은 색종이다 (TRAILER 3.4: 잔인하지 않고 유쾌하게). 고정 크기 풀을
 * 미리 만들어 두고 돌려 쓴다 — 맞을 때마다 지오메트리를 만들면 GC가 프레임을 먹는다.
 */

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  COMBAT_TUNING,
  createAttackState,
  isAttackActive,
  createEnemies,
  markFired,
  readyToFire,
  stepAttack,
  stepEnemy,
  stepEnemyStrike,
  strikeEnemy,
  strikeWindupProgress,
  type AttackState,
  type EnemyState,
} from "@/game/combat/combatSim";
import {
  createPlayerCombat,
  stepPlayerCombat,
  type PlayerCombatState,
} from "@/game/combat/playerCombat";
import {
  consumeAttack,
  consumeCompanionStrikes,
  consumeSlam,
  consumeSummonHeal,
  projectAttackTiming,
  projectPlayerVitals,
  recordEnemyHits,
} from "@/game/combat/combatLink";
import {
  fireProjectile,
  fireWeaponBolt,
  PLAYER_BOLT_MAX,
  PROJECTILE,
  stepPlayerBolts,
  stepProjectiles,
  type BoltTarget,
  type PlayerBolt,
  type Projectile,
} from "@/game/combat/projectiles";
import { ENEMY_BODY } from "@/game/combat/enemyBody";
import { trailInstanceCount } from "@/game/combat/arrowTrail";
import { paintArrowTrails, paintPlayerBolts } from "@/game/combat/arrowTrailPaint";
import {
  createEmbers,
  EMBER,
  releaseEmber,
  stepEmbers,
  type Ember,
} from "@/game/combat/emberRelease";
import {
  burstConfetti,
  CONFETTI,
  createConfetti,
  paintConfetti,
  paintEmbers,
  type Particle,
} from "@/game/combat/vfxPaint";
import { WEAPONS, type WeaponId } from "@/game/combat/weapons";
import { recordCompanionHits } from "@/game/combat/companionHits";
import { createSeededRandom } from "@/game/core/mathx";
import type { CombatCues } from "@/game/systems/audio/combat";
import { projectEnemyBlips } from "@/game/systems/minimap";
import type { QualityPreset } from "@/game/systems/quality";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import { terrainHeight } from "@/game/world/terrain";

/** 적이 읽는 플레이어 상태와 공격 입력. GameScene이 매 프레임 채운다 */
export interface CombatLink {
  position: { x: number; y: number; z: number };
  facing: number;
  /** 이번 프레임에 공격이 눌렸는지. 읽는 쪽이 소비한다 */
  attackQueued: boolean;
  /**
   * 지금 들고 있는 무기. 입력이 돌리고 전투·보스·캐릭터가 읽는다.
   *
   * id만 넘긴다 — 수치 묶음을 통째로 들고 다니면 어느 쪽이 정본인지
   * 흐려진다. 표(`WEAPONS`)를 보는 것은 쓰는 쪽의 일이다.
   */
  weapon: WeaponId;
  /** 지금까지 쓰러뜨린 로봇 누적 수. 퀘스트가 읽는다 */
  defeatedTotal: number;
  /** 대장을 눕힌 횟수. 마무리 연출이 늘어난 만큼 발동한다 (`bossSim`) */
  bossDowns: number;
  /**
   * 시뮬레이션 시간 배율. **리그가 쓰고 전투·대장·캐릭터가 읽는다.**
   *
   * 0이면 멈춤(포토 모드), 1이 평소, 그 사이가 슬로우 모션이다. 세 컴포넌트가
   * 각자 `frozen` 불리언을 받던 것을 이 값 하나로 합쳤다 — 「멈춤」과 「느림」을
   * 다른 통로로 두면 둘이 겹칠 때 어느 쪽이 이기는지 아무도 모르고, 새 연출을
   * 더할 때마다 프롭이 하나씩 는다.
   */
  timeScale: number;
  /** 플레이어 체력 0~maxHp. HUD가 읽는다 */
  playerHp: number;
  /** 쓰러져 있는지 */
  playerDowned: boolean;
  /**
   * 부활 요청. 씬이 위치를 스폰 지점으로 되돌린 뒤 false로 되돌린다.
   * 전투 쪽은 위치를 모르므로 신호만 남긴다.
   */
  respawnRequested: boolean;
  /** 동료 능력이 낮춘 적 인지 반경 배율. 동료가 매 프레임 쓴다 */
  abilityAggroScale: number;
  /** 동료 능력이 올린 회복 속도 배율 */
  abilityRegenScale: number;
  /**
   * 보스의 충격에 맞았는지. 보스가 세우고 전투가 소비한다.
   *
   * 피해 판정을 한 곳(여기)에 모아 두어야 무적 시간이 한 번만 적용된다 —
   * 보스가 따로 체력을 깎으면 근접 피해와 겹쳐 두 번 깎인다.
   */
  bossSlamHit: boolean;
  /** 부른 도깨비가 쌓아 둔 회복량. 보스가 더하고 여기서 비운다 */
  summonHeal: number;
  /**
   * 대장의 자리와 맞을 수 있는지. **보스가 매 프레임 쓰고 탄이 읽는다.**
   *
   * 탄은 로봇 쪽(`Enemies`)에 있고 대장은 다른 컴포넌트에 있다. 자리를
   * 흘려보내지 않으면 탄이 대장만 통과한다 — 「로봇에게는 통하는데 대장에게는
   * 안 통한다」가 되고, 그건 규칙이 아니라 버그로 읽힌다.
   */
  bossX: number;
  bossZ: number;
  bossHittable: boolean;
  bossBoltDamage: number;
  summonAtBoss: boolean;
  /** 미니 보스를 쓰러뜨린 적이 있는지. 퀘스트가 읽는다 */
  bossDefeated: boolean;
  /** 전투 사건 누적 수. 사운드가 읽는다 */
  cues: CombatCues;
  /** 휘두르기 경과 시간(초). 쉬고 있으면 null. 캐릭터 자세가 읽는다 */
  attackElapsed: number | null;
  /**
   * 지도에 찍을 적 좌표(x, z 쌍). 이 컴포넌트가 매 프레임 채운다.
   *
   * 적 상태는 여기 안에만 있어 HUD가 볼 수 없다. 상태 전체를 넘기는 대신
   * 좌표만 미리 잡아 둔 버퍼로 흘려보낸다.
   */
  enemyBlips: Float32Array;
  enemyBlipCount: number;
  /**
   * 동료가 이번 프레임에 친 자리(x, z 쌍). **여기서 읽고 비운다.**
   *
   * 동료 넷이 링 하나를 나눠 쓰므로 쌓아 두는 방식이다 — 안 비우면 한 번
   * 친 것이 매 프레임 다시 들어가 초당 예순 번 때린다.
   */
  companionStrikes: Float32Array;
  companionStrikeCount: number;
}

export interface EnemiesProps {
  link: CombatLink;
  /**
   * 시간을 멈출지 (포토 모드).
   *
   * 포토 모드는 **플레이어 이동만** 멈추고 있었다 — 움직일 수도 피할 수도
   * 없는 채로 로봇에게 맞는다. 사진 한 장 고르는 동안 체력이 5에서 1이
   * 됐다. 선택 필드로 두지 않는다: 새 호출부가 빠뜨리면 조용히 예전으로
   * 돌아간다.
   */
  halfExtent: number;
  /** 그 자리가 벽인지. 로봇이 건물 안에서 생기지 않게 한다 */
  isBlocked: (x: number, z: number) => boolean;
  /**
   * 플레이어가 시작하는 자리. 이 주변에는 로봇을 두지 않는다.
   *
   * 선택 필드로 두지 않는다 — 빠뜨리면 시작 광장에 로봇이 서고, 그건
   * 화면을 봐야만 아는 종류의 회귀다.
   */
  spawn: { x: number; z: number };
  quality: QualityPreset;
  reducedMotion: boolean;
  /**
   * 여정이 아직 **조용한 구간**인지 (`quest/questContent.ts`의 `isCalmStep`).
   *
   * 목표가 걷기인데 로봇이 사방에서 달려오면 고조될 자리가 없다. 로봇을
   * 없애지는 않는다 — 멀리서 서성이는 것이 보여야 「곧 싸우겠구나」가 된다.
   */
  calm: boolean;
}

/**
 * 대장의 명중 판정 반경(m).
 *
 * 몸이 크므로 로봇보다 후하게 준다. 내려침 사거리(4.6m)보다는 **훨씬 작게**
 * 둔다 — 판정이 사거리만큼 넓으면 대장이 팔을 들기도 전에 탄이 맞는 자리가
 * 겹쳐, 「닿지도 않았는데 맞았다」로 보인다.
 */
const BOSS_HIT_RADIUS = 1.9;

/** 품질별 적 수. 저사양에서 24기가 추격하면 프레임이 무너진다 */
const ENEMY_COUNT_BY_QUALITY = { low: 8, medium: 16, high: 24 } as const;

/** 파티클 풀 크기. 한 번 맞을 때 14개를 쓰므로 동시 타격 몇 번은 견딘다 */
/**
 * 조용한 구간의 인지 반경 배율.
 *
 * 0으로 두면 코앞에서도 반응하지 않아 **인형**으로 보인다. 0.3이면 16m가
 * 4.8m로 줄어 — 일부러 다가가면 붙지만, 지나가는 길에는 걸리지 않는다.
 */
const CALM_AGGRO_SCALE = 0.3;

const DOWN_COLOR = "#6f6a7d";
const ALIVE_COLOR = "#b9c0c8";

/**
 * 날아오는 탄의 색.
 *
 * 주황(#ff8a3d)이었는데 **노을 하늘(#f0a06a)과 색거리가 52**밖에 되지 않았다.
 * 노을은 기본 시간대다 — 기본 상태에서 원거리 공격이 하늘에 묻혔다.
 * 피할 수 없는 공격은 어려운 것이 아니라 고장 난 것이다.
 *
 * 붉은 자홍으로 옮겼다. 네 시간대 하늘과 모두 멀고, 아군(도깨비 넷·후드 넷)
 * 어느 색과도 겹치지 않으면서 위험 신호로 읽힌다.
 */
const BOLT_COLOR = "#ff2f6a";
/**
 * 로봇 가슴에 박힌 점의 색.
 *
 * 몸(회색)·사수 표시(주황)·피격 섬광 어느 것과도 겹치지 않는 **살아 있는 색**
 * 이어야 한다. 이 점 하나가 「저 안에 무언가 갇혀 있다」를 말한다.
 */
const CORE_COLOR = "#7cf5c4";
/** 사수는 몸통 색으로 구분한다 — 멀리서도 "저건 쏜다"를 알아야 피할 수 있다 */
const GUNNER_COLOR = "#c98a3a";
/**
 * 때리기 직전에 달아오르는 색.
 *
 * 피격 섬광(FLASH_COLOR)과 달라야 한다 — 같으면 "맞았다"와 "때린다"가
 * 화면에서 구분되지 않는다.
 */
const TELEGRAPH_COLOR = "#ff8a3d";
const FLASH_COLOR = "#ff4d5a";

export function Enemies({
  link,
  halfExtent,
  isBlocked,
  spawn,
  quality,
  reducedMotion,
  calm,
}: EnemiesProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const confettiRef = useRef<THREE.InstancedMesh>(null);
  const boltRef = useRef<THREE.InstancedMesh>(null);
  /** 내가 쏜 탄. 적 탄과 색을 갈라야 어느 것을 피해야 하는지 한눈에 보인다 */
  const playerBoltRef = useRef<THREE.InstancedMesh>(null);
  const trailRef = useRef<THREE.InstancedMesh>(null);
  /** 로봇 가슴의 점과, 쓰러질 때 빠져나간 빛 */
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const emberRef = useRef<THREE.InstancedMesh>(null);

  const count = ENEMY_COUNT_BY_QUALITY[quality.level];

  /* 스폰 반경은 전투 수치다. 컴포넌트가 숫자를 들면 인지 반경과 어긋난다 */
  const reserved = useMemo(
    () => ({ x: spawn.x, z: spawn.z, radius: COMBAT_TUNING.spawnClearanceRadius }),
    [spawn.x, spawn.z],
  );

  const enemies = useRef<EnemyState[]>(
    createEnemies(count, halfExtent, undefined, isBlocked, reserved),
  );
  const attack = useRef<AttackState>(createAttackState());
  const playerCombat = useRef<PlayerCombatState>(createPlayerCombat());
  const projectiles = useRef<Projectile[]>([]);
  /** 플레이어가 쏜 탄. 적 탄과 목록을 나눈다 — 맞히는 대상이 반대다 */
  const playerBolts = useRef<PlayerBolt[]>([]);
  const embers = useRef<Ember[]>(createEmbers());
  /**
   * 지난 프레임의 공격 단계.
   *
   * 원거리는 **판정이 켜지는 순간 한 발**만 나가야 한다. 「판정이 살아 있으면
   * 쏜다」로 두면 0.05초 동안 프레임 수만큼 쏟아진다.
   */
  /** 지난 프레임에 판정이 살아 있었는지. 켜지는 **그 프레임**에만 한 발 나간다 */
  const wasActive = useRef(false);
  /** 표적 목록을 매 프레임 새로 만들지 않는다 — 초당 60번 배열을 버리게 된다 */
  const boltTargets = useRef<BoltTarget[]>([]);

  /*
   * 품질이 바뀌면 적 수가 달라지므로 다시 만든다.
   *
   * 렌더 중에 ref를 비교해 갈아끼우면 React가 렌더를 순수하다고 가정할 수 없다.
   * 효과에서 처리하면 한 프레임 늦게 반영되지만, 품질 강등은 초 단위로 일어나는
   * 일이라 그 지연은 보이지 않는다.
   */
  useEffect(() => {
    enemies.current = createEnemies(count, halfExtent, undefined, isBlocked, reserved);
    attack.current = createAttackState();
    // 남은 탄을 지운다. 쏜 적이 사라졌는데 탄만 날아오면 출처를 알 수 없다.
    projectiles.current = [];
    playerBolts.current = [];
  }, [count, halfExtent, isBlocked, reserved]);

  const particles = useRef<Particle[]>(createConfetti());
  const particleCursor = useRef(0);
  const particleRandom = useMemo(() => createSeededRandom(0x9e37), []);

  /** 표식 수집용 임시 배열. 매 프레임 새로 만들지 않는다 */
  const aliveScratch = useMemo<EnemyState[]>(() => [], []);

  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      scale: new THREE.Vector3(),
      color: new THREE.Color(),
      flash: new THREE.Color(FLASH_COLOR),
      telegraph: new THREE.Color(TELEGRAPH_COLOR),
    }),
    [],
  );

  const geometry = useMemo(
    () => ({
      body: new THREE.BoxGeometry(
        ENEMY_BODY.bodyWidth,
        ENEMY_BODY.bodyHeight,
        ENEMY_BODY.bodyDepth,
      ),
      head: new THREE.BoxGeometry(
        ENEMY_BODY.headWidth,
        ENEMY_BODY.headHeight,
        ENEMY_BODY.headDepth,
      ),
      arm: new THREE.BoxGeometry(ENEMY_BODY.armWidth, ENEMY_BODY.armHeight, ENEMY_BODY.armDepth),
      confetti: new THREE.PlaneGeometry(ENEMY_BODY.confettiSize, ENEMY_BODY.confettiSize),
      // 8면체는 구보다 훨씬 싸고, 이 크기에서는 구분되지 않는다.
      bolt: new THREE.OctahedronGeometry(ENEMY_BODY.boltRadius, 0),
      core: new THREE.SphereGeometry(ENEMY_BODY.coreRadius, 8, 6),
      trail: new THREE.OctahedronGeometry(ENEMY_BODY.boltRadius, 0),
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

  const burst = (x: number, y: number, z: number) => {
    particleCursor.current = burstConfetti(
      particles.current,
      particleCursor.current,
      x,
      y,
      z,
      particleRandom,
    );
  };

  useFrame((_, rawDelta) => {
    // 멈춘 동안에는 로봇도 탄도 움직이지 않으므로 새 피격이 생기지 않는다
    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS) * link.timeScale;
    const px = link.position.x;
    const pz = link.position.z;

    /* ---------------- 공격 ---------------- */
    /*
     * 무기를 매 프레임 표에서 읽는다. 휘두르는 중에 바꿔도 **이번 휘두르기가
     * 끝날 때까지는 처음 무기로 끝나야** 하지 않나 싶지만, 단계 길이가 이미
     * 타이머에 들어가 있어 남은 시간은 그대로 흐른다 — 바뀌는 것은 다음
     * 휘두르기부터다.
     */
    const weapon = WEAPONS[link.weapon];
    const requested = consumeAttack(link);
    attack.current = stepAttack(attack.current, requested, dt, weapon);
    projectAttackTiming(link, attack.current, weapon);

    /* ---------------- 플레이어의 탄 ---------------- */
    /*
     * 판정이 **켜지는 프레임에** 한 발 나간다. 「판정이 살아 있으면 쏜다」로
     * 두면 판정이 살아 있는 동안 프레임 수만큼 쏟아져 기관총이 된다.
     */
    const nowActive = isAttackActive(attack.current);
    if (nowActive && !wasActive.current) {
      playerBolts.current = fireWeaponBolt(
        playerBolts.current,
        px,
        pz,
        link.facing,
        weapon.bolt,
        weapon.damage,
      );
      // 쏘는 소리도 때린 것으로 센다 — 아무 소리 없이 나가면 눌렸는지 알 수 없다
      link.cues.hits += 1;
    }
    wasActive.current = nowActive;

    /* ---------------- 적 ---------------- */
    enemies.current = enemies.current.map((enemy) =>
      // 이동을 먼저 끝낸 뒤 그 자리에서 공격 단계를 진행한다 — 순서가 반대면
      // 한 프레임 전 위치로 사거리를 재게 된다.
      stepEnemyStrike(
        stepEnemy(
          enemy,
          px,
          pz,
          dt,
          // 조용한 구간에는 훨씬 늦게 알아본다. 지나가도 대개 그대로 서 있다
          link.abilityAggroScale * (calm ? CALM_AGGRO_SCALE : 1),
          isBlocked,
        ),
        px,
        pz,
        dt,
      ),
    );

    /* ---------------- 사수 발사 ---------------- */
    let bolts = projectiles.current;
    enemies.current = enemies.current.map((enemy) => {
      // 조용한 구간에는 쏘지 않는다. 걷는 중에 등 뒤에서 날아오면 그건 조용함이 아니다
      if (calm || !readyToFire(enemy, px, pz, isBlocked)) return enemy;
      bolts = fireProjectile(bolts, enemy.x, enemy.z, px, pz);
      return markFired(enemy);
    });

    const flight = stepProjectiles(bolts, dt, px, link.position.y, pz, isBlocked);
    projectiles.current = flight.projectiles;

    /* ---------------- 내 탄이 무엇을 맞혔나 ---------------- */
    if (playerBolts.current.length > 0) {
      /*
       * 표적 목록: 로봇들 뒤에 **대장 한 자리**를 덧붙인다. 인덱스가 그대로
       * 돌아오므로 적 수를 넘는 인덱스는 대장이다 — 판정을 두 번 돌리지
       * 않아도 되고, 규칙(가장 가까운 하나만 맞는다)도 한 벌로 지켜진다.
       */
      const targets = boltTargets.current;
      targets.length = 0;
      for (const enemy of enemies.current) {
        // 쓰러진 로봇은 표적이 아니다 — 누운 것을 쏘면 탄만 사라진다
        if (enemy.mood === "down") targets.push({ x: enemy.x, z: enemy.z, radius: -1 });
        else targets.push({ x: enemy.x, z: enemy.z, radius: ENEMY_BODY.bodyWidth });
      }
      const bossIndex = targets.length;
      if (link.bossHittable)
        targets.push({ x: link.bossX, z: link.bossZ, radius: BOSS_HIT_RADIUS });

      const shots = stepPlayerBolts(playerBolts.current, dt, targets, isBlocked);
      playerBolts.current = shots.bolts;

      const boltStruck: EnemyState[] = [];
      for (const hit of shots.hits) {
        if (hit.target === bossIndex) {
          // 대장의 체력은 보스가 들고 있다. 여기서는 피해만 넘긴다.
          link.bossBoltDamage += hit.damage;
          if (!reducedMotion) burst(hit.x, 1.4, hit.z);
          continue;
        }
        const enemy = enemies.current[hit.target];
        if (!enemy) continue;
        const next = strikeEnemy(enemy, hit.damage, hit.x, hit.z, weapon.knockbackScale);
        enemies.current[hit.target] = next;
        boltStruck.push(next);
        if (!reducedMotion) burst(hit.x, 0.9, hit.z);
        if (next.mood === "down") releaseEmber(embers.current, next.x, next.z);
      }
      recordEnemyHits(link, boltStruck);
    }

    /* ---------------- 동료의 타격 ---------------- */
    const companion = recordCompanionHits(
      link,
      consumeCompanionStrikes(link),
      enemies.current,
      BOSS_HIT_RADIUS,
    );
    for (const enemy of companion.struck) {
      if (!reducedMotion) burst(enemy.x, 0.9, enemy.z);
      if (enemy.mood === "down") releaseEmber(embers.current, enemy.x, enemy.z);
    }
    recordEnemyHits(link, companion.struck);
    // 대장은 몸이 커서 중심에서 터뜨리면 안에 묻힌다 — 어깨 높이에 둔다
    if (companion.bossDamage > 0 && !reducedMotion) burst(link.bossX, 1.8, link.bossZ);

    // 보스의 충격도 원거리 피해와 같은 통로로 넣는다. 무적 시간이 한 번만 걸린다.
    const slam = consumeSlam(link) ? 1 : 0;

    /* ---------------- 플레이어 피격 ---------------- */
    const combat = stepPlayerCombat(
      playerCombat.current,
      enemies.current,
      px,
      pz,
      dt,
      flight.hits + slam,
      link.abilityRegenScale,
      consumeSummonHeal(link),
    );
    playerCombat.current = combat.state;
    projectPlayerVitals(link, combat.state);
    if (combat.struck) link.cues.hurts += 1;
    if (combat.respawned) link.respawnRequested = true;

    const body = bodyRef.current;
    const head = headRef.current;
    const arm = armRef.current;
    const core = coreRef.current;
    if (body && head && arm && core) {
      enemies.current.forEach((enemy, index) => {
        // 쓰러진 적은 옆으로 눕히고 낮춘다. 사라지게 하면 다시 나타날 때 튄다.
        const isDown = enemy.mood === "down";
        const bob = enemy.mood === "chase" ? Math.abs(Math.sin(enemy.bobPhase)) * 0.07 : 0;
        const tilt = isDown ? Math.PI / 2.2 : 0;

        scratch.euler.set(tilt, enemy.facing, 0, "YXZ");
        scratch.quaternion.setFromEuler(scratch.euler);
        scratch.scale.set(1, 1, 1);

        // 언덕에서도 발이 땅에 붙어 있어야 한다
        const ground = terrainHeight(enemy.x, enemy.z);
        scratch.position.set(enemy.x, ground + (isDown ? 0.3 : 0.72) + bob, enemy.z);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        body.setMatrixAt(index, scratch.matrix);

        scratch.position.set(enemy.x, ground + (isDown ? 0.55 : 1.3) + bob, enemy.z);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        head.setMatrixAt(index, scratch.matrix);

        /*
         * 가슴의 점 — 몸통 **앞면**에 박혀 있다. 몸 안에 두면 회색 상자에
         * 가려 아무 데서도 안 보이고, 그러면 있으나 마나다.
         *
         * 쓰러진 로봇에서도 계속 보인다. 빠져나간 빛(`emberRelease`)은 그
         * 순간에 한 번 뜨는 것이고, 이 점은 「무엇이 들어 있(었)는가」다.
         */
        const coreForward = ENEMY_BODY.bodyDepth * 0.5;
        scratch.position.set(
          enemy.x + Math.sin(enemy.facing) * coreForward,
          ground + (isDown ? 0.42 : 0.86) + bob,
          enemy.z + Math.cos(enemy.facing) * coreForward,
        );
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        core.setMatrixAt(index, scratch.matrix);

        // 팔은 한 덩어리로 묶어 몸통 옆에 붙인다. 개별 관절은 이 거리에서 안 보인다.
        scratch.position.set(enemy.x, ground + (isDown ? 0.32 : 0.75) + bob, enemy.z);
        scratch.scale.set(2.4, 1, 1);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        arm.setMatrixAt(index, scratch.matrix);

        // 맞은 직후에는 빨갛게 물든다.
        const flash = enemy.mood === "hit" ? enemy.timer / COMBAT_TUNING.hitStunSeconds : 0;
        const base = isDown ? DOWN_COLOR : enemy.kind === "gunner" ? GUNNER_COLOR : ALIVE_COLOR;
        scratch.color.set(base).lerp(scratch.flash, flash);
        /*
         * 때리기 직전에는 경고색으로 달아오른다.
         *
         * 이게 없으면 피해가 예고 없이 들어온다 — 상태기를 넣어도 화면에
         * 안 보이면 플레이어에게는 예전과 똑같다.
         */
        const windup = strikeWindupProgress(enemy);
        if (windup !== null && !isDown) scratch.color.lerp(scratch.telegraph, windup);
        body.setColorAt(index, scratch.color);
      });

      body.instanceMatrix.needsUpdate = true;
      head.instanceMatrix.needsUpdate = true;
      arm.instanceMatrix.needsUpdate = true;
      core.instanceMatrix.needsUpdate = true;
      core.computeBoundingSphere();
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      body.computeBoundingSphere();
      head.computeBoundingSphere();
      arm.computeBoundingSphere();
    }

    /* ---------------- 지도 표식 ---------------- */
    // 쓰러진 적은 빼고 살아 있는 것만 넘긴다 — 위협이 아닌 점이 섞이면 지도가 거짓말을 한다.
    aliveScratch.length = 0;
    for (const enemy of enemies.current) {
      if (enemy.mood !== "down") aliveScratch.push(enemy);
    }
    projectEnemyBlips(link, aliveScratch, px, pz);

    /* ---------------- 탄 ---------------- */
    const boltMesh = boltRef.current;
    if (boltMesh) {
      for (let i = 0; i < PROJECTILE.maxLive; i += 1) {
        const bolt = projectiles.current[i];
        if (bolt) {
          scratch.position.set(bolt.x, bolt.y, bolt.z);
          // 진행 방향으로 눕혀 회전시킨다. 구르는 덩어리가 아니라 날아가는
          // 물체로 읽혀야 한다.
          scratch.euler.set(bolt.life * 9, Math.atan2(bolt.vx, bolt.vz), 0, "YXZ");
          scratch.quaternion.setFromEuler(scratch.euler);
          scratch.scale.set(0.7, 0.7, 1.5);
        } else {
          scratch.position.set(0, -999, 0);
          scratch.quaternion.identity();
          scratch.scale.set(0, 0, 0);
        }
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        boltMesh.setMatrixAt(i, scratch.matrix);
      }
      boltMesh.instanceMatrix.needsUpdate = true;
      boltMesh.computeBoundingSphere();
    }

    paintArrowTrails(trailRef.current, playerBolts.current, scratch, reducedMotion);

    paintPlayerBolts(playerBoltRef.current, playerBolts.current, scratch, reducedMotion);

    /* ---------------- 빠져나간 빛 ---------------- */
    stepEmbers(embers.current, dt);
    paintEmbers(emberRef.current, embers.current, scratch);

    /* ---------------- 색종이 ---------------- */
    paintConfetti(confettiRef.current, particles.current, scratch, dt);
  });

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[geometry.body, undefined, count]} castShadow>
        <ToonMaterial color={ALIVE_COLOR} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[geometry.head, undefined, count]} castShadow>
        <ToonMaterial color="#8f9aa6" />
      </instancedMesh>
      <instancedMesh ref={armRef} args={[geometry.arm, undefined, count]}>
        <ToonMaterial color="#5f6a76" />
      </instancedMesh>
      <instancedMesh ref={boltRef} args={[geometry.bolt, undefined, PROJECTILE.maxLive]}>
        <meshBasicMaterial color={BOLT_COLOR} toneMapped={false} />
      </instancedMesh>
      {/*
        내 탄. 색은 인스턴스마다 다르다(`paintPlayerBolts`) — 화살은 무지개를
        타고, 그 밖의 탄만 제 색을 쓴다. 재질 색을 두면 그 위에 곱해져
        무지개가 물드므로 **흰색으로 비워 둔다.**
      */}
      <instancedMesh ref={playerBoltRef} args={[geometry.bolt, undefined, PLAYER_BOLT_MAX]}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {/* 화살 자국 — 스스로 빛나고, 깊이를 안 적는다(마디끼리 겹칠 때 깜빡인다) */}
      <instancedMesh
        ref={trailRef}
        args={[geometry.trail, undefined, trailInstanceCount(PLAYER_BOLT_MAX)]}
      >
        <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {/*
        가슴의 점. 로봇이 서 있는 동안 늘 보이고, 쓰러지면 아래 빛으로 빠져나간다.
      */}
      <instancedMesh ref={coreRef} args={[geometry.core, undefined, count]}>
        <meshBasicMaterial color={CORE_COLOR} toneMapped={false} />
      </instancedMesh>
      {/*
        빠져나간 빛 — 곧게 떠오르며 잦아든다. 색종이와 움직임이 다르다.
        가슴의 점과 **같은 색**이라 「저 안에 있던 것이 나왔다」로 읽힌다.
      */}
      <instancedMesh ref={emberRef} args={[geometry.core, undefined, EMBER.poolSize]}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
      </instancedMesh>
      {/* 색종이 — 조각마다 제 색을 쥔다(`paintConfetti`) */}
      <instancedMesh ref={confettiRef} args={[geometry.confetti, undefined, CONFETTI.poolSize]}>
        <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} transparent />
      </instancedMesh>
    </group>
  );
}
