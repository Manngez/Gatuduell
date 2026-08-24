'use strict';

(() => {
  const config=window.GATDUELL_CONFIG||{};
  const listeners=new Set();
  const hasConfig=Boolean(config.supabaseUrl&&config.supabaseAnonKey&&window.supabase?.createClient);
  const client=hasConfig?window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
  let profileCache=null;

  function emit(event){for(const listener of listeners){try{listener(event);}catch{}}}
  function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
  function isConfigured(){return hasConfig;}

  async function session(){
    if(!client) return null;
    const {data,error}=await client.auth.getSession();
    if(error) throw error;
    return data.session||null;
  }

  async function profile(force=false){
    if(!client) return null;
    if(profileCache&&!force) return profileCache;
    const current=await session();
    if(!current?.user) return null;
    const {data,error}=await client.from('profiles').select('id,display_name,is_premium').eq('id',current.user.id).maybeSingle();
    if(error) throw error;
    profileCache=data||{id:current.user.id,display_name:current.user.user_metadata?.display_name||current.user.email?.split('@')[0]||'Spelare',is_premium:false};
    return profileCache;
  }

  async function signUp(email,password,displayName){
    if(!client) throw new Error('Online-backend är inte konfigurerad ännu.');
    const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name:displayName||email.split('@')[0]}}});
    if(error) throw error;
    profileCache=null;
    emit({type:'auth'});
    return data;
  }

  async function signIn(email,password){
    if(!client) throw new Error('Online-backend är inte konfigurerad ännu.');
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error) throw error;
    profileCache=null;
    await profile(true).catch(()=>null);
    emit({type:'auth'});
    return data;
  }

  async function signOut(){
    if(!client) return;
    const {error}=await client.auth.signOut();
    if(error) throw error;
    profileCache=null;
    emit({type:'auth'});
  }

  async function updateDisplayName(displayName){
    if(!client) throw new Error('Online-backend är inte konfigurerad ännu.');
    const current=await session();
    if(!current?.user) throw new Error('Logga in först.');
    const {error}=await client.from('profiles').update({display_name:String(displayName||'').trim()}).eq('id',current.user.id);
    if(error) throw error;
    profileCache=null;
    const result=await profile(true);
    emit({type:'profile',profile:result});
    return result;
  }

  async function recordMatch(payload={}){
    if(!client) return {skipped:true,reason:'not-configured'};
    const current=await session();
    if(!current?.user) return {skipped:true,reason:'not-signed-in'};
    const {error}=await client.rpc('record_gatduell_match',{
      p_city_slug:String(payload.citySlug||'umea'),
      p_won:Boolean(payload.won),
      p_player_score:Number(payload.playerScore)||0,
      p_opponent_score:Number(payload.opponentScore)||0,
      p_difficulty:String(payload.difficulty||'hard'),
      p_opponent_name:String(payload.opponentName||'Motståndare').slice(0,40)
    });
    if(error) throw error;
    return {ok:true};
  }

  async function globalLeaderboard(citySlug='umea',limit=50){
    if(!client) return [];
    const {data,error}=await client
      .from('leaderboard_entries')
      .select('city_slug,wins,matches,points,updated_at,profiles(display_name)')
      .eq('city_slug',citySlug)
      .order('points',{ascending:false})
      .order('wins',{ascending:false})
      .limit(limit);
    if(error) throw error;
    return (data||[]).map(row=>({
      name:row.profiles?.display_name||'Spelare',
      wins:Number(row.wins)||0,
      matches:Number(row.matches)||0,
      points:Number(row.points)||0,
      updatedAt:row.updated_at
    }));
  }

  if(client){
    client.auth.onAuthStateChange(()=>{profileCache=null;emit({type:'auth'});});
  }

  window.GatduellBackend={client,isConfigured,subscribe,session,profile,signUp,signIn,signOut,updateDisplayName,recordMatch,globalLeaderboard,premiumCheckoutUrl:config.premiumCheckoutUrl||''};
})();
