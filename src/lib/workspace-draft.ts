import {loadScene,saveScene} from './scene-storage';
import {emptyWorkspace,hydrateManifest,makeManifest,missingAsset,readManifest,type Workspace} from './workspace';
import type {SavedScene} from './scene-repository';

export async function saveWorkspaceDraft(workspace:Workspace,owner:string|null,cloudScene:SavedScene|null=null){
  const document=makeManifest(workspace);readManifest(document);
  await saveScene({schemaVersion:1,id:'active-scene',source:{},room:{width:workspace.room[0],depth:workspace.room[1],height:workspace.room[2]},
    instances:workspace.items.map(({id,name,asset,position,rotation,visible})=>({id,name,assetId:asset.id,position,rotation,visible})),workspaceDocument:document,activeCloudScene:cloudScene?.owner_id===owner?cloudScene:null},
    workspace.items.filter(item=>!item.missing).map(item=>item.asset),owner??'guest');
}
export async function loadWorkspaceDraft(owner:string|null):Promise<{workspace:Workspace;scene:SavedScene|null}|null>{
  const stored=await loadScene(owner??'guest')??(!owner?await loadScene():undefined);
  if(!stored)return null;
  if(stored.scene.workspaceDocument)return {workspace:hydrateManifest(readManifest(stored.scene.workspaceDocument),stored.assets),scene:stored.scene.activeCloudScene?.owner_id===owner?stored.scene.activeCloudScene:null};
  // Compatibility with the scene format merged in #38/#39. Preserve every
  // occurrence of shared geometry and its instance identity, not a deduped list.
  const byId=new Map(stored.assets.map(asset=>[asset.id,asset]));const workspace=emptyWorkspace();
  workspace.room=[stored.scene.room.width,stored.scene.room.depth,stored.scene.room.height];
  workspace.items=stored.scene.instances.map(instance=>({id:instance.id,name:instance.name,position:instance.position,rotation:instance.rotation,visible:instance.visible,
    asset:byId.get(instance.assetId)??missingAsset({id:instance.assetId,name:instance.name,dimensions:[1,1,1],source:{kind:'forma',filename:'Missing legacy source',digest:'unknown'}}),missing:!byId.has(instance.assetId)}));
  if(stored.scene.animation){
    workspace.animation.duration=Math.max(.5,stored.scene.animation.durationSeconds);
    workspace.animation.tracks=stored.scene.animation.tracks.filter(track=>track.keyframes.length).map(track=>{
      const item=workspace.items.find(i=>i.id===track.instanceId)!;let position=item.position,rotation=item.rotation;
      return{id:`${track.instanceId}:instance`,instanceId:track.instanceId,keys:track.keyframes.map(key=>{position=key.position??position;rotation=key.rotation??rotation;return{id:crypto.randomUUID(),time:key.timeSeconds,position,rotation};})};
    });
  }
  return {workspace,scene:null};
}
