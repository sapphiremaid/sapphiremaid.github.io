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
  var shown=f.state==="known"?f.value:"\u2014";
  var state=String(f.state||"unknown");
  var stateLabel=state==="known"?"current":state==="error"?"unavailable":state;
  var note=f.kind==="derived"?" \u00b7 derived":"";
  return '<div class="metric '+esc(state)+'"><div class="label">'+esc(label)+'</div><div class="value">'+esc(shown)+'</div><div class="state">'+esc(stateLabel+note)+'</div></div>';
}
function setBanner(message){
  var b=q("#global-banner");
  if(!message){ b.classList.add("hidden"); b.textContent=""; return; }
  b.classList.remove("hidden"); b.textContent=message;
}
function unknownBox(title,body){ return '<div class="unknown-box"><strong>'+esc(title)+'</strong>'+esc(body)+'</div>'; }
function viewMeta(v){
  var map={
    overview:["House","What needs attention and what changed."],
    agents:["Agents","Agents, bindings, schedules, and latest runs."],
    projects:["Projects","Current project and operational-domain status."],
    schedules:["Schedules","Scheduled work and its next wake."],
    activity:["Activity","Recent runs."],
    proof:["Sources","Where the data comes from and what is unavailable."]
  };
  return map[v];
}
function render(){
  var m=viewMeta(currentView); q("#view-title").textContent=m[0]; q("#view-subtitle").textContent=m[1];
  document.querySelectorAll(".nav").forEach(function(b){b.classList.toggle("active",b.dataset.view===currentView);});
  if(!data){ q("#content").innerHTML=unknownBox("Live House data unavailable","Current values are hidden until the local data link is available again."); return; }
  var views={overview:renderOverview,agents:renderAgents,projects:renderProjects,schedules:renderSchedules,activity:renderActivity,proof:renderProof};
  q("#content").innerHTML=views[currentView]();
}
function humanizeAttention(a){
  var title=String(a.title||"Needs attention");
  var summary=String(a.summary||"");
  if(summary.indexOf("conversation binding unavailable for prompt-bearing wake")>=0){
    return {title:"Browser conversation unavailable",summary:"Browser-backed work could not start."};
  }
  if(summary.indexOf("automatic conversation binding provisioning failed")>=0){
    return {title:"Browser binding repair failed",summary:"Automatic repair timed out."};
  }
  return {title:title,summary:summary};
}
function groupedAttention(items){
  var groups=[];
  var byKey={};
  (items||[]).forEach(function(a){
    var h=humanizeAttention(a);
    var key=String(a.severity||"")+"|"+h.title+"|"+h.summary;
    if(!byKey[key]){
      byKey[key]={severity:a.severity||"",title:h.title,summary:h.summary,observed_at:a.observed_at,count:0,names:[]};
      groups.push(byKey[key]);
    }
    var g=byKey[key];
    g.count+=1;
    if(a.title && a.title!==h.title) g.names.push(String(a.title).replace(/ latest run failed$/,""));
    var at=parseTime(a.observed_at), gt=parseTime(g.observed_at);
    if(Number.isFinite(at) && (!Number.isFinite(gt) || at>gt)) g.observed_at=a.observed_at;
  });
  groups.forEach(function(g){
    if(g.count>1){
      g.summary=(g.count+" agents affected")+(g.names.length?": "+g.names.slice(0,4).join(", ")+(g.names.length>4?"\u2026":""):"");
    }
  });
  return groups;
}
function attentionRow(a){
  return '<div class="attention-item"><span class="sev '+esc(a.severity)+'"></span><div><div class="item-title">'+esc(a.title)+'</div><div class="item-sub">'+esc(a.summary)+'</div></div><div class="item-meta">'+esc(ageText(a.observed_at))+'</div></div>';
}
function renderOverview(){
  var attention=groupedAttention(data.attention||[]), claims=data.claims||[];
  var coverage=(data.coverage&&data.coverage.blind_spots)||[];
  var pending=(data.human_gates&&Number.isFinite(data.human_gates.count))?data.human_gates.count:"\u2014";
  var working=Array.isArray(data.agents)?data.agents.filter(function(a){return a.activity&&a.activity.state==="working";}).length:"\u2014";
  var gaps=coverage.length;
  var first=attention.slice(0,6).map(attentionRow).join("");
  var rest=attention.slice(6).map(attentionRow).join("");
  var att=first||'<div class="empty">Nothing currently needs attention.</div>';
  if(rest) att+='<details class="more-list"><summary>Show all '+attention.length+'</summary>'+rest+'</details>';
  var cov=coverage.length?coverage.map(function(x){
    return '<div class="rowitem"><span class="sev warning"></span><div><div class="item-title">'+esc(x.title)+'</div><div class="item-sub">'+esc(x.reason)+'</div></div></div>';
  }).join(""):'<div class="empty">No known monitoring gaps.</div>';
  var cs=claims.map(function(c){
    return '<div class="claim '+esc(c.verdict)+'"><span class="claim-title">'+esc(c.title)+'</span><p>'+esc(c.summary)+'</p><span class="verdict">'+esc(String(c.verdict))+'</span><small>observed '+esc(ageText(c.proved_at))+'</small></div>';
  }).join("");
  return '<div class="summary-strip">'+
    '<div class="summary-stat '+(Number(pending)>0?"needs":"")+'"><span>Needs Katherine</span><strong>'+esc(pending)+'</strong></div>'+
    '<div class="summary-stat"><span>Working now</span><strong>'+esc(working)+'</strong></div>'+
    '<div class="summary-stat '+(gaps>0?"gap":"")+'"><span>Monitoring gaps</span><strong>'+esc(gaps)+'</strong></div>'+
    '</div>'+
    '<section class="section primary-section"><div class="section-head"><h2>Needs attention</h2><span>'+attention.length+' current</span></div><div>'+att+'</div></section>'+
    '<section class="section"><div class="section-head"><h2>Monitoring gaps</h2><span>'+coverage.length+'</span></div><div>'+cov+'</div></section>'+
    '<section class="section"><div class="section-head"><h2>Recent checks</h2><span>'+claims.length+'</span></div><div class="claims">'+cs+'</div></section>';
}
function renderAgents(){
  if(!Array.isArray(data.agents)) return unknownBox("Agent inventory unknown","The Mecha agents source did not produce a current list.");
  var rows=data.agents.map(function(a){
    var lr=a.last_run, activity=(a.activity&&a.activity.state)||"unknown";
    var last=lr?'<span class="chip '+esc(lr.status)+'">'+esc(lr.status)+'</span><span class="secondary">'+esc(lr.trigger||"")+' \u00b7 '+esc(ageText(lr.completed_at||lr.started_at||lr.created_at))+'</span>':'<span class="chip unknown">not observed</span>';
    return '<tr><td><span class="name">'+esc(a.name)+'</span><span class="secondary">'+esc(a.owner||"owner unknown")+'</span></td>'+
      '<td><span class="chip '+esc(activity)+'">'+esc(activity)+'</span><span class="secondary">derived</span></td>'+
      '<td>'+esc(a.active_leases)+'</td><td>'+esc(a.enabled_schedule_count)+'<span class="secondary">'+esc(a.schedule_count)+' total</span></td>'+
      '<td>'+esc(a.binding_count)+'<span class="secondary">'+esc((a.binding_adapters||[]).join(", ")||"none")+'</span></td><td>'+last+'</td></tr>';
  }).join("");
  return '<div class="table-wrap"><div class="table-title"><h2>Durable agents</h2><span>'+data.agents.length+' observed from Mecha Runtime</span></div><table><thead><tr><th>Agent</th><th>Activity</th><th>Leases</th><th>Schedules</th><th>Bindings</th><th>Latest run</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function provenance(p){
  if(!p) return "status provenance absent";
  return (p.sourceKind||"source")+" \u00b7 "+(p.sourceId||"unknown id")+(p.observedAt?" \u00b7 "+ageText(p.observedAt):"");
}
function renderProjects(){
  var ps=data.projects||[], ds=data.domains||[];
  var cards=ps.map(function(p){
    return '<article class="entity"><h3>'+esc(p.name)+'</h3><div class="status '+esc(p.status)+'">'+esc(p.status)+'</div><p>'+esc(provenance(p.status_provenance))+'</p><span class="secondary">'+(p.last_meaningful_action?"last meaningful action "+esc(ageText(p.last_meaningful_action)):"no lastMeaningfulAction recorded")+'</span></article>';
  }).join("");
  var rows=ds.map(function(d){
    return '<tr><td class="name">'+esc(d.name)+'</td><td><span class="chip '+esc(String(d.status).toLowerCase())+'">'+esc(d.status)+'</span></td><td class="secondary">'+esc(provenance(d.status_provenance))+'</td></tr>';
  }).join("");
  return '<div class="cards">'+cards+'</div><div class="table-wrap"><div class="table-title"><h2>Operational domains</h2><span>'+ds.length+' catalog entries</span></div><table><thead><tr><th>Domain</th><th>Status</th><th>Status provenance</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderSchedules(){
  var ss=data.schedules||[];
  var rows=ss.map(function(s){
    return '<tr><td class="name">'+esc(s.name||s.id)+'</td><td>'+esc(s.agent||"unknown")+'</td><td><span class="chip '+(s.enabled?"active":"unknown")+'">'+(s.enabled?"enabled":"disabled")+'</span></td><td>'+esc(intervalText(s.interval_seconds))+'</td><td>'+(s.next_wake_at?esc(fmtTime(s.next_wake_at))+'<span class="secondary">'+esc(ageText(s.next_wake_at))+'</span>':"\u2014")+'</td></tr>';
  }).join("");
  return '<div class="table-wrap"><div class="table-title"><h2>Durable schedules</h2><span>'+ss.filter(function(s){return s.enabled;}).length+' enabled \u00b7 '+ss.length+' total</span></div><table><thead><tr><th>Schedule</th><th>Agent</th><th>State</th><th>Cadence</th><th>Next wake</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderActivity(){
  var aa=data.activity||[];
  var rows=aa.map(function(r){
    return '<tr><td class="name">'+esc(r.agent||"unknown")+'</td><td><span class="chip '+esc(r.status)+'">'+esc(r.status||"unknown")+'</span>'+(r.error?'<span class="secondary">'+esc(r.error)+'</span>':"")+'</td><td>'+esc(r.trigger||"unknown")+'</td><td>'+esc(fmtTime(r.started_at||r.created_at))+'</td><td>'+(r.completed_at?esc(fmtTime(r.completed_at))+'<span class="secondary">'+esc(ageText(r.completed_at))+'</span>':"\u2014")+'</td></tr>';
  }).join("");
  return '<div class="table-wrap"><div class="table-title"><h2>Recent runs</h2><span>most recent '+aa.length+'; historical rows are not current activity</span></div><table><thead><tr><th>Agent</th><th>Status</th><th>Trigger</th><th>Started / created</th><th>Completed</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderProof(){
  var src=Object.entries(data.sources||{});
  var blind=(data.coverage&&data.coverage.blind_spots)||[];
  var sources=src.map(function(pair){var k=pair[0],s=pair[1];return '<div class="source-row"><span class="source-dot '+esc(s.state)+'"></span><div><div class="item-title">'+esc(k)+'</div><div class="item-sub">'+esc(s.label)+'</div></div><div class="item-meta">'+esc(s.state)+'<br>'+esc(ageText(s.observed_at))+'</div></div>';}).join("");
  var blinds=blind.map(function(x){return '<div class="rowitem"><span class="sev warning"></span><div><div class="item-title">'+esc(x.title)+'</div><div class="item-sub">'+esc(x.reason)+'</div></div><div class="item-meta">'+esc(x.source)+'</div></div>';}).join("")||'<div class="empty">No known coverage gaps.</div>';
  return '<div class="proof"><section class="panel"><div class="panel-head"><h2>Live sources</h2><span>'+src.length+' probes</span></div><div class="panel-body">'+sources+'</div></section>'+
    '<section class="panel"><div class="panel-head"><h2>Gaps</h2><span>not currently covered</span></div><div class="panel-body">'+blinds+'</div></section></div>'+
    '<section class="panel" style="margin-top:14px"><div class="panel-head"><h2>Data rules</h2><span>how current values are handled</span></div><div class="panel-body"><pre>'+esc(JSON.stringify(data.truth_policy,null,2))+'</pre></div></section>'+
    '<details class="panel" style="margin-top:14px"><summary class="panel-head"><h2>Raw response</h2><span>exact data returned by the local bridge</span></summary><div class="panel-body"><pre>'+esc(JSON.stringify(data,null,2))+'</pre></div></details>';
}
async function load(){
  q("#refresh").disabled=true;
  var controller=new AbortController();
  var timer=setTimeout(function(){controller.abort();},12000);
  try{
    var req=new Request(ENDPOINT,{method:"GET",mode:"cors",cache:"no-store",targetAddressSpace:"loopback",signal:controller.signal});
    var res=await fetch(req);
    if(!res.ok) throw new Error("HTTP "+res.status);
    var next=await res.json();
    if(!next || next.ok!==true || next.schema!=="house.atlas-dashboard.v1") throw new Error("unexpected data schema");
    data=next; lastError=null;
    q("#freshness").textContent="Updated "+ageText(next.generated_at);
    setBanner(null); render();
  }catch(err){
    data=null; lastError=String((err&&err.name==="AbortError")?"local data timed out":((err&&err.message)||err));
    q("#freshness").textContent="No current data";
    setBanner("House data is unavailable. Current values are hidden until the local link recovers.");
    render();
  }finally{ clearTimeout(timer); q("#refresh").disabled=false; }
}
q("#nav").addEventListener("click",function(e){var b=e.target.closest("[data-view]");if(!b)return;currentView=b.dataset.view;render();});
q("#refresh").addEventListener("click",load);
load();
setInterval(load,POLL_MS);
document.addEventListener("visibilitychange",function(){if(!document.hidden)load();});
