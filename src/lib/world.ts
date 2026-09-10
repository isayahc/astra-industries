import * as THREE from 'three';
import type { Asset } from './scene';

/** The same geometry, materials and instance placement feed the viewport and GIFs. */
export function createWorld(assets: Asset[], room: number[], selected = -1) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#192322');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x63736b, 3));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(4, 8, 5); scene.add(light);
  const environment = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(room[0], .025, room[1]), new THREE.MeshStandardMaterial({ color: '#34433c', roughness: .95 }));
  floor.position.y = -.018; environment.add(floor);
  environment.add(new THREE.GridHelper(Math.max(room[0], room[1]), Math.max(2, Math.round(Math.max(room[0], room[1]) * 2)), 0x82917b, 0x46594d));
  const box = new THREE.BoxGeometry(room[0], room[2], room[1]);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x7e9784, transparent: true, opacity: .35 }));
  box.dispose(); edges.position.y = room[2] / 2; environment.add(edges);
  scene.add(environment);
  let offset = 0;
  const groups = assets.map((asset, index) => {
    const group = new THREE.Group();
    asset.parts.forEach(part => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.vertices, 3));
      geometry.setIndex(part.indices); geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: part.color ? new THREE.Color(...part.color) : index === selected ? '#c8ef82' : '#b9c9c5',
        metalness: .2, roughness: .55,
      });
      group.add(new THREE.Mesh(geometry, material));
    });
    group.position.x = offset;
    offset += asset.dimensions[0] + .25;
    scene.add(group);
    return group;
  });
  return { scene, groups, environment, dispose: () => disposeScene(scene) };
}

export function disposeScene(scene: THREE.Object3D) {
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  });
}
