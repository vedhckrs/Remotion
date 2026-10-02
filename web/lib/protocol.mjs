export const validPackage=id=>typeof id==='string' && (id==='@root'||/^[a-zA-Z0-9_-]{1,100}(\/[a-zA-Z0-9_-]{1,100})?$/.test(id));
export const validId=id=>typeof id==='string' && (id==='@root'||/^[a-zA-Z0-9_-]{1,100}$/.test(id));
export function localRequest(command) {
  if (!command || typeof command!=='object') throw new Error('Invalid command');
  switch(command.action) {
    case 'state': return {method:'GET',path:'/api/state'};
    case 'packages': return {method:'GET',path:'/api/library'};
    case 'details': if(validPackage(command.id)) return {method:'GET',path:'/api/library/details?id='+encodeURIComponent(command.id)}; break;
    case 'render': {
      if (!validPackage(command.id) || !Array.isArray(command.videos)||!command.videos.length||command.videos.length>20||!command.videos.every(id=>validId(id)&&id!=='@root')) break;
      // Remote render never calls paid voice/music APIs or accepts filesystem paths.
      return {method:'POST',path:'/api/library/run',body:{id:command.id,videos:command.videos,voice:false,music:false,stills:false,render:true,draft:command.draft===true,fourK:command.fourK===true,force:false}};
    }
    case 'cancel': if(Number.isSafeInteger(command.id)&&command.id>0) return {method:'POST',path:`/api/jobs/${command.id}/cancel`,body:{}}; break;
  }
  throw new Error('Unsupported command or invalid arguments');
}
export const validRequestId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
