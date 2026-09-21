const ENDPOINT = "http://127.0.0.1:43117/v2/dashboard";
const POLL_MS = 5000;
let data = null;
let currentView = "overview";
let lastError = null;

function q(s){ return document.querySelector(s); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c];}); }
function parseTime(v){ return v ? new Date(v).getTime() : NaN; }
function ageText(v){
  var t=parseTime(v); if(!Number.isFinite(t)) return "unknown time";
  var s=Math.max(0,Math.round((Date.now()-t)/1000));
  if(s<60) return s+"s ago";
  if(s<3600) return Math.floor(s/60)+"m ago";
  if(s<86400) return Math.floor(s/3600)+"h ago";
  return Math.floor(s/86400)+"d ago";
}
function fmtTime(v){ var t=parseTime(v); return Number.isFinite(t)?new Date(t).toLocaleString():"unknown"; }
function intervalText(s){
  if(!s) return "one-shot";
  if(s%86400===0) return "every "+(s/86400)+"d";
  if(s%3600===0) return "every "+(s/3600)+"h";
  if(s%60===0) return "every "+(s/60)+"m";
  return "every "+s+"s";
}
function effectiveFact(f){
  if(!f) return {state:"unknown"};
  if(f.state!=="known") return f;
  var t=parseTime(f.observed_at);
  if(!Number.isFinite(t)) return Object.assign({},f,{state:"stale"});
  if(Number.isFinite(f.max_age_s) && (Date.now()-t)/1000>f.max_age_s) return Object.assign({},f,{state:"stale"});
  return f;
}
function factCard(label,key){
  var f=effectiveFact(data && data.facts ? data.facts[key] : null);
  var shown=f.state==="known"?f.value:"—";
  return '<div class="metric '+esc(f.state)+'"><div class="label">'+esc(label)+'</div><div class="value">'+esc(shown)+'</div><div class="state">'+esc(String(f.state||"unknown").toUpperCase())+(f.kind==="derived"?" · DERIVED":"")+'</div><div class="source" title="'+esc(f.source)+'">'+esc(f.source||"no proof source")+'</div></div>';
}
function setLink(state,text){
  var el=q("#link-state"); el.className="link-state "+state; el.innerHTML="<span></span>"+esc(text);
}
function setBanner(message){
  var b=q("#global-banner");
  if(!message){ b.classList.add("hidden"); b.textContent=""; return; }
  b.classList.remove("hidden"); b.textContent=message;
}
function unknownBox(title,body){ return '<div class="unknown-box"><strong>'+esc(title)+'</strong>'+esc(body)+'</div>'; }
function viewMeta(v){
  var map={
    overview:["The House","What exists, what is happening, and what is not known."],
    agents:["Agents","Durable House agents, their bindings, schedules, and latest observed execution."],
    projects:["Projects","Canonical project and operational-domain classifications, including explicit unknowns."],
    schedules:["Schedules","Durable wakes known to Mecha Runtime. Disabled is not the same thing as absent."],
    activity:["Activity","Recent observed runs. History is evidence, not proof that work is still active."],
    proof:["Proof","Every source, claim, blind spot, and truth rule behind the display."]
  };
  return map[v];
}
function render(){
  var m=viewMeta(currentView); q("#view-title").textContent=m[0]; q("#view-subtitle").textContent=m[1];
  document.querySelectorAll(".nav").forEach(function(b){b.classList.toggle("active",b.dataset.view===currentView);});
  if(!data){ q("#content").innerHTML=unknownBox("Current House state unavailable","No last-known values are being retained as current. Restore the local truth link to see live state."); return; }
  var views={overview:renderOverview,agents:renderAgents,projects:renderProjects,schedules:renderSchedules,activity:renderActivity,proof:renderProof};
  q("#content").innerHTML=views[currentView]();
}
function renderOverview(){
  var attention=data.attention||[], claims=data.claims||[];
  var att=attention.length?attention.map(function(a){
    return '<div class="attention-item"><span class="sev '+esc(a.severity)+'"></span><div><div class="item-title">'+esc(a.title)+'</div><div class="item-sub">'+esc(a.summary)+'</div></div><div class="item-meta">'+esc(a.kind)+'<br>'+esc(ageText(a.observed_at))+'</div></div>';
  }).join(""):'<div class="empty">No observed attention items in the current receipt.</div>';
  var coverage=(data.coverage&&data.coverage.blind_spots)||[];
  var cov=coverage.length?coverage.map(function(x){
    return '<div class="rowitem"><span class="sev warning"></span><div><div class="item-title">'+esc(x.title)+'</div><div class="item-sub">'+esc(x.reason)+'</div></div><div class="item-meta">'+esc(x.source)+'</div></div>';
  }).join(""):'<div class="empty">No declared blind spots.</div>';
  var cs=claims.map(function(c){
    return '<div class="claim '+esc(c.verdict)+'"><div class="claim-top"><span class="claim-title">'+esc(c.title)+'</span><span class="verdict">'+esc(String(c.verdict).toUpperCase())+'</span></div><p>'+esc(c.summary)+'</p><small>'+esc(c.method)+' · '+esc(ageText(c.proved_at))+'</small></div>';
  }).join("");
  return '<div class="truth-note"><div><strong>Truth lease:</strong> zero requires observation; missing never becomes zero; stale never stays current.</div><code>'+esc(data.schema)+'</code></div>'+
    '<div class="metrics">'+factCard("Durable agents","durable_agents")+factCard("Tasks","tasks")+factCard("Active leases","active_leases")+factCard("Enabled schedules","enabled_schedules")+factCard("Bindings","conversation_bindings")+factCard("Needs Katherine","human_gates")+'</div>'+
    '<div class="section-grid"><section class="panel"><div class="panel-head"><h2>Attention</h2><span>'+attention.length+' observed</span></div><div class="panel-body">'+att+'</div></section>'+
    '<section class="panel"><div class="panel-head"><h2>Coverage</h2><span>'+coverage.length+' blind spots</span></div><div class="panel-body">'+cov+'</div></section></div>'+
    '<section class="panel" style="margin-top:14px"><div class="panel-head"><h2>System claims</h2><span>green = fresh direct proof of exactly the named claim</span></div><div class="claims">'+cs+'</div></section>';
}
function renderAgents(){
  if(!Array.isArray(data.agents)) return unknownBox("Agent inventory unknown","The Mecha agents source did not produce a current list.");
  var rows=data.agents.map(function(a){
    var lr=a.last_run, activity=(a.activity&&a.activity.state)||"unknown";
    var last=lr?'<span class="chip '+esc(lr.status)+'">'+esc(lr.status)+'</span><span class="secondary">'+esc(lr.trigger||"")+' · '+esc(ageText(lr.completed_at||lr.started_at||lr.created_at))+'</span>':'<span class="chip unknown">not observed</span>';
    return '<tr><td><span class="name">'+esc(a.name)+'</span><span class="secondary">'+esc(a.owner||"owner unknown")+'</span></td>'+
      '<td><span class="chip '+esc(activity)+'">'+esc(activity)+'</span><span class="secondary">derived</span></td>'+
      '<td>'+esc(a.active_leases)+'</td><td>'+esc(a.enabled_schedule_count)+'<span class="secondary">'+esc(a.schedule_count)+' total</span></td>'+
      '<td>'+esc(a.binding_count)+'<span class="secondary">'+esc((a.binding_adapters||[]).join(", ")||"none")+'</span></td><td>'+last+'</td></tr>';
  }).join("");
  return '<div class="table-wrap"><div class="table-title"><h2>Durable agents</h2><span>'+data.agents.length+' observed from Mecha Runtime</span></div><table><thead><tr><th>Agent</th><th>Activity</th><th>Leases</th><th>Schedules</th><th>Bindings</th><th>Latest run</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function provenance(p){
  if(!p) return "status provenance absent";
  return (p.sourceKind||"source")+" · "+(p.sourceId||"unknown id")+(p.observedAt?" · "+ageText(p.observedAt):"");
}
function renderProjects(){
  var ps=data.projects||[], ds=data.domains||[];
  var cards=ps.map(function(p){
    return '<article class="entity"><h3>'+esc(p.name)+'</h3><div class="status '+esc(p.status)+'">'+esc(p.status)+'</div><p>'+esc(provenance(p.status_provenance))+'</p><span class="secondary">'+(p.last_meaningful_action?"last meaningful action "+esc(ageText(p.last_meaningful_action)):"no lastMeaningfulAction recorded")+'</span></article>';
  }).join("");
  var rows=ds.map(function(d){
    return '<tr><td class="name">'+esc(d.name)+'</td><td><span class="chip '+esc(String(d.status).toLowerCase())+'">'+esc(d.status)+'</span></td><td class="secondary">'+esc(provenance(d.status_provenance))+'</td></tr>';
  }).join("");
  return '<div class="truth-note"><div><strong>Important:</strong> “Unknown” is rendered as Unknown. It is never promoted to inactive, healthy, or abandoned.</div><code>canonical catalog</code></div>'+
    '<div class="cards">'+cards+'</div><div class="table-wrap"><div class="table-title"><h2>Operational domains</h2><span>'+ds.length+' catalog entries</span></div><table><thead><tr><th>Domain</th><th>Status</th><th>Status provenance</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderSchedules(){
  var ss=data.schedules||[];
  var rows=ss.map(function(s){
    return '<tr><td class="name">'+esc(s.name||s.id)+'</td><td>'+esc(s.agent||"unknown")+'</td><td><span class="chip '+(s.enabled?"active":"unknown")+'">'+(s.enabled?"enabled":"disabled")+'</span></td><td>'+esc(intervalText(s.interval_seconds))+'</td><td>'+(s.next_wake_at?esc(fmtTime(s.next_wake_at))+'<span class="secondary">'+esc(ageText(s.next_wake_at))+'</span>':"—")+'</td></tr>';
  }).join("");
  return '<div class="table-wrap"><div class="table-title"><h2>Durable schedules</h2><span>'+ss.filter(function(s){return s.enabled;}).length+' enabled · '+ss.length+' total</span></div><table><thead><tr><th>Schedule</th><th>Agent</th><th>State</th><th>Cadence</th><th>Next wake</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderActivity(){
  var aa=data.activity||[];
  var rows=aa.map(function(r){
    return '<tr><td class="name">'+esc(r.agent||"unknown")+'</td><td><span class="chip '+esc(r.status)+'">'+esc(r.status||"unknown")+'</span>'+(r.error?'<span class="secondary">'+esc(r.error)+'</span>':"")+'</td><td>'+esc(r.trigger||"unknown")+'</td><td>'+esc(fmtTime(r.started_at||r.created_at))+'</td><td>'+(r.completed_at?esc(fmtTime(r.completed_at))+'<span class="secondary">'+esc(ageText(r.completed_at))+'</span>':"—")+'</td></tr>';
  }).join("");
  return '<div class="table-wrap"><div class="table-title"><h2>Recent runs</h2><span>most recent '+aa.length+'; historical rows are not current activity</span></div><table><thead><tr><th>Agent</th><th>Status</th><th>Trigger</th><th>Started / created</th><th>Completed</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderProof(){
  var src=Object.entries(data.sources||{});
  var blind=(data.coverage&&data.coverage.blind_spots)||[];
  var sources=src.map(function(pair){var k=pair[0],s=pair[1];return '<div class="source-row"><span class="source-dot '+esc(s.state)+'"></span><div><div class="item-title">'+esc(k)+'</div><div class="item-sub">'+esc(s.label)+'</div></div><div class="item-meta">'+esc(s.state)+'<br>'+esc(ageText(s.observed_at))+'</div></div>';}).join("");
  var blinds=blind.map(function(x){return '<div class="rowitem"><span class="sev warning"></span><div><div class="item-title">'+esc(x.title)+'</div><div class="item-sub">'+esc(x.reason)+'</div></div><div class="item-meta">'+esc(x.source)+'</div></div>';}).join("")||'<div class="empty">No declared blind spots.</div>';
  return '<div class="proof"><section class="panel"><div class="panel-head"><h2>Live sources</h2><span>'+src.length+' probes</span></div><div class="panel-body">'+sources+'</div></section>'+
    '<section class="panel"><div class="panel-head"><h2>Blind spots</h2><span>never silently filled</span></div><div class="panel-body">'+blinds+'</div></section></div>'+
    '<section class="panel" style="margin-top:14px"><div class="panel-head"><h2>Truth policy</h2><span>mechanical invariants</span></div><div class="panel-body"><pre>'+esc(JSON.stringify(data.truth_policy,null,2))+'</pre></div></section>'+
    '<details class="panel" style="margin-top:14px"><summary class="panel-head"><h2>Raw current receipt</h2><span>inspect what the UI received</span></summary><div class="panel-body"><pre>'+esc(JSON.stringify(data,null,2))+'</pre></div></details>';
}
async function load(){
  q("#refresh").disabled=true;
  try{
    var req=new Request(ENDPOINT,{method:"GET",mode:"cors",cache:"no-store",targetAddressSpace:"loopback"});
    var res=await fetch(req);
    if(!res.ok) throw new Error("HTTP "+res.status);
    var next=await res.json();
    if(!next || next.ok!==true || next.schema!=="house.atlas-dashboard.v1") throw new Error("unexpected truth schema");
    data=next; lastError=null; setLink("live","LIVE LOCAL");
    q("#freshness").textContent="receipt "+ageText(next.generated_at)+" · "+((next.runtime_health&&next.runtime_health.freshness)||"runtime freshness unknown");
    setBanner(null); render();
  }catch(err){
    data=null; lastError=String((err&&err.message)||err); setLink("bad","LOCAL LINK DOWN");
    q("#freshness").textContent="no current proof";
    setBanner("Current House data is unavailable ("+lastError+"). Last-known numbers have been cleared rather than presented as current.");
    render();
  }finally{ q("#refresh").disabled=false; }
}
q("#nav").addEventListener("click",function(e){var b=e.target.closest("[data-view]");if(!b)return;currentView=b.dataset.view;render();});
q("#refresh").addEventListener("click",load);
load();
setInterval(load,POLL_MS);
document.addEventListener("visibilitychange",function(){if(!document.hidden)load();});
