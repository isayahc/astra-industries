import { useEffect,useRef,useState } from 'react';
import { cloudStorageEnabled,connectUserClient } from '../lib/cloud-session';
import { SceneRepository,type SavedScene,type AssetRow } from '../lib/scene-repository';
import { listLibrary } from '../lib/library';
import { canonicalJSON,emptyWorkspace,makeManifest,type Workspace } from '../lib/workspace';

export function SceneControls({workspace,owner,current,setCurrent,replace,busy,setBusy,onExport}: {
  workspace:Workspace;owner:string|null;current:SavedScene|null;setCurrent:(value:SavedScene|null)=>void;
  replace:(workspace:Workspace)=>void;busy:boolean;setBusy:(busy:boolean)=>void;onExport:()=>void;
}) {
  const [name,setName]=useState(current?.name??'Untitled room');
  const [scenes,setScenes]=useState<SavedScene[]>([]);const[catalog,setCatalog]=useState<AssetRow[]>([]);
  const[message,setMessage]=useState('');const[error,setError]=useState('');
  const[upload,setUpload]=useState(cloudStorageEnabled);
  const epoch=useRef(0);const operation=useRef(0);const active=useRef(true);
  useEffect(()=>{setName(current?.name??'Untitled room');},[current?.id]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;epoch.current++;};},[]);
  useEffect(()=>{
    const token=++epoch.current;setScenes([]);setCatalog([]);setError('');setMessage('');if(!owner)return;
    void connectUserClient(owner).then(async client=>{const repo=new SceneRepository(client,owner,cloudStorageEnabled);const rows=await repo.list();if(active.current&&token===epoch.current)setScenes(rows);}).catch(e=>{if(active.current&&token===epoch.current)setError(e.message);});
  },[owner]);
  const valid=(token:number)=>active.current&&token===epoch.current;
  async function run(work:(repo:SceneRepository,token:number)=>Promise<void>){
    if(!owner||busy)return;const token=++operation.current;const sessionEpoch=epoch.current;setBusy(true);setError('');
    try{await work(new SceneRepository(await connectUserClient(owner),owner,cloudStorageEnabled),token);}
    catch(e){if(active.current&&sessionEpoch===epoch.current&&token===operation.current)setError((e as Error).message);}
    finally{if(active.current&&sessionEpoch===epoch.current&&token===operation.current)setBusy(false);}
  }
  function confirmSwitch(action:string){return !dirty||window.confirm(`This room has unsaved changes. ${action} and discard them?`);}
  function openScene(scene:SavedScene){
    if(!confirmSwitch('Open this room'))return;
    void run(async(repo,token)=>{const local=await listLibrary();const result=await repo.open(scene.id,[...workspace.items.filter(i=>!i.missing).map(i=>i.asset),...local.map(e=>e.asset)],text=>{if(valid(token))setMessage(text);});if(!valid(token))return;replace(result.workspace);setCurrent(result.scene);setName(result.scene.name);setMessage(result.workspace.items.some(i=>i.missing)?'Scene opened with missing geometry. Reimport matching source files.':'Cloud scene opened.');});
  }
  function duplicateScene(scene:SavedScene){void run(async(repo,token)=>{const duplicate=await repo.duplicate(scene,`${scene.name} copy`);const local=await listLibrary();const result=await repo.open(duplicate.id,[...workspace.items.filter(i=>!i.missing).map(i=>i.asset),...local.map(e=>e.asset)],()=>{});if(!valid(token))return;replace(result.workspace);setCurrent(result.scene);setName(result.scene.name);setScenes(await repo.list());setMessage('Room duplicated.');});}
  function deleteScene(scene:SavedScene){if(!window.confirm(`Delete ${scene.name}? Shared geometry and other rooms remain.`))return;void run(async(repo,token)=>{await repo.remove(scene);const rows=await repo.list();if(valid(token)){setScenes(rows);if(current?.id===scene.id){setCurrent(null);replace(emptyWorkspace());setName('Untitled room');}setMessage('Room deleted; shared cloud files retained.');}});}
  const dirty=current?canonicalJSON(current.document)!==canonicalJSON(makeManifest(workspace))||current.name!==name.trim():true;
  return <section aria-label="Scene persistence">
    <div className="eyebrow">SCENES / POSTGRES</div>
    <p>{current?`Cloud revision ${current.revision} · ${dirty?'Unsaved changes':'Saved'}`:'Local workspace · not saved to cloud'}</p>
    <button disabled={busy} onClick={onExport}>Export scene JSON</button>
    {!owner?<p>Sign in to save scenes and library metadata across devices. You can export/import scene JSON locally.</p>:<>
      <label>Scene name<input aria-label="Scene name" value={name} disabled={busy} maxLength={200} onChange={e=>setName(e.target.value)}/></label>
      <label className="inline-check"><input aria-label="Include cloud geometry" type="checkbox" checked={upload&&cloudStorageEnabled} disabled={busy||!cloudStorageEnabled} onChange={e=>setUpload(e.target.checked)}/> Include cloud geometry</label>
      <p>{cloudStorageEnabled?'Saving with geometry uploads the referenced assets for use on other devices.':'Storage is disabled. Metadata-only scenes can still be saved; geometry must be reimported on other devices.'}</p>
      <div className="capture-actions"><button disabled={busy||!name.trim()} onClick={()=>void run(async(repo,token)=>{
        const id=current?.id??crypto.randomUUID();
        const result=await repo.save(workspace,name,id,current?.revision??0,upload&&cloudStorageEnabled,text=>{if(valid(token))setMessage(text);});
        if(!valid(token))return;replace(result.workspace);setCurrent(result.scene);setMessage('Scene saved to Postgres.');setScenes(await repo.list());
      })}>Save cloud scene</button><button disabled={busy} onClick={()=>{if(!confirmSwitch('Create a new room'))return;replace(emptyWorkspace());setCurrent(null);setName('Untitled room');setMessage('New room ready.');}}>New room</button><button disabled={busy||!current} onClick={()=>{if(!confirmSwitch('Create a copy'))return;setCurrent(null);setName(`${name} copy`);setMessage('Copy ready to save as a new room.');}}>Save as new copy</button><button disabled={busy} onClick={()=>void run(async(repo,token)=>{const rows=await repo.list();if(valid(token))setScenes(rows);})}>Refresh scenes</button></div>
      {scenes.map(scene=><div className={`saved-scene ${current?.id===scene.id?'active-scene':''}`} key={scene.id}><span><b>{scene.name}</b><br/><small>Revision {scene.revision} · {new Date(scene.updated_at).toLocaleString()}</small></span><div className="capture-actions"><button disabled={busy} aria-label={`Open scene ${scene.name}`} onClick={()=>openScene(scene)}>Open</button><button disabled={busy} aria-label={`Duplicate scene ${scene.name}`} onClick={()=>duplicateScene(scene)}>Duplicate</button><button disabled={busy} aria-label={`Delete scene ${scene.name}`} onClick={()=>deleteScene(scene)}>Delete</button></div></div>)}
      <details><summary>Cloud library metadata</summary><p>Explicitly sync the device library catalog through Postgres. This does not upload binary geometry or GIFs.</p><div className="capture-actions"><button disabled={busy} onClick={()=>void run(async(repo,token)=>{const local=await listLibrary();await repo.saveMetadata(local.map(e=>e.asset));const rows=await repo.catalog();if(valid(token)){setCatalog(rows);setMessage('Library metadata synced.');}})}>Sync library metadata</button><button disabled={busy} onClick={()=>void run(async(repo,token)=>{const rows=await repo.catalog();if(valid(token))setCatalog(rows);})}>Refresh asset metadata</button></div>{catalog.map(asset=><p key={asset.id}><b>{asset.name}</b><br />{asset.source_kind} · {asset.metadata.dimensions?.join(' × ')} m<br /><small>Use Cloud files to retrieve geometry, or reimport the matching source.</small></p>)}</details>
    </>}
    <p role="status" aria-label="Scene save status">{busy?'Working… ':''}{message}</p>
    {error&&<p role="alert" className="capture-error">{error}</p>}
  </section>;
}
