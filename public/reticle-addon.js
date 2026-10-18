/* Reticle client add-on: calls /api/translate and /api/explain, speaks via browser TTS */
(function(){
const LG={en:['English','en-IN'],hi:['हिन्दी','hi-IN'],mr:['मराठी','mr-IN'],gu:['ગુજરાતી','gu-IN'],ta:['தமிழ்','ta-IN'],bn:['বাংলা','bn-IN'],te:['తెలుగు','te-IN'],kn:['ಕನ್ನಡ','kn-IN'],pa:['ਪੰਜਾਬੀ','pa-IN'],ml:['മലയാളം','ml-IN']};
const CASE={condition:"Diabetic retinopathy",confidence:0.87,quality:"Good",findings:[
 {feature:"Vessel dilation pattern",location:"Superior temporal quadrant",confidence:0.87},
 {feature:"Pixel-level irregularity cluster",location:"Temporal periphery",confidence:0.74},
 {feature:"Texture deviation",location:"Macular region",confidence:0.61},
 {feature:"Vessel tortuosity",location:"Inferior arcade",confidence:0.52}]};
const EN=["Your eye health, explained simply.","Your screening shows some areas that may need further clinical review.",
 "Your report in detail","What we found","What to do next","Healthy habits that help","Go to a doctor urgently if","Questions to ask your doctor",
 "The AI looked at the photo of the back of your eye, called the retina. It found 4 small areas that look different from a healthy eye. This is not a diagnosis. Only an eye doctor can tell you what it truly means.",
 "Tiny swelling in small blood vessels near the top of the retina. Doctors look for this as an early sign in people with diabetes.",
 "A small group of spots at the outer edge of the retina that look different from the area around them.",
 "The centre of the retina, which gives sharp vision, looks slightly different. Doctors watch this part closely.",
 "One blood vessel is slightly curved. This is a minor sign.",
 "Please show this report to an eye doctor or your family doctor within the next few weeks. Do not wait for your vision to get worse. Early eye problems often cause no pain and no symptoms.",
 "Keep blood sugar and blood pressure under control. Take your medicines on time. Avoid smoking and tobacco. Eat less sugar and salt. Walk every day. Get your eyes checked once a year.",
 "You see sudden blur, dark spots or floaters, flashes of light, a curtain over your vision, or you suddenly lose sight.",
 "What do these changes mean for my eyes? Do I need more tests? How often should I be checked? Is my sugar or blood pressure affecting my eyes?",
 "🔊 Listen","■ Stop","Translating…","No voice for this language is installed on this device. Try Chrome on Android or Windows."];
const css=document.createElement('style');css.textContent=`
.lang-bar{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:0 0 22px}
.lang-bar button{border:1px solid var(--line);background:var(--paper-raised);color:var(--slate);border-radius:100px;padding:8px 15px;font-size:13.5px;font-weight:600;cursor:pointer}
.lang-bar button.active{background:var(--teal-deep);border-color:var(--teal-deep);color:#fff}
.pr-card{background:var(--paper-raised);border:1px solid var(--line);border-radius:var(--radius-m);padding:26px;margin:0 0 30px;box-shadow:var(--shadow-1)}
.pr-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.pr-head h3{margin:0;font-family:var(--serif);font-size:22px;font-weight:460}
.btn-listen{background:var(--teal-deep);color:#fff;border:none;border-radius:100px;padding:11px 22px;font-size:14.5px;font-weight:600;cursor:pointer}
.btn-listen.on{background:var(--critical)}
.pr-note{font-size:12.5px;color:var(--amber);margin:8px 0 0;min-height:16px}
.pr-sec{border-left:3px solid var(--line);padding:4px 0 4px 18px;margin-top:22px;transition:.2s}
.pr-sec.speaking{border-left-color:var(--teal);background:var(--teal-tint)}
.pr-sec h4{margin:0 0 6px;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--slate-soft);font-family:var(--mono)}
.pr-sec p,.pr-sec li{font-size:16px;line-height:1.7;margin:0 0 6px}.pr-sec ul,.pr-sec ol{margin:0;padding-left:20px}
.pr-sec.warn{border-left-color:var(--critical)}.pr-sec.warn h4{color:var(--critical)}
.aud-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.aud-chips button{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#C7C9CC;border-radius:100px;padding:5px 11px;font-size:11.5px;cursor:pointer}
.aud-chips button.active{background:#EDEEEC;color:var(--ink)}
.aud-card{border:1px solid rgba(255,255,255,.12);border-radius:var(--radius-s);padding:12px 14px;font-size:12.5px;line-height:1.6;color:#DADBD8}
.aud-card b{display:block;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#8D9198;margin:10px 0 3px}.aud-card b:first-child{margin-top:0}`;
document.head.appendChild(css);
async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed ('+r.status+')');return d}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

/* ---- patient ---- */
const synth=window.speechSynthesis;let lang='en',speaking=false,T=EN;const memo={en:EN};
const $=id=>document.getElementById(id);
function stopVoice(){if(synth)synth.cancel();speaking=false;document.querySelectorAll('.pr-sec.speaking').forEach(e=>e.classList.remove('speaking'));const b=$('prListen');if(b){b.classList.remove('on');b.textContent=T[17]}}
function voiceFor(code){if(!synth)return null;const vs=synth.getVoices(),p=code.slice(0,2);return vs.find(v=>v.lang.replace('_','-')===code)||vs.find(v=>v.lang.toLowerCase().startsWith(p))||null}
function speak(){
  if(!synth){$('prNote').textContent='Voice is not supported in this browser.';return}
  if(speaking){stopVoice();return}
  const v=voiceFor(LG[lang][1]),secs=[...document.querySelectorAll('#prBody .pr-sec')];
  $('prNote').textContent=v?'':T[20];speaking=true;$('prListen').classList.add('on');$('prListen').textContent=T[18];let i=0;
  (function next(){if(!speaking||i>=secs.length)return stopVoice();const s=secs[i++];secs.forEach(x=>x.classList.remove('speaking'));s.classList.add('speaking');
    const u=new SpeechSynthesisUtterance(s.innerText.replace(/\n+/g,'. '));u.lang=LG[lang][1];if(v)u.voice=v;u.rate=.9;u.onend=next;u.onerror=stopVoice;synth.speak(u)})();
}
function render(){
  const t=T,qs=t[16].split(/(?<=[?？])\s*/).filter(Boolean);
  $('prTitle').textContent=t[2];$('prListen').textContent=speaking?t[18]:t[17];
  $('prBody').innerHTML=`<div class="pr-sec"><p>${esc(t[8])}</p></div>
   <div class="pr-sec"><h4>${esc(t[3])}</h4><ol>${t.slice(9,13).map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>
   <div class="pr-sec"><h4>${esc(t[4])}</h4><p>${esc(t[13])}</p></div>
   <div class="pr-sec"><h4>${esc(t[5])}</h4><p>${esc(t[14])}</p></div>
   <div class="pr-sec warn"><h4>${esc(t[6])}</h4><p>${esc(t[15])}</p></div>
   <div class="pr-sec"><h4>${esc(t[7])}</h4><ul>${qs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
  const h=document.querySelector('#patientExperience .p-hero h2'),i=document.querySelector('#patientExperience .p-latest .interp');
  if(h)h.textContent=t[0];if(i)i.textContent=t[1];
}
async function setLang(l){
  stopVoice();lang=l;document.querySelectorAll('#langBar button').forEach(b=>b.classList.toggle('active',b.dataset.l===l));
  if(!memo[l]){$('prNote').textContent=EN[19];
    try{memo[l]=(await post('/api/translate',{texts:EN.slice(0,19),lang:l})).texts.concat(EN.slice(19))}
    catch(e){$('prNote').textContent=e.message+' Showing English.';lang='en';document.querySelectorAll('#langBar button').forEach(b=>b.classList.toggle('active',b.dataset.l==='en'));T=EN;render();return}}
  // UI labels (listen/stop) come from translated list positions 17,18 since they were translated with the rest
  T=memo[l];$('prNote').textContent='';render();
}
const shell=document.querySelector('#patientExperience .patient-shell');
if(shell){
  // translate 19 strings: 0-18 incl. Listen/Stop; note/no-voice messages stay English
  shell.querySelector('.p-hero').insertAdjacentHTML('afterend',
   `<div class="lang-bar" id="langBar">${Object.keys(LG).map(k=>`<button data-l="${k}" class="${k==='en'?'active':''}">${LG[k][0]}</button>`).join('')}</div>
    <div class="pr-card"><div class="pr-head"><h3 id="prTitle"></h3><button class="btn-listen" id="prListen"></button></div><div class="pr-note" id="prNote"></div><div id="prBody"></div></div>`);
  $('langBar').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setLang(b.dataset.l)});
  $('prListen').addEventListener('click',speak);render();
}
['overlayCloseBtn','newScreeningFromPatientBtn','pillDoctorFromPatientBtn'].forEach(id=>$(id)&&$(id).addEventListener('click',stopVoice));
document.addEventListener('keydown',e=>e.key==='Escape'&&stopVoice());

/* ---- clinician ---- */
const AUD={spec:'Ophthalmologist / Retina',mbbs:'MBBS / Physician',ayush:'BHMS / BAMS (AYUSH)',opt:'Optometrist',chw:'Nurse / ASHA / Health worker'};
let aud='mbbs';const ac={};
const bt=document.querySelector('.dw-right .ai-brief-title');
if(bt){
  bt.insertAdjacentHTML('afterend',`<div class="ab-section" style="border-top:none;padding-top:0;margin-top:0"><h4>Explain this report for</h4><div class="aud-chips" id="audChips">${Object.keys(AUD).map(k=>`<button data-a="${k}" class="${k===aud?'active':''}">${AUD[k]}</button>`).join('')}</div><div class="aud-card" id="audCard"></div></div>`);
  const rp=$('dcReportPreview');if(rp)rp.insertAdjacentHTML('beforeend','<div class="rp-row"><span>Explained for</span><span id="rpAud"></span></div>');
  async function draw(){
    const card=$('audCard');card.textContent='Generating…';if($('rpAud'))$('rpAud').textContent=AUD[aud];
    try{const d=ac[aud]||(ac[aud]=await post('/api/explain',{role:aud,...CASE}));
      card.innerHTML=`<b>Summary</b>${esc(d.summary)}<b>What to check</b>${esc(d.look)}<b>Suggested next step</b>${esc(d.act)}<b>Reminder</b>AI-generated decision support. Verify against the image and local guidelines.`}
    catch(e){card.textContent='Could not generate: '+e.message}
  }
  $('audChips').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;aud=b.dataset.a;document.querySelectorAll('#audChips button').forEach(x=>x.classList.toggle('active',x===b));draw()});
  draw();
}
})();
