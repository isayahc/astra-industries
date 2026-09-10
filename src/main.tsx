import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ImportService } from './lib/imports';
import type { Asset, Vec3 } from './lib/scene';
import { createWorld } from './lib/world';
import { regionBounds, type FloorRegion } from './lib/gif';
import { CaptureTools } from './components/capture-tools';
import { AuthControls } from './components/auth-controls';
import { preserveAuthWorkspace, restoreAuthWorkspace } from './lib/auth-workspace';
import './style.css';

const importer = new ImportService();
function Viewer({ assets, room, selected, selectedPart, positions, onSelectPart, region }: { assets: Asset[]; room: number[]; selected: number; selectedPart: number; positions: Vec3[]; onSelectPart: (assetIndex: number, partIndex: number) => void; region: FloorRegion | null }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  useEffect(() => {
    const el = host.current!;
     const world = createWorld(assets, room, selected, selectedPart, positions);
    const { scene, groups } = world;
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.0001, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(renderer.domElement);
     const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
     const raycaster = new THREE.Raycaster();
     const pointer = new THREE.Vector2();
     const selectPart = (event: PointerEvent) => {
       if (event.button !== 0) return;
       const rect = renderer.domElement.getBoundingClientRect();
       pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
       raycaster.setFromCamera(pointer, camera);
       const hit = raycaster.intersectObjects(groups.flatMap(group => group.children), false)[0];
       if (!hit?.object.parent) return;
       const assetIndex = groups.indexOf(hit.object.parent as THREE.Group);
       const partIndex = hit.object.parent.children.indexOf(hit.object);
       if (assetIndex >= 0 && partIndex >= 0) onSelectPart(assetIndex, partIndex);
     };
     renderer.domElement.addEventListener('pointerup', selectPart);
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
      observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); renderer.domElement.removeEventListener('pointerup', selectPart);
      world.dispose(); sceneRef.current = null;
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [assets, room, selected, selectedPart, positions, onSelectPart]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!region || !scene) return;
    let box: THREE.Box3;
    try { box = regionBounds(region, room); } catch { return; }
    const outline = new THREE.Box3Helper(box, 0xc8ef82);
    scene.add(outline);
    return () => { scene.remove(outline); outline.geometry.dispose(); (outline.material as THREE.Material).dispose(); };
  }, [region, room, assets, selected]);
  return <div className="viewport" ref={host} aria-label="Interactive 3D room" />;
}

function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [room, setRoom] = useState([6, 5, 3]);
  const [selected, setSelected] = useState(-1);
  const [selectedPart, setSelectedPart] = useState(-1);
  const [positions, setPositions] = useState<Vec3[]>([]);
  const [status, setStatus] = useState('Ready to import');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void restoreAuthWorkspace().then(snapshot => {
      if (snapshot && active) {
        setAssets(snapshot.assets); setRoom(snapshot.room); setSelected(snapshot.selected);
        setPositions(snapshot.positions ?? snapshot.assets.map((_, index) => [index * 1.25, 0, 0] as Vec3));
        setStatus('Restored workspace after sign-in');
      }
    }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, []);
  const [prompt, setPrompt] = useState('A small 5V laboratory temperature monitor with a display');
  const [mode, setMode] = useState('simulation');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('openai');
  const [upAxis, setUpAxis] = useState<'Z' | 'Y'>('Z');
  const [scale, setScale] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureRegion, setCaptureRegion] = useState<FloorRegion | null>(null);
  const isFullscreen = fullscreen || expanded;
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
    if (isFullscreen) {
      restoreAfterPicker.current = false;
      if (document.fullscreenElement === stage.current) await document.exitFullscreen();
      setExpanded(false);
      return;
    }
    try {
      if (!stage.current?.requestFullscreen) throw new Error('Fullscreen unavailable');
      await stage.current.requestFullscreen();
    } catch { setExpanded(true); }
  }
  const input = useRef<HTMLInputElement>(null);
  const restoreAfterPicker = useRef(false);
  function openFilePicker() {
    restoreAfterPicker.current = document.fullscreenElement === stage.current;
    // OS file dialogs can exit native fullscreen. Keep the portal and its input
    // mounted in the same place, and preserve the full-window layout underneath.
    if (isFullscreen) flushSync(() => setExpanded(true));
    input.current?.click();
  }
  function finishFilePicker() {
    const restore = restoreAfterPicker.current;
    restoreAfterPicker.current = false;
    if (!restore) return;
    if (document.fullscreenElement === stage.current) { setExpanded(false); return; }
    // Some browsers allow fullscreen from the selection/cancel event. Others
    // require another user gesture; retain the full-window fallback in that case.
    void stage.current?.requestFullscreen?.().then(() => setExpanded(false)).catch(() => {});
  }
  useEffect(() => {
    const element = input.current;
    element?.addEventListener('cancel', finishFilePicker);
    return () => element?.removeEventListener('cancel', finishFilePicker);
  });
  async function load(files: File[]) {
    if (busy) return;
    setBusy(true); setError('');
     try { const next = await importer.files(files, { upAxis, scale }, setStatus); setAssets(old => [...old, ...next]); setPositions(old => [...old, ...next.map((_, index) => [(assets.length + index) * 1.25, 0, 0] as Vec3)]); setSelected(assets.length); setStatus(`Imported ${next.length} asset(s)`); }
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
           setAssets(old => [...old, ...next]); setPositions(old => [...old, ...next.map((_, index) => [(assets.length + index) * 1.25, 0, 0] as Vec3)]); setSelected(assets.length); setStatus(`Forma ${mode} project imported`); break;
        }
      }
    } catch (e) { setError((e as Error).message); setStatus('Generation failed'); }
    finally { setBusy(false); }
  }
  const asset = assets[selected];
  const workspace = <aside id="workspace-panel" className={isFullscreen ? 'fullscreen-workspace' : ''} hidden={isFullscreen && !workspaceVisible}><div className="eyebrow">WORKSPACE</div><h1>Make room<br />for your ideas.</h1><p>Bring hardware into context. Import a Forma project or STEP model to explore it at real-world scale.</p>
        <input ref={input} aria-label="Import files" type="file" accept=".json,.step,.stp" multiple hidden onChange={e => { finishFilePicker(); void load(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <button className="import" disabled={busy} onClick={openFilePicker}>↑ Drop files or browse<br /><small>FORMA JSON · STEP · STP</small></button>
        <details><summary>STEP import settings</summary><label>Source up axis<select value={upAxis} onChange={e => setUpAxis(e.target.value as 'Y' | 'Z')}><option>Z</option><option>Y</option></select></label><label>Scale correction<input type="number" min="0.000001" value={scale} onChange={e => setScale(Number(e.target.value))} /></label><p>STEP units are read automatically. Correction multiplies the physical size.</p></details>
        <section><div className="eyebrow">ROOM / METERS</div><div className="dimensions">{['Width', 'Depth', 'Height'].map((name, i) => <label key={name}>{name}<input aria-label={name} type="number" min="1" max="100" step=".5" value={room[i]} onChange={e => { const n = Number(e.target.value); if (n >= 1 && n <= 100) setRoom(old => old.map((v, j) => i === j ? n : v)); }} /></label>)}</div><button onClick={() => setSelected(-1)}>View entire room</button></section>
         <section><div className="eyebrow">SCENE COLLECTION <span>{assets.length}</span></div>{!assets.length && <p>Your room is a blank canvas.</p>}{assets.map((a, i) => <button className={`asset ${i === selected ? 'active' : ''}`} key={`${a.id}-${i}`} onClick={() => { setSelected(i); setSelectedPart(-1); }}><span>◇ {a.name}</span><small>{a.source.kind.toUpperCase()} · {a.parts.length} components</small></button>)}</section>
        {import.meta.env.VITE_FORMA_GENERATION_ENABLED !== 'false' && <details><summary>Build with Forma</summary><textarea aria-label="Project description" value={prompt} onChange={e => setPrompt(e.target.value)} /><label>Generation mode<select value={mode} onChange={e => setMode(e.target.value)}><option value="simulation">Deterministic demo</option><option value="live">Live generation</option></select></label>{mode === 'live' && <><label>Provider<input value={provider} onChange={e => setProvider(e.target.value)} /></label><label>Model<input value={model} onChange={e => setModel(e.target.value)} /></label><p>Set provider credentials in the server’s .env file.</p></>}<button disabled={busy} onClick={() => void generate()}>Build and import →</button></details>}
         {assets.length > 0 && <section><div className="eyebrow">LAYOUT / METERS</div><p>Place each set piece using its floor position. Y raises an asset above the floor.</p>{assets.map((a, i) => <fieldset className="placement" key={`placement-${a.id}-${i}`}><legend>{a.name}</legend><div className="dimensions">{(['X', 'Y', 'Z'] as const).map((axis, axisIndex) => <label key={axis}>{axis}<input aria-label={`${a.name} ${axis} position`} type="number" step=".1" value={positions[i]?.[axisIndex] ?? 0} onChange={e => { const value = Number(e.target.value); if (!Number.isFinite(value)) return; setPositions(old => old.map((position, positionIndex) => positionIndex === i ? position.map((coordinate, coordinateIndex) => coordinateIndex === axisIndex ? value : coordinate) as Vec3 : position)); }} /></label>)}</div><button type="button" onClick={() => setPositions(old => old.map((position, positionIndex) => positionIndex === i ? [i * (a.dimensions[0] + .25), 0, 0] : position))}>Reset position</button></fieldset>)}</section>}
      </aside>;
  return <><header className="app-header"><div className="brand"><span className="logo">A</span> ASTRA <span className="muted">INDUSTRIES</span></div><span className="tag">SPATIAL WORKBENCH / 001</span><AuthControls beforeSignIn={() => preserveAuthWorkspace(assets, room, selected, positions)} /><button disabled={busy} onClick={openFilePicker}>+ Import project</button></header>
    <main onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void load(Array.from(e.dataTransfer.files)); }}>
      {isFullscreen && stage.current ? createPortal(workspace, stage.current) : workspace}
      <div ref={stage} className={`stage${expanded ? ' stage-expanded' : ''}`}>
        <div className="stage-label"><span className="dot" /> PERSPECTIVE VIEW <span>1:1 / METERS</span></div>
        {isFullscreen && <button className="workspace-toggle" aria-controls="workspace-panel" aria-expanded={workspaceVisible} onClick={() => setWorkspaceVisible(value => !value)}>{workspaceVisible ? 'Hide workspace' : 'Show workspace'}</button>}
        <button className="fullscreen-toggle" aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-pressed={isFullscreen} title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Expand 3D viewer'} onClick={() => void toggleFullscreen()}>{isFullscreen ? '↙ Exit fullscreen' : '⛶ Fullscreen'}</button>
        <button className="capture-launch" aria-expanded={captureOpen} onClick={() => setCaptureOpen(value => !value)}>GIF studio</button>
         <Viewer assets={assets} room={room} selected={selected} selectedPart={selectedPart} positions={positions} onSelectPart={(assetIndex, partIndex) => { setSelected(assetIndex); setSelectedPart(partIndex); }} region={captureRegion} />
        <CaptureTools open={captureOpen} assets={assets} room={room} selected={selected} close={() => setCaptureOpen(false)} onRegion={setCaptureRegion} addAsset={asset => { setAssets(old => [...old, asset]); setPositions(old => [...assets.map((_, index) => old[index] ?? [index * 1.25, 0, 0] as Vec3), [assets.length * 1.25, 0, 0]]); setSelected(assets.length); setStatus(`Added ${asset.name} from library`); }} />
        <div className="hint">Drag to orbit · Right-drag to pan · Scroll to zoom · Select an asset to frame</div>
      </div>
     <aside className="inspector"><div className="eyebrow">INSPECTOR</div>{asset ? <><h2>{asset.name}</h2><span className="badge">{asset.source.kind.toUpperCase()}</span><h3>Dimensions</h3><p>{asset.dimensions.map(n => n.toFixed(3)).join(' × ')} m<br /><small>Width × height × depth</small></p><h3>Source</h3><p className="wrap">{asset.source.filename}<br />{asset.source.version && `Version ${asset.source.version}`}</p>{asset.warnings.map(w => <p className="notice" key={w}>{w}</p>)}<h3>Components</h3>{asset.parts.map((part, partIndex) => <details key={part.id} open={partIndex === selectedPart}><summary><button className="part-select" onClick={() => { setSelected(selected); setSelectedPart(partIndex); }}>{part.name}</button></summary>{Object.entries(part.metadata).filter(([, v]) => v).map(([key, value]) => <p key={key}><b>{key}</b>: {value}</p>)}</details>)}</> : <><h2>A space for<br />what’s next.</h2><p>Select an imported asset to inspect its dimensions, parts, and source.</p><div className="room-stat">{room[0] * room[1]}<small>m² floor area</small></div></>}</aside>
    </main><footer><span role="status">{busy ? '◌ ' : '● '}{status}</span><span>FORMA POWERED · LOCAL FIRST</span></footer>{error && <div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}</>;
}
createRoot(document.getElementById('root')!).render(<App />);
