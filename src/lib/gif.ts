import * as THREE from 'three';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { Asset } from './scene';
import { createWorld } from './world';

export type FloorRegion = { x: number; z: number; width: number; depth: number };
export type GifOptions = {
  scope: 'room' | 'section' | 'asset';
  assetIndex: number;
  region: FloorRegion;
  motion: 'turntable' | 'sample';
  size: number;
  duration: number;
  fps: number;
};
export type GifResult = { blob: Blob; filename: string; metadata: GifMetadata };
export type GifMetadata = {
  schemaVersion: 1; units: 'm'; upAxis: 'Y'; scope: GifOptions['scope']; motion: GifOptions['motion'];
  width: number; height: number; frameCount: number; frameDelayMs: number; durationSeconds: number;
  room: number[]; region?: FloorRegion;
  assets: { id: string; name: string; source: Asset['source']; position: number[]; warnings: string[] }[];
  note: string;
};

export function regionBounds(region: FloorRegion, room: number[]) {
  const { x, z, width, depth } = region;
  if (![x, z, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) throw new Error('Section dimensions must be positive, with finite center coordinates.');
  if (Math.abs(x) + width / 2 > room[0] / 2 + 1e-8 || Math.abs(z) + depth / 2 > room[1] / 2 + 1e-8) {
    throw new Error('The floor section must fit inside the room. Coordinates are measured from the room center.');
  }
  return new THREE.Box3(new THREE.Vector3(x - width / 2, -.04, z - depth / 2), new THREE.Vector3(x + width / 2, room[2], z + depth / 2));
}

/** Independent offscreen render: exporting never rotates or mutates the user's scene. */
export async function renderGif(assets: Asset[], room: number[], options: GifOptions, signal: AbortSignal, progress: (value: number) => void): Promise<GifResult> {
  if (!assets.length) throw new Error('Import an asset before rendering a GIF.');
  if (!['room', 'section', 'asset'].includes(options.scope) || !['turntable', 'sample'].includes(options.motion)) throw new Error('Unsupported GIF scope or motion.');
  if (![320, 480, 640].includes(options.size) || ![2, 3, 4].includes(options.duration) || ![10, 15].includes(options.fps)) throw new Error('Unsupported GIF size or timing.');
  if (options.motion === 'sample' && options.scope !== 'asset') throw new Error('Sample motion is available for individual assets.');
  if (options.scope === 'asset' && !assets[options.assetIndex]) throw new Error('Select an asset to render.');
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  const section = options.scope === 'section' ? regionBounds(options.region, room) : undefined;
  const world = createWorld(assets, room);
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(options.size, options.size);
    let bounds = new THREE.Box3(new THREE.Vector3(-room[0] / 2, 0, -room[1] / 2), new THREE.Vector3(room[0] / 2, room[2], room[1] / 2));
    if (options.scope === 'asset') {
      world.environment.visible = false;
      world.groups.forEach((group, i) => { group.visible = i === options.assetIndex; });
      const group = world.groups[options.assetIndex];
      group.position.set(0, 0, 0);
      bounds = new THREE.Box3().setFromObject(group);
    } else if (section) {
      bounds = section;
      world.groups.forEach(group => { group.visible = section.intersectsBox(new THREE.Box3().setFromObject(group)); });
      if (!world.groups.some(group => group.visible)) throw new Error('This floor section contains no assets. Adjust its center or dimensions.');
      renderer.clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -section.min.x),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), section.max.x),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -section.min.z),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), section.max.z),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -section.min.y),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), section.max.y),
      ];
    } else {
      world.groups.forEach(group => bounds.union(new THREE.Box3().setFromObject(group)));
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, .01);
    const camera = new THREE.PerspectiveCamera(40, 1, Math.max(radius / 1000, .00001), radius * 100);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(20)) * 1.15;
    const motionHeight = size.y * .3;
    if (options.motion === 'sample') center.y += motionHeight / 2;
    const canvas = document.createElement('canvas'); canvas.width = options.size; canvas.height = options.size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser cannot capture GIF frames.');
    const frames = options.duration * options.fps;
    const delay = Math.round(100 / options.fps) * 10; // GIF timing has 10 ms resolution.
    const gif = GIFEncoder();
    const metadata: GifMetadata = {
      schemaVersion: 1, units: 'm', upAxis: 'Y', scope: options.scope, motion: options.motion,
      width: options.size, height: options.size, frameCount: frames, frameDelayMs: delay, durationSeconds: frames * delay / 1000,
      room: [...room], ...(section ? { region: { ...options.region } } : {}),
      assets: world.groups.flatMap((group, i) => group.visible ? [{ id: assets[i].id, name: assets[i].name, source: { ...assets[i].source }, position: group.position.toArray(), warnings: [...assets[i].warnings] }] : []),
      note: options.motion === 'sample' ? 'Synthetic lift-and-return demonstration with a fixed camera; not a simulated physical process or authored animation.' : 'One complete camera orbit; object positions remain fixed. Floor-section geometry is clipped at the section boundaries.',
    };
    for (let frame = 0; frame < frames; frame++) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const phase = frame / frames;
      const angle = Math.PI / 4 + (options.motion === 'turntable' ? phase * Math.PI * 2 : 0);
      if (options.motion === 'sample') world.groups[options.assetIndex].position.y = motionHeight * (1 - Math.cos(phase * Math.PI * 2)) / 2;
      camera.position.set(center.x + Math.sin(angle) * distance * .82, center.y + distance * .58, center.z + Math.cos(angle) * distance * .82);
      camera.lookAt(center);
      renderer.render(world.scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      context.fillStyle = '#101716'; context.fillRect(0, options.size - 29, options.size, 29);
      context.fillStyle = '#dfe7df'; context.font = '11px sans-serif';
      context.fillText(`ASTRA | ${options.scope.toUpperCase()} | ${options.motion === 'sample' ? 'SAMPLE MOTION' : 'TURNTABLE'} | meters`, 10, options.size - 11);
      const pixels = context.getImageData(0, 0, options.size, options.size).data;
      const palette = quantize(pixels, 256);
      gif.writeFrame(applyPalette(pixels, palette), options.size, options.size, { palette, delay, repeat: 0 });
      progress((frame + 1) / frames);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
    gif.finish();
    const name = options.scope === 'asset' ? assets[options.assetIndex].name : `floor-${options.scope}`;
    return { blob: new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' }),
      filename: `${name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'asset'}-${options.motion}.gif`, metadata };
  } finally { world.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); }
}
