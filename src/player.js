import * as THREE from 'three';
import { overlaps } from './map.js';

const GRAVITY = 22;
const STAND_HEIGHT = 1.75;
const CROUCH_HEIGHT = 1.05;
const EYE = 0.12; // eye offset below top of capsule... measured from feet

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(0, 0, 24);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI; // face -z (north)
    this.pitch = 0;
    this.radius = 0.42;
    this.height = STAND_HEIGHT;
    this.targetHeight = STAND_HEIGHT;
    this.onGround = true;
    this.crouching = false;
    this.walking = false;
    this.jumpQueued = false;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.landSquash = 0;
    this.stepTimer = 0;
    this.dead = false;

    // speeds (m/s)
    this.speedRun = 6.1;
    this.speedWalk = 3.1;
    this.speedCrouch = 2.1;
    this.jumpVel = 7.6;

    this.eyeHeight = STAND_HEIGHT + EYE;
    this.updateCamera(0);
  }

  respawn(pos, yaw = Math.PI) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.height = this.targetHeight = STAND_HEIGHT;
    this.dead = false;
    this.updateCamera(0);
  }

  applyMouse(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.015;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  queueJump() {
    this.jumpQueued = true;
  }

  /** AABB of the player at current pos/height. */
  playerBox() {
    return new THREE.Box3(
      new THREE.Vector3(this.pos.x - this.radius, this.pos.y, this.pos.z - this.radius),
      new THREE.Vector3(this.pos.x + this.radius, this.pos.y + this.height, this.pos.z + this.radius)
    );
  }

  _resolveAxis(axis, amount) {
    if (amount === 0) return false;
    this.pos[axis] += amount;
    const box = this.playerBox();
    let blocked = false;

    for (const c of this.world.colliders) {
      if (!overlaps(box, c)) continue;
      blocked = true;
      if (axis === 'y') {
        if (amount > 0) {
          // hit ceiling
          this.pos.y = c.min.y - this.height - 1e-4;
        } else {
          // landing / standing on top
          this.pos.y = c.max.y + 1e-4;
          this.onGround = true;
        }
        this.vel.y = 0;
      } else {
        // push out along axis
        if (amount > 0) this.pos[axis] = c.min[axis] - this.radius - 1e-4;
        else this.pos[axis] = c.max[axis] + this.radius + 1e-4;
        this.vel[axis] = 0;
      }
      box.min.set(this.pos.x - this.radius, this.pos.y, this.pos.z - this.radius);
      box.max.set(this.pos.x + this.radius, this.pos.y + this.height, this.pos.z + this.radius);
    }
    return blocked;
  }

  _tryStepUp(moveX, moveZ) {
    // Attempt to climb a step (stairs / small ledges) up to 0.55m.
    const stepH = 0.55;
    const startX = this.pos.x;
    const startZ = this.pos.z;
    const startY = this.pos.y;

    // Move up
    this.pos.y += stepH;
    if (this._collidesAtCurrent()) {
      this.pos.set(startX, startY, startZ);
      return false;
    }
    // Move horizontally
    this.pos.x += moveX;
    this.pos.z += moveZ;
    if (this._collidesAtCurrent()) {
      this.pos.set(startX, startY, startZ);
      return false;
    }
    // Drop down onto the step
    this._resolveAxis('y', -stepH - 0.02);
    return true;
  }

  _collidesAtCurrent() {
    const box = this.playerBox();
    for (const c of this.world.colliders) {
      if (overlaps(box, c)) return true;
    }
    return false;
  }

  update(dt, input, frozen = false) {
    if (this.dead) {
      this.updateCamera(dt);
      return;
    }

    // ---- stance ----
    const wantCrouch = input.crouch && this.onGround;
    if (wantCrouch !== this.crouching) {
      if (!wantCrouch) {
        // try to stand: check headroom
        const saveH = this.height;
        this.height = STAND_HEIGHT;
        if (this._collidesAtCurrent()) {
          this.height = saveH;
        } else {
          this.crouching = false;
          this.targetHeight = STAND_HEIGHT;
        }
      } else {
        this.crouching = true;
        this.targetHeight = CROUCH_HEIGHT;
      }
    }
    this.height += (this.targetHeight - this.height) * Math.min(1, dt * 12);

    // ---- wish direction ----
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (!frozen) {
      if (input.forward) wish.add(forward);
      if (input.back) wish.sub(forward);
      if (input.right) wish.add(right);
      if (input.left) wish.sub(right);
    }
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();

    this.walking = input.walk;
    let maxSpeed = this.crouching ? this.speedCrouch : this.walking ? this.speedWalk : this.speedRun;

    // ---- accelerate ----
    const accel = this.onGround ? 60 : 14;
    const targetX = wish.x * maxSpeed;
    const targetZ = wish.z * maxSpeed;

    if (this.onGround) {
      this.vel.x += (targetX - this.vel.x) * Math.min(1, accel * dt / Math.max(maxSpeed, 0.01) * 8);
      this.vel.z += (targetZ - this.vel.z) * Math.min(1, accel * dt / Math.max(maxSpeed, 0.01) * 8);
      // friction
      if (!moving) {
        const fr = Math.max(0, 1 - 9.5 * dt);
        this.vel.x *= fr;
        this.vel.z *= fr;
      }
    } else {
      // limited air control
      this.vel.x += (targetX - this.vel.x) * Math.min(1, 1.6 * dt);
      this.vel.z += (targetZ - this.vel.z) * Math.min(1, 1.6 * dt);
    }

    // ---- jump ----
    if (this.jumpQueued && this.onGround && !frozen) {
      this.vel.y = this.jumpVel;
      this.onGround = false;
      this.justJumped = true;
    }
    this.jumpQueued = false;

    // ---- gravity ----
    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -30) this.vel.y = -30;

    const wasGround = this.onGround;
    this.onGround = false;

    // ---- move + collide (Y first so gravity lands before horizontal) ----
    const moveX = this.vel.x * dt;
    const moveZ = this.vel.z * dt;

    this._resolveAxis('y', this.vel.y * dt);

    const blockedX = this._resolveAxis('x', moveX);
    const blockedZ = this._resolveAxis('z', moveZ);

    if ((blockedX || blockedZ) && wasGround && (Math.abs(moveX) + Math.abs(moveZ)) > 0.0001) {
      if (this._tryStepUp(blockedX ? 0 : moveX, blockedZ ? 0 : moveZ)) {
        this.onGround = true;
      }
    }

    // landing
    if (!wasGround && this.onGround) {
      if (this.justJumped) this.justJumped = false;
      else {
        this.landSquash = Math.min(1, Math.abs(this.vel.y) / 18 + 0.35);
        this.onLand && this.onLand();
      }
    }

    // ---- head bob & footsteps ----
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hSpeed > 0.6) {
      this.bobPhase += dt * hSpeed * 1.35;
      this.bobAmount += (Math.min(1, hSpeed / this.speedRun) - this.bobAmount) * Math.min(1, dt * 8);
      this.stepTimer -= dt * (hSpeed / this.speedRun);
      if (this.stepTimer <= 0) {
        this.stepTimer = this.crouching ? 1.15 : this.walking ? 0.95 : 0.62;
        if (!frozen) this.onFootstep && this.onFootstep();
      }
    } else {
      this.bobAmount += (0 - this.bobAmount) * Math.min(1, dt * 6);
    }

    this.landSquash *= Math.max(0, 1 - dt * 6);

    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const eye = this.height + EYE - 0.22;
    const bobY = Math.sin(this.bobPhase * 2) * 0.042 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.032 * this.bobAmount;
    const squash = this.landSquash * 0.12;

    this.camera.position.set(
      this.pos.x + bobX * Math.cos(this.yaw),
      this.pos.y + eye + bobY - squash,
      this.pos.z - bobX * Math.sin(this.yaw)
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(Math.cos(this.bobPhase) * 0.006 * this.bobAmount);
  }

  get speed2D() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
}
