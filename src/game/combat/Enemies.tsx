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

import { COMBAT_TUNING, createAttackState, createEnemies, markFired, readyToFire, resolveHits, stepAttack, stepEnemy, stepEnemyStrike, strikeEnemy, strikeWindupProgress, type AttackState, type EnemyState } from "@/game/combat/combatSim";
import { createPlayerCombat, stepPlayerCombat, type PlayerCombatState } from "@/game/combat/playerCombat";
import { consumeAttack, consumeSlam, consumeSummonHeal, projectAttackTiming, projectPlayerVitals, recordEnemyHits } from "@/game/combat/combatLink";
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
import { WEAPONS, type WeaponId } from "@/game/combat/weapons";
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
   * 흘려보내지 않으면 딱총이 대장만 통과한다 — 「망치는 대장에게 통하는데
   * 딱총은 안 통한다」가 되고, 그건 규칙이 아니라 버그로 읽힌다.
   */
  bossX: number;
  bossZ: number;
  bossHittable: boolean;
  /** 탄이 대장에게 넣은 피해. 탄이 쌓고 보스가 비운다 */
  bossBoltDamage: number;
  /** 미니 보스를 쓰러뜨린 적이 있는지. 퀘스트가 읽는다 */
  bossDefeated: boolean;
  /** 전투 사건 누적 수. 사운드가 읽는다 */
  cues: CombatCues;
  /** 휘두르기 경과 시간(초). 쉬고 있으면 null. 캐릭터 자세가 읽는다 */
  attackElapsed: number | null;
  /**
   * 미니맵에 찍을 적 좌표(x, z 쌍). 이 컴포넌트가 매 프레임 채운다.
   *
   * 적 상태는 여기 안에만 있어 HUD가 볼 수 없다. 상태 전체를 넘기는 대신
   * 좌표만 미리 잡아 둔 버퍼로 흘려보낸다.
   */
  enemyBlips: Float32Array;
  enemyBlipCount: number;
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
  frozen: boolean;
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
const PARTICLE_POOL = 96;
const PARTICLES_PER_HIT = 14;
const PARTICLE_LIFE_SECONDS = 0.9;
const PARTICLE_GRAVITY = 14;

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
 * 내가 쏜 탄의 색.
 *
 * 적 탄(붉은색)과 **반대편 색**으로 잡는다. 날아다니는 것이 둘인데
 * 색이 비슷하면 무엇을 피해야 하는지 순간적으로 판단할 수 없다.
 */
const PLAYER_BOLT_COLOR = "#5ce1ff";
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

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  spin: number;
}

export function Enemies({
  link,
  frozen,
  halfExtent,
  isBlocked,
  spawn,
  quality,
  reducedMotion,
}: EnemiesProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const confettiRef = useRef<THREE.InstancedMesh>(null);
  const boltRef = useRef<THREE.InstancedMesh>(null);
  /** 내가 쏜 탄. 적 탄과 색을 갈라야 어느 것을 피해야 하는지 한눈에 보인다 */
  const playerBoltRef = useRef<THREE.InstancedMesh>(null);

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
  /**
   * 지난 프레임의 공격 단계.
   *
   * 원거리는 **판정이 켜지는 순간 한 발**만 나가야 한다. 「판정이 살아 있으면
   * 쏜다」로 두면 0.05초 동안 프레임 수만큼 쏟아진다.
   */
  const lastPhase = useRef<AttackState["phase"]>("ready");
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

  const particles = useRef<Particle[]>(
    Array.from({ length: PARTICLE_POOL }, () => ({
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      spin: 0,
    })),
  );
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
      body: new THREE.BoxGeometry(ENEMY_BODY.bodyWidth, ENEMY_BODY.bodyHeight, ENEMY_BODY.bodyDepth),
      head: new THREE.BoxGeometry(ENEMY_BODY.headWidth, ENEMY_BODY.headHeight, ENEMY_BODY.headDepth),
      arm: new THREE.BoxGeometry(ENEMY_BODY.armWidth, ENEMY_BODY.armHeight, ENEMY_BODY.armDepth),
      confetti: new THREE.PlaneGeometry(ENEMY_BODY.confettiSize, ENEMY_BODY.confettiSize),
      // 8면체는 구보다 훨씬 싸고, 이 크기에서는 구분되지 않는다.
      bolt: new THREE.OctahedronGeometry(ENEMY_BODY.boltRadius, 0),
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
    for (let i = 0; i < PARTICLES_PER_HIT; i += 1) {
      const particle = particles.current[particleCursor.current];
      particleCursor.current = (particleCursor.current + 1) % PARTICLE_POOL;

      const angle = particleRandom() * Math.PI * 2;
      const speed = 2.5 + particleRandom() * 4;
      particle.x = x;
      particle.y = y;
      particle.z = z;
      particle.vx = Math.sin(angle) * speed;
      particle.vy = 3 + particleRandom() * 4.5;
      particle.vz = Math.cos(angle) * speed;
      particle.life = PARTICLE_LIFE_SECONDS;
      particle.spin = (particleRandom() - 0.5) * 12;
    }
  };

  useFrame((_, rawDelta) => {
    // 멈춘 동안에는 로봇도 탄도 움직이지 않으므로 새 피격이 생기지 않는다
    const dt = frozen ? 0 : Math.min(rawDelta, MAX_DELTA_SECONDS);
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

    const resolution = resolveHits(enemies.current, attack.current, px, pz, link.facing, weapon);
    attack.current = resolution.attack;

    const struck = resolution.struck.map((index) => resolution.enemies[index]);
    for (const enemy of struck) {
      if (!reducedMotion) burst(enemy.x, 0.9, enemy.z);
    }
    recordEnemyHits(link, struck);

    /* ---------------- 플레이어의 탄 ---------------- */
    /*
     * 판정이 **켜지는 프레임에** 한 발 나간다. 「판정이 살아 있으면 쏜다」로
     * 두면 0.05초 동안 프레임 수만큼 쏟아져 딱총이 기관총이 된다.
     */
    if (weapon.bolt !== null && attack.current.phase === "active" && lastPhase.current !== "active") {
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
    lastPhase.current = attack.current.phase;

    /* ---------------- 적 ---------------- */
    enemies.current = resolution.enemies.map((enemy) =>
      // 이동을 먼저 끝낸 뒤 그 자리에서 공격 단계를 진행한다 — 순서가 반대면
      // 한 프레임 전 위치로 사거리를 재게 된다.
      stepEnemyStrike(stepEnemy(enemy, px, pz, dt, link.abilityAggroScale, isBlocked), px, pz, dt),
    );

    /* ---------------- 사수 발사 ---------------- */
    let bolts = projectiles.current;
    enemies.current = enemies.current.map((enemy) => {
      if (!readyToFire(enemy, px, pz, isBlocked)) return enemy;
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
      if (link.bossHittable) targets.push({ x: link.bossX, z: link.bossZ, radius: BOSS_HIT_RADIUS });

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
      }
      recordEnemyHits(link, boltStruck);
    }

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
    if (body && head && arm) {
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
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      body.computeBoundingSphere();
      head.computeBoundingSphere();
      arm.computeBoundingSphere();
    }

    /* ---------------- 미니맵 표식 ---------------- */
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

    const myBoltMesh = playerBoltRef.current;
    if (myBoltMesh) {
      for (let i = 0; i < PLAYER_BOLT_MAX; i += 1) {
        const bolt = playerBolts.current[i];
        if (bolt) {
          scratch.position.set(bolt.x, bolt.y, bolt.z);
          scratch.euler.set(bolt.life * 14, Math.atan2(bolt.vx, bolt.vz), 0, "YXZ");
          scratch.quaternion.setFromEuler(scratch.euler);
          scratch.scale.set(0.8, 0.8, 1.4);
        } else {
          scratch.position.set(0, -999, 0);
          scratch.quaternion.identity();
          scratch.scale.set(0, 0, 0);
        }
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        myBoltMesh.setMatrixAt(i, scratch.matrix);
      }
      myBoltMesh.instanceMatrix.needsUpdate = true;
      myBoltMesh.computeBoundingSphere();
    }

    /* ---------------- 파티클 ---------------- */
    const confetti = confettiRef.current;
    if (confetti) {
      particles.current.forEach((particle, index) => {
        if (particle.life > 0) {
          particle.life -= dt;
          particle.vy -= PARTICLE_GRAVITY * dt;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.z += particle.vz * dt;
          // 바닥에 닿으면 멈춘다. 지면 아래로 빠지면 남은 수명 동안 안 보인다.
          if (particle.y < 0.05) {
            particle.y = 0.05;
            particle.vx *= 0.6;
            particle.vz *= 0.6;
            particle.vy = 0;
          }
        }

        const alive = particle.life > 0;
        scratch.position.set(particle.x, alive ? particle.y : -999, particle.z);
        scratch.euler.set(particle.life * particle.spin, particle.life * particle.spin * 0.7, 0);
        scratch.quaternion.setFromEuler(scratch.euler);
        // 수명이 끝나갈수록 작아진다. 인스턴스별 알파를 주는 것보다 싸다.
        const shrink = alive ? Math.min(1, particle.life / 0.3) : 0;
        scratch.scale.set(shrink, shrink, shrink);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        confetti.setMatrixAt(index, scratch.matrix);
      });
      confetti.instanceMatrix.needsUpdate = true;
    }
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
        내 탄. 적 탄과 **색이 달라야 한다** — 같은 색이면 화면에 날아다니는
        것 중 무엇을 피해야 하는지 순간적으로 판단할 수 없다.
      */}
      <instancedMesh ref={playerBoltRef} args={[geometry.bolt, undefined, PLAYER_BOLT_MAX]}>
        <meshBasicMaterial color={PLAYER_BOLT_COLOR} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={confettiRef} args={[geometry.confetti, undefined, PARTICLE_POOL]}>
        <meshBasicMaterial color="#ffd23f" side={THREE.DoubleSide} toneMapped={false} transparent />
      </instancedMesh>
    </group>
  );
}
