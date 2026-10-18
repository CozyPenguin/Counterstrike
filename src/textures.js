import * as THREE from 'three';

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finish(c, repeatX = 1, repeatY = 1, aniso = 4) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = aniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, count, colors, minR = 1, maxR = 3) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = minR + Math.random() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function sandTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b89f72';
  ctx.fillRect(0, 0, size, size);
  // blotchy gradient patches
  for (let i = 0; i < 60; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * size, Math.random() * size, 2,
      Math.random() * size, Math.random() * size, 30 + Math.random() * 50
    );
    const light = Math.random() > 0.5;
    g.addColorStop(0, light ? 'rgba(214,190,146,0.20)' : 'rgba(120,98,66,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  speckle(ctx, size, 900, ['#a68c60', '#c9b084', '#8f7650', '#d4be94'], 0.6, 2.2);
  return finish(c);
}

export function concreteTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8d8577';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * size, Math.random() * size, 3,
      Math.random() * size, Math.random() * size, 20 + Math.random() * 60
    );
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(120,112,98,0.22)' : 'rgba(170,162,148,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  speckle(ctx, size, 700, ['#7c7466', '#9c9484', '#6e6658'], 0.5, 1.8);
  // panel seams
  ctx.strokeStyle = 'rgba(60,55,48,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  return finish(c);
}

export function plasterTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c7a878';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 50; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * size, Math.random() * size, 2,
      Math.random() * size, Math.random() * size, 24 + Math.random() * 60
    );
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(196,168,120,0.20)' : 'rgba(138,110,72,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  speckle(ctx, size, 500, ['#b89a6c', '#d2b688', '#a98c60'], 0.5, 1.6);
  // grime streaks
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(90,72,50,${0.04 + Math.random() * 0.07})`;
    const x = Math.random() * size;
    ctx.fillRect(x, Math.random() * size, 4 + Math.random() * 10, 30 + Math.random() * 80);
  }
  return finish(c);
}

export function crateTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(0, 0, size, size);
  // planks
  const plankH = size / 6;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#96652f' : '#815326';
    ctx.fillRect(0, i * plankH, size, plankH - 2);
    ctx.fillStyle = 'rgba(50,30,12,0.35)';
    ctx.fillRect(0, i * plankH + plankH - 3, size, 2);
  }
  // grain
  for (let i = 0; i < 130; i++) {
    ctx.strokeStyle = `rgba(${60 + Math.random() * 60},${36 + Math.random() * 34},${14 + Math.random() * 18},${0.25 + Math.random() * 0.3})`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + Math.random() * 8 - 4, size * 0.6, y + Math.random() * 8 - 4, size, y + Math.random() * 6 - 3);
    ctx.stroke();
  }
  // frame
  ctx.strokeStyle = '#5d3a18';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, size - 18, size - 18);
  ctx.strokeStyle = '#6e4620';
  ctx.lineWidth = 8;
  ctx.strokeRect(22, 22, size - 44, size - 44);
  // corner braces
  ctx.strokeStyle = 'rgba(240,200,150,0.35)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(22, 60); ctx.lineTo(60, 22);
  ctx.moveTo(size - 22, 60); ctx.lineTo(size - 60, 22);
  ctx.moveTo(22, size - 60); ctx.lineTo(60, size - 22);
  ctx.moveTo(size - 22, size - 60); ctx.lineTo(size - 60, size - 22);
  ctx.stroke();
  return finish(c);
}

export function metalTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a6168';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 30; i++) {
    const g = ctx.createLinearGradient(0, Math.random() * size, size, Math.random() * size);
    g.addColorStop(0, 'rgba(120,128,136,0.12)');
    g.addColorStop(0.5, 'rgba(70,76,84,0.10)');
    g.addColorStop(1, 'rgba(110,118,128,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // horizontal panel lines
  ctx.strokeStyle = 'rgba(30,34,38,0.55)';
  ctx.lineWidth = 3;
  for (let y = 0; y <= size; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  // rivets
  for (let y = 32; y < size; y += 64) {
    for (let x = 18; x < size; x += 46) {
      ctx.fillStyle = 'rgba(150,158,168,0.55)';
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(20,22,26,0.5)';
      ctx.beginPath(); ctx.arc(x, y + 1.4, 3.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  return finish(c);
}

export function woodFloorTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a5c3c';
  ctx.fillRect(0, 0, size, size);
  const plankW = size / 8;
  for (let i = 0; i < 8; i++) {
    const shade = 100 + ((Math.random() * 40) | 0);
    ctx.fillStyle = `rgb(${shade + 20},${shade - 12},${Math.max(30, shade - 46)})`;
    ctx.fillRect(i * plankW, 0, plankW - 2, size);
    for (let s = 0; s < 22; s++) {
      ctx.fillStyle = `rgba(40,24,10,${0.1 + Math.random() * 0.18})`;
      ctx.fillRect(i * plankW + Math.random() * plankW, Math.random() * size, 1.5, 14 + Math.random() * 40);
    }
    ctx.fillStyle = 'rgba(30,18,8,0.5)';
    ctx.fillRect(i * plankW + plankW - 2, 0, 2, size);
  }
  return finish(c);
}

export function skyTexture() {
  const size = 64;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#6f9fc9');
  g.addColorStop(0.45, '#a8c4d8');
  g.addColorStop(0.75, '#d8c9a8');
  g.addColorStop(1, '#c2a578');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c, 1, 1, 1);
}
