import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ImportService } from './lib/imports';
import type { Asset } from './lib/scene';
import './style.css';

const importer = new ImportService();
function Viewer({ assets, room, selected }: { assets: Asset[]; room: number[]; selected: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#192322');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.0001, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x63736b, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 8, 5); scene.add(light);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(room[0], .025, room[1]), new THREE.MeshStandardMaterial({ color: '#34433c', roughness: .95 }));
    floor.position.y = -.018; scene.add(floor);
    const grid = new THREE.GridHelper(Math.max(room[0], room[1]), Math.max(2, Math.round(Math.max(room[0], room[1]) * 2)), 0x82917b, 0x46594d); scene.add(grid);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(room[0], room[2], room[1])), new THREE.LineBasicMaterial({ color: 0x7e9784, transparent: true, opacity: .35 }));
    edges.position.y = room[2] / 2; scene.add(edges);
    let offset = 0;
    const groups: THREE.Group[] = [];
    assets.forEach((asset, index) => {
      const group = new THREE.Group();
      asset.parts.forEach(part => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.vertices, 3)); geometry.setIndex(part.indices); geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color ? new THREE.Color(...part.color) : index === selected ? '#c8ef82' : '#b9c9c5', metalness: .2, roughness: .55 }));
        group.add(mesh);
      });
      group.position.x = offset; offset += asset.dimensions[0] + .25; groups.push(group); scene.add(group);
    });
    const focus = () => {
      const group = groups[selected];
      if (group) {
        const box = new THREE.Box3().setFromObject(group); const center = box.getCenter(new THREE.Vector3());
        const size = Math.max(...box.getSize(new THREE.Vector3()).toArray(), .01);
        controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(size * 1.5, size, size * 1.5));
      } else {
        controls.target.set(0, 0, 0); camera.position.set(room[0] * .9, Math.max(room[0], room[1]) * .75, room[1] * .9);
      }
      controls.update();
    };
    focus();
    const resize = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose();
      scene.traverse(object => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [assets, room, selected]);
  return <div className="viewport" ref={host} aria-label="Interactive 3D room" />;
}

function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [room, setRoom] = useState([6, 5, 3]);
  const [selected, setSelected] = useState(-1);
  const [status, setStatus] = useState('Ready to import');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('A small 5V laboratory temperature monitor with a display');
  const [mode, setMode] = useState('simulation');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('openai');
  const [upAxis, setUpAxis] = useState<'Z' | 'Y'>('Z');
  const [scale, setScale] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stage.current);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);
  async function toggleFullscreen() {
    if (expanded) { setExpanded(false); return; }
    if (document.fullscreenElement === stage.current) { await document.exitFullscreen(); return; }
    try {
      if (!stage.current?.requestFullscreen) throw new Error('Fullscreen unavailable');
      await stage.current.requestFullscreen();
    } catch { setExpanded(true); }
  }
  const input = useRef<HTMLInputElement>(null);
  async function load(files: File[]) {
    if (busy) return;
    setBusy(true); setError('');
    try { const next = await importer.files(files, { upAxis, scale }, setStatus); setAssets(old => [...old, ...next]); setSelected(assets.length); setStatus(`Imported ${next.length} asset(s)`); }
    catch (e) { setError((e as Error).message); setStatus('Import failed'); }
    finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setError(''); setStatus('Starting Forma…');
    try {
      const response = await fetch('/api/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, mode, provider, model }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const poll = await fetch(`/api/generations/${data.id}`); const job = await poll.json();
        if (!poll.ok) throw new Error(job.error);
        setStatus(job.message);
        if (job.status === 'failed') throw new Error(job.message);
        if (job.status === 'succeeded') {
          const file = new File([JSON.stringify(job.project)], 'forma-generated.json', { type: 'application/json' });
          const next = await importer.files([file], { upAxis: 'Z', scale: 1 }, setStatus);
          setAssets(old => [...old, ...next]); setSelected(assets.length); setStatus(`Forma ${mode} project imported`); break;
        }
      }
    } catch (e) { setError((e as Error).message); setStatus('Generation failed'); }
    finally { setBusy(false); }
  }
  const asset = assets[selected];
  return <><header><div className="brand"><span className="logo">A</span> ASTRA <span className="muted">INDUSTRIES</span></div><span className="tag">SPATIAL WORKBENCH / 001</span><button disabled={busy} onClick={() => input.current?.click()}>+ Import project</button></header>
    <main onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void load(Array.from(e.dataTransfer.files)); }}>
      <aside><div className="eyebrow">WORKSPACE</div><h1>Make room<br />for your ideas.</h1><p>Bring hardware into context. Import a Forma project or STEP model to explore it at real-world scale.</p>
        <input ref={input} aria-label="Import files" type="file" accept=".json,.step,.stp" multiple hidden onChange={e => { void load(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <button className="import" disabled={busy} onClick={() => input.current?.click()}>↑ Drop files or browse<br /><small>FORMA JSON · STEP · STP</small></button>
        <details><summary>STEP import settings</summary><label>Source up axis<select value={upAxis} onChange={e => setUpAxis(e.target.value as 'Y' | 'Z')}><option>Z</option><option>Y</option></select></label><label>Scale correction<input type="number" min="0.000001" value={scale} onChange={e => setScale(Number(e.target.value))} /></label><p>STEP units are read automatically. Correction multiplies the physical size.</p></details>
        <section><div className="eyebrow">ROOM / METERS</div><div className="dimensions">{['Width', 'Depth', 'Height'].map((name, i) => <label key={name}>{name}<input aria-label={name} type="number" min="1" max="100" step=".5" value={room[i]} onChange={e => { const n = Number(e.target.value); if (n >= 1 && n <= 100) setRoom(old => old.map((v, j) => i === j ? n : v)); }} /></label>)}</div><button onClick={() => setSelected(-1)}>View entire room</button></section>
        <section><div className="eyebrow">SCENE COLLECTION <span>{assets.length}</span></div>{!assets.length && <p>Your room is a blank canvas.</p>}{assets.map((a, i) => <button className={`asset ${i === selected ? 'active' : ''}`} key={`${a.id}-${i}`} onClick={() => setSelected(i)}><span>◇ {a.name}</span><small>{a.source.kind.toUpperCase()} · {a.parts.length} parts</small></button>)}</section>
        <details><summary>Build with Forma</summary><textarea aria-label="Project description" value={prompt} onChange={e => setPrompt(e.target.value)} /><label>Generation mode<select value={mode} onChange={e => setMode(e.target.value)}><option value="simulation">Deterministic demo</option><option value="live">Live generation</option></select></label>{mode === 'live' && <><label>Provider<input value={provider} onChange={e => setProvider(e.target.value)} /></label><label>Model<input value={model} onChange={e => setModel(e.target.value)} /></label><p>Set provider credentials in the server’s .env file.</p></>}<button disabled={busy} onClick={() => void generate()}>Build and import →</button></details>
      </aside><div ref={stage} className={`stage${expanded ? ' stage-expanded' : ''}`}><div className="stage-label"><span className="dot" /> PERSPECTIVE VIEW <span>1:1 / METERS</span></div><button className="fullscreen-toggle" aria-label={fullscreen || expanded ? 'Exit fullscreen' : 'Enter fullscreen'} aria-pressed={fullscreen || expanded} title={fullscreen || expanded ? 'Exit fullscreen (Esc)' : 'Expand 3D viewer'} onClick={() => void toggleFullscreen()}>{fullscreen || expanded ? '↙ Exit fullscreen' : '⛶ Fullscreen'}</button><Viewer assets={assets} room={room} selected={selected} /><div className="hint">Drag to orbit · Right-drag to pan · Scroll to zoom · Select an asset to frame</div></div>
      <aside className="inspector"><div className="eyebrow">INSPECTOR</div>{asset ? <><h2>{asset.name}</h2><span className="badge">{asset.source.kind.toUpperCase()}</span><h3>Dimensions</h3><p>{asset.dimensions.map(n => n.toFixed(3)).join(' × ')} m<br /><small>Width × height × depth</small></p><h3>Source</h3><p className="wrap">{asset.source.filename}<br />{asset.source.version && `Version ${asset.source.version}`}</p>{asset.warnings.map(w => <p className="notice" key={w}>{w}</p>)}<h3>Parts</h3>{asset.parts.map(part => <details key={part.id}><summary>{part.name}</summary>{Object.entries(part.metadata).filter(([, v]) => v).map(([key, value]) => <p key={key}><b>{key}</b>: {value}</p>)}</details>)}</> : <><h2>A space for<br />what’s next.</h2><p>Select an imported asset to inspect its dimensions, parts, and source.</p><div className="room-stat">{room[0] * room[1]}<small>m² floor area</small></div></>}</aside>
    </main><footer><span role="status">{busy ? '◌ ' : '● '}{status}</span><span>FORMA POWERED · LOCAL FIRST</span></footer>{error && <div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}</>;
}
createRoot(document.getElementById('root')!).render(<App />);
