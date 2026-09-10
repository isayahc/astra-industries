import type { Asset, Vec3 } from './scene';
import type { SceneManifest } from './workspace';
import type { SavedScene } from './scene-repository';

export const ASTRA_SCENE_SCHEMA_VERSION = 1 as const;

export type SceneSource = {
  projectId?: string;
  revision?: string;
};

export type SceneRoom = {
  width: number;
  depth: number;
  height: number;
};

export type SceneInstance = {
  id: string;
  assetId: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  visible: boolean;
};

export type Keyframe = {
  timeSeconds: number;
  position?: Vec3;
  rotation?: Vec3;
  visible?: boolean;
};

export type AnimationTrack = {
  instanceId: string;
  keyframes: Keyframe[];
};

export type AnimationTimeline = {
  durationSeconds: number;
  fps: number;
  tracks: AnimationTrack[];
};

export type AstraScene = {
  workspaceDocument?: SceneManifest;
  activeCloudScene?: SavedScene | null;
  schemaVersion: typeof ASTRA_SCENE_SCHEMA_VERSION;
  id: string;
  source: SceneSource;
  room: SceneRoom;
  instances: SceneInstance[];
  animation?: AnimationTimeline;
};

const finite = (value: number, label: string, errors: string[]) => {
  if (!Number.isFinite(value)) errors.push(`${label} must be finite.`);
};

function validateVector(vector: Vec3, label: string, errors: string[]) {
  vector.forEach((value, index) => finite(value, `${label}[${index}]`, errors));
}

export function validateScene(scene: AstraScene): string[] {
  const errors: string[] = [];
  if (scene.schemaVersion !== ASTRA_SCENE_SCHEMA_VERSION) errors.push(`Unsupported scene schema version: ${scene.schemaVersion}.`);
  if (!scene.id.trim()) errors.push('Scene ID is required.');
  ['width', 'depth', 'height'].forEach(key => {
    const value = scene.room[key as keyof SceneRoom];
    finite(value, `room.${key}`, errors);
    if (value <= 0) errors.push(`room.${key} must be greater than zero.`);
  });
  const ids = new Set<string>();
  for (const instance of scene.instances) {
    if (!instance.id.trim()) errors.push('Scene instance ID is required.');
    if (ids.has(instance.id)) errors.push(`Duplicate scene instance ID: ${instance.id}.`);
    ids.add(instance.id);
    if (!instance.assetId.trim()) errors.push(`Scene instance ${instance.id} is missing an asset ID.`);
    validateVector(instance.position, `instance ${instance.id} position`, errors);
    validateVector(instance.rotation, `instance ${instance.id} rotation`, errors);
  }
  if (scene.animation) {
    finite(scene.animation.durationSeconds, 'animation.durationSeconds', errors);
    finite(scene.animation.fps, 'animation.fps', errors);
    if (scene.animation.durationSeconds < 0) errors.push('animation.durationSeconds cannot be negative.');
    if (scene.animation.fps <= 0) errors.push('animation.fps must be greater than zero.');
    for (const track of scene.animation.tracks) {
      if (!ids.has(track.instanceId)) errors.push(`Animation track references missing instance: ${track.instanceId}.`);
      let previous = -1;
      for (const keyframe of track.keyframes) {
        finite(keyframe.timeSeconds, `keyframe ${track.instanceId} time`, errors);
        if (keyframe.timeSeconds < previous) errors.push(`Keyframes for ${track.instanceId} must be ordered by time.`);
        if (keyframe.timeSeconds > scene.animation.durationSeconds) errors.push(`Keyframe for ${track.instanceId} exceeds the timeline duration.`);
        previous = keyframe.timeSeconds;
        if (keyframe.position) validateVector(keyframe.position, `keyframe ${track.instanceId} position`, errors);
        if (keyframe.rotation) validateVector(keyframe.rotation, `keyframe ${track.instanceId} rotation`, errors);
      }
    }
  }
  return errors;
}

export function migratePositions(assets: Asset[], room: number[], positions: Vec3[], id = `scene-${crypto.randomUUID()}`): AstraScene {
  const scene: AstraScene = {
    schemaVersion: ASTRA_SCENE_SCHEMA_VERSION,
    id,
    source: {},
    room: { width: room[0], depth: room[1], height: room[2] },
    instances: assets.map((asset, index) => ({
      id: `${asset.id}/instance/${index}`,
      assetId: asset.id,
      name: asset.name,
      position: positions[index] || [0, 0, 0],
      rotation: [0, 0, 0],
      visible: true,
    })),
  };
  const errors = validateScene(scene);
  if (errors.length) throw new Error(`Could not migrate workspace: ${errors.join(' ')}`);
  return scene;
}
