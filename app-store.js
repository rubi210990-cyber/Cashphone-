// CashPhone — app-store.js (storefront module)
// נטען lazy רק כשמשתמש נכנס לחנות

// ============ STORE FRONT ============
function updatePrevSel(){
  const sel=document.getElementById('prev-sel');
  if(!sel)return; // האלמנט לא קיים בדף הנוכחי
  // store users only see their store
  if(currentUser&&currentUser.role==='store'){
    sel.style.display='none';return;
  }
  sel.style.display='';
  sel.innerHTML=stores.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  sel.value=prevId;
}

function switchPreview(){prevId=document.getElementById('prev-sel').value;renderStoreFront();}

function prevStore(id){
  prevId=id;
  showPage('page-store');
  document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('on'));
  const tabs=document.querySelectorAll('.ntab');
  if(tabs[1])tabs[1].classList.add('on');
  renderStoreFront();
}

function sp(s,prodId,baseP){
  const k=`${prodId}_${baseP}`;
  if(s&&s.prices&&s.prices[k]!==undefined&&s.prices[k]!==null){
    return s.prices[k];
  }
  // אם אין מחיר מוגדר — חשב לפי רמת המחיר של החנות
  const tier=TIERS[s&&s.tier?s.tier:'normal']||TIERS.normal;
  return Math.max(1,Math.round(baseP*(1+tier.pct/100)));
}

// ============================================================
// ============ 💰 מחיר קניה (cost price) לחנות ============
// ============================================================
// מחזיר את המחיר המומלץ ללקוח הסופי של החנות (בש"ח),
// שיוצג ליד מחיר המכירה כדי שהחנות תדע כמה תרוויח.
// סדר עדיפויות:
//   1. דריסה ידנית של אדמין (בשדה s.costPrices[prodId_pkgP])
//   2. ברירת מחדל = המחיר הבסיסי מ-PRODS (getBasePrice)
function getCostPrice(s,prod,pkg){
  if(!s||!prod||!pkg)return 0;
  var key=prod.id+'_'+pkg.p;
  // דריסה ידנית של אדמין
  if(s.costPrices&&s.costPrices[key]!==undefined&&s.costPrices[key]!==null&&s.costPrices[key]!==''){
    var v=parseFloat(s.costPrices[key]);
    if(!isNaN(v)&&v>0)return Math.round(v);
  }
  // ברירת מחדל - המחיר הבסיסי מ-PRODS (כבר ממיר USD לשקלים)
  return getBasePrice(prod,pkg);
}

// בדיקה האם להציג מחיר קניה (רק למשתמשי חנות)
function shouldShowCostPrice(){
  return currentUser&&currentUser.role==='store';
}

// ============================================================
// ============ 📦 סטטוס זמינות חבילה ============
// ============================================================
// 3 מצבים:
//   'available' - זמין (ברירת מחדל)
//   'out' - אזל זמנית (מוצג מסומן באפור, לא ניתן להזמין)
//   'hidden' - מוסתר (לא מוצג בכלל ללקוח)
//
// עדיפות:
//   1. override ברמת חנות (s.pkgOverrides[prodId_pkgP])
//   2. סטטוס ברמת מוצר (pkg.status)
//   3. ברירת מחדל: 'available'
function getPkgStatus(s,prod,pkg){
  if(!prod||!pkg)return 'available';
  var key=prod.id+'_'+pkg.p;
  // override ברמת חנות
  if(s&&s.pkgOverrides&&s.pkgOverrides[key]){
    return s.pkgOverrides[key];
  }
  // סטטוס מערכתי על המוצר
  if(pkg.status&&['available','out','hidden'].indexOf(pkg.status)>=0){
    return pkg.status;
  }
  return 'available';
}

// בדיקה: האם החבילה זמינה להזמנה?
function isPkgOrderable(s,prod,pkg){
  return getPkgStatus(s,prod,pkg)==='available';
}

// בדיקה: האם להציג את החבילה ברשימה?
function isPkgVisible(s,prod,pkg){
  return getPkgStatus(s,prod,pkg)!=='hidden';
}

// קבלת רשימת חבילות גלויות למוצר (לסינון בעת רינדור)
function getVisiblePackages(s,prod){
  if(!prod||!prod.pkgs)return [];
  return prod.pkgs.filter(function(pkg){return isPkgVisible(s,prod,pkg);});
}

// קבלת רשימת חבילות זמינות (לבחירת ברירת המחדל)
function getOrderablePackages(s,prod){
  if(!prod||!prod.pkgs)return [];
  return prod.pkgs.filter(function(pkg){return isPkgOrderable(s,prod,pkg);});
}

function renderStoreFront(){
  const s=getStore(prevId);
  const tier=TIERS[s.tier]||TIERS.normal;
  document.getElementById('prev-name').textContent=s.name;
  // הצג בחירת חנות רק לאדמין
  const banner=document.getElementById('prev-banner');
  if(banner) banner.style.display=(currentUser&&currentUser.role==='admin')?'flex':'none';
  updatePrevSel();
  document.getElementById('credit-val').textContent=(s.credit<0?'חוב: ':'')+'₪'+Math.abs(s.credit).toLocaleString();
  document.getElementById('credit-val').style.color=s.credit<0?'#e24b4a':'#39e600';
  // הצג מסגרת חוב אם קיימת
  const debtInfo = document.getElementById('debt-info');
  if(debtInfo){
    if(s.debtLimit>0 && s.credit<0){
      debtInfo.style.display='block';
      debtInfo.textContent=`⚠️ מסגרת אשראי: ₪${s.debtLimit} | נוצל: ₪${Math.abs(s.credit)}`;
    } else if(s.debtLimit>0){
      debtInfo.style.display='block';
      debtInfo.textContent=`💳 מסגרת אשראי זמינה: ₪${s.debtLimit}`;
    } else {
      debtInfo.style.display='none';
    }
  }
  const noC = s.credit - 1 < -(s.debtLimit||0); // חסום רק אם חרג ממסגרת
  document.getElementById('nocredit-msg').classList.toggle('on',noC);
  document.getElementById('success-box').classList.remove('on');
  const catRow=document.getElementById('cat-row');
  catRow.innerHTML=`<button class="cat-btn${activeCat==='all'?' on':''}" onclick="filterCat('all')">${t('store.categories.all')}</button>`
    +Object.entries(CATS).map(([k,v])=>{
      var catLabel=t('store.categories.'+k);
      // אם אין תרגום, השתמש בשם המקורי
      if(catLabel==='store.categories.'+k)catLabel=v;
      return `<button class="cat-btn${activeCat===k?' on':''}" onclick="filterCat('${k}')">${catLabel}</button>`;
    }).join('');
  const disabledProds = s.disabledProds||[];
  const prods=(activeCat==='all'?PRODS:PRODS.filter(p=>p.cat===activeCat))
    .filter(p=>!disabledProds.includes(p.id))
    // 📦 סנן מוצרים שכל החבילות שלהם מוסתרות
    .filter(p=>{
      var visible=getVisiblePackages(s,p);
      return visible.length>0;
    });
  const showCost=shouldShowCostPrice();
  document.getElementById('prod-grid').innerHTML=prods.map(p=>{
    // השתמש בחבילה הראשונה הזמינה (לא מוסתרת) למחיר ההצגה
    const visiblePkgs=getVisiblePackages(s,p);
    const orderablePkgs=getOrderablePackages(s,p);
    const firstShown=visiblePkgs[0]||p.pkgs[0];
    const minP=sp(s,p.id,firstShown.p);
    // האם כל החבילות אזלו? (יש חבילות גלויות אבל לא ניתנות להזמנה)
    const allOut=orderablePkgs.length===0&&visiblePkgs.length>0;
    const can=s.credit>=minP&&!noC&&!allOut;
    // מחיר קניה (רק לחנות) — מוסתר מאחורי כפתור $ בפינת הכרטיס
    let costTag='';
    if(showCost&&!allOut){
      const minCostP=getCostPrice(s,p,firstShown);
      if(minCostP>0&&minCostP>minP){
        const profit=minCostP-minP;
        costTag=`<div style="position:absolute;top:6px;left:6px;z-index:5;"><span class="cost-trigger" onclick="event.stopPropagation();" onmousedown="event.stopPropagation()" oncontextmenu="event.stopPropagation();return false;">$<span class="cost-tooltip">קניה: ₪${minP}${profit>0?' · רווח: ₪'+profit:''}</span></span></div>`;
      }
    }
    // תווית "אזל" אם כל החבילות אזלו
    let outBadge='';
    if(allOut){
      outBadge=`<div style="position:absolute;top:6px;right:6px;z-index:5;background:#5a2a2a;color:#ffb3b3;border:1px solid #8a3a3a;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800;">⚠️ ${t('store.out')}</div>`;
    }
    return`<div class="pcard${!can?' dis':''}" onclick="${can?'openModal('+p.id+')':''}" style="cursor:${can?'pointer':'not-allowed'};position:relative;${allOut?'opacity:0.6;':''}">
      ${costTag}
      ${outBadge}
      <div class="pimg" style="background:${p.color||'#475467'};position:relative;">
        ${p.icon?`<img src="${p.icon}" alt="${p.name}" style="width:100%;height:100%;object-fit:contain;padding:6px;" onerror="this.style.display='none'"/>`:``}
        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,0.8),transparent);padding:8px 10px 6px;">
          <div style="color:#fff;font-size:13px;font-weight:700;">${p.name}</div>
          <div style="color:${allOut?'#888':'#39e600'};font-size:13px;font-weight:800;">${allOut?t('store.out_of_stock'):t('store.from_price')+'₪'+minP}</div>
        </div>
      </div>
      <div class="pbody" style="padding:6px 10px;text-align:center;">
        <div style="font-size:11px;color:#999;">${p.cur}</div>
        ${!can&&!allOut?'<div style="font-size:11px;color:#e24b4a;font-weight:600;">'+t('store.no_credit')+'</div>':''}
      </div>
    </div>`;
  }).join('');
}

function filterCat(cat){activeCat=cat;renderStoreFront();}

function openModal(prodId){
  const s=getStore(prevId);
  selProd=PRODS.find(p=>p.id===prodId);
  // ברירת מחדל: חבילה זמינה (לא אזלה ולא מוסתרת) שאפשר להרשות לה כספית
  selPkgData=selProd.pkgs.find(pkg=>
    isPkgOrderable(s,selProd,pkg)&&sp(s,selProd.id,pkg.p)<=s.credit
  )||null;
  if(!selPkgData)return;
  document.getElementById('m-title').textContent=selProd.name;
  document.getElementById('m-sub').textContent=selProd.cur+t('modal.pick_amount');
  document.getElementById('m-ulbl').textContent=selProd.ul||'שם משתמש / ID';
  document.getElementById('m-user').value='';
  document.getElementById('m-note').value='';
  document.getElementById('player-info').style.display='none';
  const tc=document.getElementById('terms-check');
  if(tc)tc.checked=false;
  renderMPkgs();
  // 🌐 רענן תרגומים על המודאל אחרי שהוא נפתח
  applyTranslations();
  document.getElementById('overlay').classList.add('on');
  document.getElementById('success-box').classList.remove('on');
  // השהיית sync כדי שהיתרה לא תקפוץ באמצע ההזמנה
  if(typeof pauseSyncFor==='function')pauseSyncFor(60000);
  // 🎯 גלילה אוטומטית למודאל - המודאל יושב מתחת לרשימת המוצרים
  // לכן בלי גלילה המשתמש לא רואה אותו
  setTimeout(function(){
    var modal=document.getElementById('overlay');
    if(!modal)return;
    try{
      modal.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){
      modal.scrollIntoView();
    }
  },100);
}

function renderMPkgs(){
  const s=getStore(prevId);
  const showCost=shouldShowCostPrice();
  // סנן רק חבילות שלא מוסתרות
  const visiblePkgs=selProd.pkgs.map((pkg,origIdx)=>({pkg:pkg,origIdx:origIdx}))
    .filter(item=>isPkgVisible(s,selProd,item.pkg));
  document.getElementById('m-pkgs').innerHTML=visiblePkgs.map(({pkg,origIdx})=>{
    const dp=sp(s,selProd.id,pkg.p);
    const status=getPkgStatus(s,selProd,pkg);
    const isOut=status==='out';
    const canPay=dp<=s.credit;
    const can=canPay&&!isOut;
    const isSel=selPkgData&&selPkgData.p===pkg.p;
    // אייקון אזהרה אם יש warn, או הערה אם יש note
    let extra='';
    if(pkg.warn){
      extra='<span class="pkg-warn" title="'+pkg.warn.replace(/"/g,'&quot;')+'" onclick="event.stopPropagation();cpAlert(\''+pkg.warn.replace(/'/g,"\\'")+'\',{type:\'warning\'})" style="margin-right:6px;color:#ef9f27;cursor:pointer;font-size:13px;">⚠️</span>';
    }else if(pkg.note){
      extra='<span class="pkg-note" title="'+pkg.note.replace(/"/g,'&quot;')+'" onclick="event.stopPropagation();cpAlert(\''+pkg.note.replace(/'/g,"\\'")+'\',{type:\'info\',icon:\'💡\'})" style="margin-right:6px;color:#39e600;cursor:pointer;font-size:13px;">💡</span>';
    }
    // מחיר קניה (רק לחנות) - מוסתר מאחורי כפתור 👁 — נחשף ב-hover/long-press
    let costBadge='';
    if(showCost&&!isOut){
      const costP=getCostPrice(s,selProd,pkg);
      const profit=costP-dp;
      if(costP>0&&dp>0){
        costBadge='<span class="cost-trigger" onmousedown="event.stopPropagation()" oncontextmenu="event.stopPropagation();return false;">$<span class="cost-tooltip">קניה: ₪'+dp+(profit>0?' · רווח: ₪'+profit:'')+'</span></span>';
      }
    }
    // אם החבילה אזלה - הצג תווית במקום מחיר
    let priceDisplay;
    if(isOut){
      priceDisplay='<span style="display:inline-flex;align-items:center;gap:4px;background:#3a2828;color:#e88;border:1px solid #5a2a2a;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">⚠️ '+t('store.out_of_stock')+'</span>';
    }else{
      priceDisplay=costBadge+'<span>₪'+dp+'</span>';
    }
    const classes=['pkg'];
    if(isSel)classes.push('sel');
    if(!can)classes.push('no');
    if(isOut)classes.push('pkg-out');
    return`<div class="${classes.join(' ')}" ${can?'onclick="pickPkg(this,'+origIdx+')"':''} ${isOut?'style="opacity:0.55;cursor:not-allowed;background:#2a1a1a;"':''}>
      <span class="pkg-a">${pkg.a}${extra}</span>
      <span class="pkg-p" style="display:flex;align-items:center;gap:4px;">${priceDisplay}</span>
    </div>`;
  }).join('');
  updMTotal();
}

function pickPkg(el,i){
  document.querySelectorAll('.pkg').forEach(p=>p.classList.remove('sel'));
  el.classList.add('sel');selPkgData=selProd.pkgs[i];updMTotal();
  // 🎯 גלילה אוטומטית לשדה הזנת ID + פוקוס - נוחות למשתמש במודאלים ארוכים
  setTimeout(function(){
    var userInput=document.getElementById('m-user');
    if(!userInput)return;
    // השתמש ב-scrollIntoView מאוד עדין - לא לקצה אלא לאמצע
    try{
      userInput.scrollIntoView({behavior:'smooth',block:'center'});
    }catch(e){
      // fallback לדפדפנים ישנים יותר
      userInput.scrollIntoView();
    }
    // פוקוס אוטומטי רק אם המשתמש לא הקליד עדיין
    if(!userInput.value){
      setTimeout(function(){
        try{userInput.focus();}catch(e){}
      },300); // אחרי שהגלילה הסתיימה
    }
  },80); // קצר אבל מספיק שיהיה אחרי ה-render
}

function updMTotal(){
  const s=getStore(prevId);
  const dp=sp(s,selProd.id,selPkgData.p);
  document.getElementById('m-total').textContent='₪'+dp;
  const rem=s.credit-dp;
  document.getElementById('m-rem').textContent='₪'+Math.max(0,rem).toLocaleString();
  document.getElementById('m-rem').style.color=rem<0?'#e24b4a':'#eee';
  document.getElementById('pay-btn').disabled=rem<0;
  // trigger מוסתר לרווח (רק לחנות) - נחשף ב-hover/long-press
  const triggerWrap=document.getElementById('m-cost-trigger-wrap');
  const tip=document.getElementById('m-cost-tip');
  if(triggerWrap&&tip){
    if(shouldShowCostPrice()){
      const costP=getCostPrice(s,selProd,selPkgData);
      const profit=costP-dp;
      // dp = מחיר קניה (החנות משלמת לי)
      // costP = מחיר מכירה ללקוח (גבוה יותר)
      // אנחנו מציגים בtooltip: כמה הקניה והרווח
      if(costP>0&&dp>0){
        triggerWrap.style.display='inline-flex';
        tip.textContent='קניה: ₪'+dp+(profit>0?' · רווח: ₪'+profit:'');
      }else{
        triggerWrap.style.display='none';
      }
    }else{
      triggerWrap.style.display='none';
    }
  }
}

function closeOv(){
  document.getElementById('overlay').classList.remove('on');
  // ביטול השהיית sync — המשתמש סגר את המודל
  SYNC_PAUSED_UNTIL=0;
}

// ============ TELEGRAM ============
const TG_TOKEN='8782165924:AAF-E5HYDpZyYqiBJWhLAwVQ73n8W-Pbx58';
const TG_CHAT='979918391';

function sendTelegram(msg){
  const url=`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:TG_CHAT,text:msg,parse_mode:'HTML'})
  }).catch(()=>{});
}

// ====== אימות שחקן ======
async function verifyPlayer(){
  const userId=document.getElementById('m-user').value.trim();
  const infoDiv=document.getElementById('player-info');
  const nameSpan=document.getElementById('player-name');
  const btn=document.getElementById('verify-btn');
  if(!userId){toast('t-store','הכנס ID שחקן קודם');return;}
  btn.textContent='בודק...';
  btn.disabled=true;
  try{
    // Roblox API
    if(selProd&&selProd.id===1){
      const res=await fetch('https://users.roblox.com/v1/users/'+userId);
      const data=await res.json();
      if(data&&data.name){
        nameSpan.textContent='✅ שם שחקן: '+data.name+(data.displayName&&data.displayName!==data.name?' ('+data.displayName+')':'');
        infoDiv.style.display='block';
        infoDiv.style.background='#f0fff0';
        infoDiv.style.borderColor='#39e600';
      } else {
        nameSpan.textContent='❌ ID לא נמצא — בדוק שוב';
        infoDiv.style.display='block';
        infoDiv.style.background='#fff5f5';
        infoDiv.style.borderColor='#e24b4a';
      }
    } else {
      // משחקים אחרים — הצג הודעה
      nameSpan.textContent='✅ ID '+userId+' נרשם';
      infoDiv.style.display='block';
      infoDiv.style.background='#f0fff0';
      infoDiv.style.borderColor='#39e600';
    }
  }catch(e){
    nameSpan.textContent='⚠️ לא ניתן לאמת — בדוק ידנית';
    infoDiv.style.display='block';
    infoDiv.style.background='#fff8e1';
    infoDiv.style.borderColor='#ef9f27';
  }
  btn.textContent='בדוק ✓';
  btn.disabled=false;
}

function submitOrder(){
  const s=getStore(prevId);
  const user=document.getElementById('m-user').value.trim();
  if(!user){document.getElementById('m-user').style.borderColor='#552020';document.getElementById('m-user').focus();return;}
  document.getElementById('m-user').style.borderColor='';
  // בדיקת תקנון
  const termsCheck=document.getElementById('terms-check');
  if(!termsCheck.checked){
    toast('t-store','יש לאשר את התקנון לפני הזמנה');
    termsCheck.style.outline='2px solid #e24b4a';
    setTimeout(()=>termsCheck.style.outline='',2000);
    return;
  }
  const dp=sp(s,selProd.id,selPkgData.p);
  const debtLimit = s.debtLimit||0;
  // אפשר הזמנה אם יש קרדיט או אם יש מסגרת חוב
  if(s.credit - dp < -debtLimit){
    toast('t-store','❌ חריגה ממסגרת האשראי (מקסימום חוב: ₪'+debtLimit+')');
    return;
  }
  s.credit-=dp;
  const note=document.getElementById('m-note').value.trim();
  s.log.unshift({t:`הזמנה: ${selProd.name}`,amt:dp,plus:false,time:now(),user});
  const o={id:Date.now(),storeId:s.id,storeName:s.name,prod:selProd.name,pkg:selPkgData.a,price:dp,basePrice:selPkgData.p,user,note,status:'new',time:now()};
  orders.unshift(o);
  // 🔗 צור גם load מקושר (סנכרון אוטומטי)
  try{createLoadFromOrder(o);saveLoads();}catch(e){console.warn('Failed to create load:',e);}
  closeOv();
  document.getElementById('success-box').classList.add('on');
  document.getElementById('success-msg').textContent=`${selPkgData.a} עבור "${user}" — יתרה: ₪${s.credit.toLocaleString()}`;
  renderStoreFront();renderOrders();updateStats();renderLog();
  saveData();
  // 🔔 התראה לאדמין ולמשווק (אם קיים)
  if(typeof notify!=='undefined'){
    notify.send('order:new',{
      message:s.name+' — '+selProd.name+' '+selPkgData.a+' לשחקן "'+user+'" · ₪'+dp,
      target_role:['admin','reseller'],
      target_store_id:s.id, // למשווק - רק אם זאת חנות שלו
      action_store_id:s.id
    });
  }
  // שלח התראה לטלגרם
  sendTelegram(
    `🔔 <b>הזמנה חדשה!</b>\n\n`+
    `🏪 חנות: ${s.name}\n`+
    `🎮 מוצר: ${selProd.name}\n`+
    `📦 כמות: ${selPkgData.a}\n`+
    `👤 משתמש: ${user}\n`+
    (note?`📝 הערה: ${note}\n`:'')+
    `💰 מחיר: ₪${dp}\n`+
    `💳 יתרה נותרת: ₪${s.credit.toLocaleString()}\n`+
    `🕐 שעה: ${now()}`
  );
}

