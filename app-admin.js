// CashPhone — app-admin.js (admin/prices/reports module)
// נטען lazy רק לאדמין/משווק/חנות

// ============ PRICES ============
function editPrices(id){
  priceStoreId=id;pendingP=null;
  showPage('page-prices');
  document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('on'));
  const tabs=document.querySelectorAll('.ntab');
  if(tabs[2])tabs[2].classList.add('on');
  renderPriceEditor();
}

function getPStore(){
  const list=Array.isArray(stores)?stores:[];
  return list.find(s=>s.id===priceStoreId)||list[0]||null;
}
function getEP(){
  const st=getPStore();
  if(pendingP)return pendingP;
  if(st&&st.prices)return cp(st.prices);
  return cp(makePrices('normal'));
}

function renderPStoreTabs(){
  const wrap=document.getElementById('price-store-tabs');
  if(!wrap)return;
  const list=Array.isArray(stores)?stores:[];
  if(list.length===0){
    wrap.innerHTML='<div style="padding:10px;color:#666;font-size:13px;">אין חנויות — צור חנות קודם</div>';
    return;
  }
  wrap.innerHTML=list.map(s=>
    `<button class="stab${s.id===priceStoreId?' on':''}" onclick="selPStore('${s.id}')">${s.name}</button>`
  ).join('');
}

async function selPStore(id){
  if(pendingP&&!await cpConfirm('יש שינויים שלא נשמרו במחירים. לעבור בכל זאת?',{type:'warning',title:'שינויים לא שמורים',okText:'עבור (בטל שינויים)'}))return;
  priceStoreId=id;pendingP=null;renderPriceEditor();
}

function setBM(el,mode){
  bm=mode;
  document.querySelectorAll('.mtab').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');
  const map={pct:'הוסף/הפחת אחוז (חיובי=יקר, שלילי=הנחה)',ils:'הוסף/הפחת ₪ לכל מחיר',fixed:'קבע מחיר קבוע לכל המוצרים',tier:'הגדר לפי רמה: vip / good / normal / high / max'};
  document.getElementById('bm-lbl').textContent=map[mode];
}

function applyBulk(){
  const val=document.getElementById('bm-val').value;
  const prices=getEP();
  PRODS.forEach(p=>p.pkgs.forEach(pkg=>{
    const k=`${p.id}_${pkg.p}`;
    let v=pkg.p;
    if(bm==='pct'){const n=parseFloat(val);if(!isNaN(n))v=Math.round(pkg.p*(1+n/100));}
    else if(bm==='ils'){const n=parseFloat(val);if(!isNaN(n))v=Math.max(1,Math.round(pkg.p+n));}
    else if(bm==='fixed'){const n=parseFloat(val);if(!isNaN(n))v=Math.max(1,Math.round(n));}
    else if(bm==='tier'){const t=TIERS[val.trim()];if(t)v=Math.max(1,Math.round(pkg.p*(1+t.pct/100)));}
    prices[k]=Math.max(1,v);
  }));
  pendingP=prices;renderPTable();renderCompare();countPC();
}

function resetP(){pendingP=cp(makePrices('normal'));renderPTable();renderCompare();countPC();}
function discardP(){pendingP=null;renderPTable();renderCompare();countPC();}

function saveP(){
  if(!pendingP)return;
  var ps=getPStore();
  logAudit('prices-change','שינוי מחירים',{storeId:ps.id,storeName:ps.name});
  ps.prices=cp(pendingP);pendingP=null;
  renderPTable();renderCompare();countPC();
  toast('t-prices','המחירים נשמרו!');saveData();
}

function onPI(prodId,baseP,val){
  if(!pendingP)pendingP=cp(getPStore().prices);
  const k=`${prodId}_${baseP}`;
  const n=parseInt(val);
  pendingP[k]=isNaN(n)||n<1?getPStore().prices[k]:n;
  const el=document.getElementById(`fp_${prodId}_${baseP}`);
  if(el){el.textContent='₪'+pendingP[k];el.className=pendingP[k]!==baseP?'changedp':'finalp';}
  // עדכון עמודת הרווח
  const prod=PRODS.find(p=>p.id===prodId);
  if(prod){
    const pkg=prod.pkgs.find(x=>x.p===baseP);
    if(pkg){
      const usdCost=getDollarCost(prod,pkg);
      const ilsCost=Math.round(usdCost*dollarRate);
      const profit=pendingP[k]-ilsCost;
      const profitColor=profit>0?'#39e600':profit<0?'#e24b4a':'#888';
      const profitPct=ilsCost>0?Math.round((profit/ilsCost)*100):0;
      const pf=document.getElementById('pf_'+prodId+'_'+baseP);
      if(pf){
        pf.style.color=profitColor;
        pf.innerHTML=(profit>=0?'+':'')+'₪'+profit+'<span style="font-size:10px;opacity:.7;"> ('+(profit>=0?'+':'')+profitPct+'%)</span>';
      }
    }
  }
  countPC();renderCompare();
}

// עדכון מחיר מומלץ ללקוח של החנות (נשמר ישירות, לא דורש שמירה)
function onCustomerPrice(prodId,baseP,val){
  var st=getPStore();
  if(!st)return;
  if(!st.costPrices)st.costPrices={};
  var k=prodId+'_'+baseP;
  var n=parseFloat(val);
  if(isNaN(n)||n<=0||val===''){
    delete st.costPrices[k];
  }else{
    st.costPrices[k]=Math.round(n);
  }
  // שמירה מיידית (בלי דרישה ללחוץ "שמור")
  saveData();
  // לוג ביקורת רק אם השתנה משהו
  // (אין צורך בריענון - הקלט עצמו עודכן)
}

// 📦 עדכון סטטוס זמינות (override ברמת חנות)
// val: '' (ברירת מחדל / נקה override) | 'available' | 'out' | 'hidden'
function onPkgStatusChange(prodId,baseP,val){
  var st=getPStore();
  if(!st)return;
  if(!st.pkgOverrides)st.pkgOverrides={};
  var k=prodId+'_'+baseP;
  var oldVal=st.pkgOverrides[k]||'';
  if(val===''||!val){
    delete st.pkgOverrides[k];
  }else if(['available','out','hidden'].indexOf(val)>=0){
    st.pkgOverrides[k]=val;
  }
  // שמירה מיידית
  saveData();
  // לוג ביקורת
  try{
    var prodName=(PRODS.find(function(p){return p.id===prodId;})||{}).name||'';
    logAudit('pkg-status-change','שינוי סטטוס חבילה',{
      storeId:st.id,storeName:st.name,
      product:prodName,pkg:baseP,
      from:oldVal||'(ברירת מחדל)',
      to:val||'(ברירת מחדל)'
    });
  }catch(e){}
  // רענון התצוגה הצבעונית של הסטטוס
  setTimeout(function(){renderPTable();},10);
  // אם החנות צופה בעמוד החנות שלה - רענן (Live)
  if(typeof renderStoreFront==='function'){
    var storePage=document.getElementById('page-store');
    if(storePage&&storePage.classList.contains('on'))try{renderStoreFront();}catch(e){}
  }
}

function countPC(){
  const el=document.getElementById('pchanges');
  if(!el)return;
  if(!pendingP){el.textContent='אין שינויים';return;}
  let n=0;PRODS.forEach(p=>p.pkgs.forEach(pkg=>{if(pendingP[`${p.id}_${pkg.p}`]!==pkg.p)n++;}));
  el.textContent=n?n+' שינויים':'אין שינויים';
}

function renderPTable(){
  const wrap=document.getElementById('price-table');
  if(!wrap)return;
  try{
    const st=getPStore();
    if(!st){
      wrap.innerHTML='<div style="padding:20px;text-align:center;color:#666;">בחר או צור חנות תחילה</div>';
      return;
    }
    const prices=getEP();
    let html=`<div style="background:#0a1a0a;border:1px solid #1a3a1a;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#9ec79e;">
      💡 <b>איך זה עובד:</b> הזן את <b>העלות שלך בדולרים</b> בעמודה הצהובה — השקלים יחושבו אוטומטית לפי שער הדולר הנוכחי (<b>$1 = ₪${dollarRate}</b>).
      בעמודה הירוקה הזן את המחיר ללקוח בשקלים.
      <br/>📦 בעמודה <b style="color:#86efac;">"מחיר ללקוח של החנות"</b> — אפשר להציע לחנות מחיר מומלץ למכירה ללקוח הסופי שלה (יוצג רק לחנות עצמה, לא ללקוח). השאר ריק = מחיר ה-PRODS המקורי.
    </div>`;
    Object.entries(CATS).forEach(([ck,cn])=>{
      const prods=PRODS.filter(p=>p.cat===ck);
      if(prods.length===0)return;
      html+=`<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:700;color:#39e600;padding:6px 0;border-bottom:1px solid #222;margin-bottom:8px;">${cn}</div>`;
      prods.forEach(p=>{
        html+=`<div style="margin-bottom:10px;"><div style="font-size:13px;font-weight:700;margin-bottom:4px;">${p.icon?(p.icon.startsWith('http')||p.icon.startsWith('data:')?'<img src="'+p.icon+'" style="width:18px;height:18px;vertical-align:middle;border-radius:3px;margin-left:5px;"/>':p.icon):''} ${p.name}</div>
          <table class="ptable"><thead><tr>
            <th style="width:20%">כמות</th>
            <th style="width:12%;color:#ef9f27;">עלות $ שלי</th>
            <th style="width:9%;color:#888;">עלות ₪</th>
            <th style="width:14%">חנות משלמת ₪</th>
            <th style="width:14%;color:#86efac;">חנות גובה ₪</th>
            <th style="width:14%">רווח שלי</th>
            <th style="width:13%;color:#7cb3ff;">סטטוס</th>
          </tr></thead><tbody>`;
        p.pkgs.forEach(pkg=>{
          const k=`${p.id}_${pkg.p}`;
          const cur=prices[k]!=null?prices[k]:pkg.p;
          const usdCost=getDollarCost(p,pkg);
          const ilsCost=Math.round(usdCost*dollarRate);
          const profit=cur-ilsCost;
          const profitColor=profit>0?'#39e600':profit<0?'#e24b4a':'#888';
          const profitPct=ilsCost>0?Math.round((profit/ilsCost)*100):0;
          const customerPrice=(st.costPrices&&st.costPrices[k]!=null)?st.costPrices[k]:'';
          const defaultCustomerPrice=getBasePrice(p,pkg);
          // 📦 סטטוס: בדוק גם override של החנות וגם סטטוס מערכת
          const storeStatus=(st.pkgOverrides&&st.pkgOverrides[k])||'';
          const sysStatus=pkg.status||'available';
          const effectiveStatus=storeStatus||sysStatus;
          const isOut=effectiveStatus==='out';
          const isHidden=effectiveStatus==='hidden';
          const rowStyle=isOut?'background:rgba(226,75,74,0.07);':isHidden?'background:rgba(100,100,100,0.07);':(pkg.region&&pkg.region!=='global'?'background:rgba(239,159,39,0.04);':'');
          html+=`<tr style="${rowStyle}">
            <td style="font-size:12px;">${pkg.a}${pkg.warn?' <span title="'+pkg.warn.replace(/"/g,'&quot;')+'" style="color:#ef9f27;cursor:help;">⚠️</span>':pkg.note?' <span title="'+pkg.note.replace(/"/g,'&quot;')+'" style="color:#39e600;cursor:help;">💡</span>':''}</td>
            <td><input class="pinp" type="number" step="0.01" min="0" placeholder="$" value="${dollarCosts[k]!=null?usdCost:''}" oninput="onUSD(${p.id},${pkg.p},this.value)" style="border-color:#5a3a00;background:#1a1100;color:#ef9f27;"/></td>
            <td id="ic_${p.id}_${pkg.p}" style="color:#888;font-size:13px;">₪${ilsCost}</td>
            <td><input class="pinp" type="number" min="1" value="${cur}" oninput="onPI(${p.id},${pkg.p},this.value)"/></td>
            <td><input class="pinp" type="number" min="0" placeholder="${defaultCustomerPrice}" value="${customerPrice}" oninput="onCustomerPrice(${p.id},${pkg.p},this.value)" style="border-color:#1a3a1a;background:#0a1a0a;color:#86efac;"/></td>
            <td id="pf_${p.id}_${pkg.p}" style="color:${profitColor};font-size:12px;font-weight:700;">${profit>=0?'+':''}₪${profit}<span style="font-size:10px;opacity:.7;"> (${profit>=0?'+':''}${profitPct}%)</span></td>
            <td>
              <select class="pinp" onchange="onPkgStatusChange(${p.id},${pkg.p},this.value)" style="font-size:11px;padding:3px;background:${isOut?'#3a1a1a':isHidden?'#2a2a2a':'#0a1a0a'};color:${isOut?'#ff8a8a':isHidden?'#aaa':'#86efac'};">
                <option value="" ${storeStatus===''?'selected':''}>${sysStatus==='out'?'🟡 אזל (מערכת)':sysStatus==='hidden'?'⚫ מוסתר (מערכת)':'🟢 זמין (ברירת מחדל)'}</option>
                <option value="available" ${storeStatus==='available'?'selected':''}>🟢 זמין (override)</option>
                <option value="out" ${storeStatus==='out'?'selected':''}>🟡 אזל (override)</option>
                <option value="hidden" ${storeStatus==='hidden'?'selected':''}>⚫ הסתר (override)</option>
              </select>
            </td>
          </tr>`;
        });
        html+='</tbody></table></div>';
      });
      html+='</div>';
    });
    wrap.innerHTML=html||'<div style="padding:20px;text-align:center;color:#666;">אין מוצרים להצגה</div>';
  }catch(err){
    console.error('renderPTable failed:',err);
    wrap.innerHTML='<div style="padding:20px;text-align:center;color:#e24b4a;">שגיאה בטעינת המחירון: '+(err.message||err)+'</div>';
  }
}

// עדכון עלות בדולרים — מעדכן את התא של עלות בשקלים והרווח
function onUSD(prodId, pkgP, val){
  setDollarCost(prodId, pkgP, val);
  const prod=PRODS.find(p=>p.id===prodId);
  if(!prod)return;
  const pkg=prod.pkgs.find(x=>x.p===pkgP);
  if(!pkg)return;
  const usdCost=getDollarCost(prod,pkg);
  const ilsCost=Math.round(usdCost*dollarRate);
  const ic=document.getElementById('ic_'+prodId+'_'+pkgP);
  if(ic)ic.textContent='₪'+ilsCost;
  // עדכון רווח
  const prices=getEP();
  const cur=prices[prodId+'_'+pkgP]!=null?prices[prodId+'_'+pkgP]:pkgP;
  const profit=cur-ilsCost;
  const profitColor=profit>0?'#39e600':profit<0?'#e24b4a':'#888';
  const profitPct=ilsCost>0?Math.round((profit/ilsCost)*100):0;
  const pf=document.getElementById('pf_'+prodId+'_'+pkgP);
  if(pf){
    pf.style.color=profitColor;
    pf.innerHTML=(profit>=0?'+':'')+'₪'+profit+'<span style="font-size:10px;opacity:.7;"> ('+(profit>=0?'+':'')+profitPct+'%)</span>';
  }
}

function renderCompare(){
  const el=document.getElementById('compare-table');
  if(!el)return;
  try{
    const list=Array.isArray(stores)?stores:[];
    if(list.length<2){el.innerHTML='<div style="text-align:center;padding:1rem;color:#555;font-size:13px;">הוסף חנות נוספת לראות השוואה</div>';return;}
    const ep=getEP();
    // עוזר: מחזיר HTML של אייקון - תמונה או אימוג'י
    function iconHtml(prod){
      if(prod.icon&&(prod.icon.startsWith('http')||prod.icon.startsWith('data:'))){
        return '<img src="'+prod.icon+'" style="width:18px;height:18px;vertical-align:middle;border-radius:3px;margin-left:4px;object-fit:cover;" alt=""/>';
      }
      return prod.icon||prod.emoji||'';
    }
    let html=`<table class="ptable" style="table-layout:auto;"><thead><tr><th>מוצר</th><th>בסיס</th>${list.map(s=>`<th>${s.name}${s.id===priceStoreId?'*':''}</th>`).join('')}</tr></thead><tbody>`;
    PRODS.forEach(p=>p.pkgs.forEach(pkg=>{
      html+=`<tr><td style="font-size:11px;">${iconHtml(p)} ${pkg.a}</td><td class="basep">₪${pkg.p}</td>${list.map(s=>{const k=`${p.id}_${pkg.p}`;const v=s.id===priceStoreId?ep[k]:(s.prices&&s.prices[k]!=null?s.prices[k]:pkg.p);return`<td style="font-size:13px;${v<pkg.p?'color:#39e600;':v>pkg.p?'color:#ef9f27;':''}">₪${v}</td>`;}).join('')}</tr>`;
    }));
    html+='</tbody></table>';el.innerHTML=html;
  }catch(err){
    console.error('renderCompare failed:',err);
    el.innerHTML='<div style="padding:20px;text-align:center;color:#e24b4a;">שגיאה בהשוואה: '+(err.message||err)+'</div>';
  }
}

function renderPriceEditor(){
  try{renderPStoreTabs();}catch(e){console.error(e);}
  try{renderPTable();}catch(e){console.error(e);}
  try{renderCompare();}catch(e){console.error(e);}
  try{countPC();}catch(e){console.error(e);}
}

// ============ USERS ============
function updateUserStoreLink(){
  const sel=document.getElementById('u-store-link');
  if(!sel)return;
  const list=Array.isArray(stores)?stores:[];
  if(list.length===0){
    sel.innerHTML='<option value="">אין חנויות — צור חנות קודם</option>';
    return;
  }
  sel.innerHTML=list.map(s=>{
    const existingUser=users.find(u=>u.storeId===s.id);
    let label=s.name;
    if(s.frozen)label+=' 🧊 (מוקפאת)';
    else if(existingUser)label+=' ⚠️ (יש משתמש: '+existingUser.username+')';
    else label+=' ✓ (פנויה)';
    return `<option value="${s.id}">${label}</option>`;
  }).join('');
}

function toggleCustInfo(){
  const f=document.getElementById('cust-info-fields');
  const t=document.getElementById('cust-info-toggle');
  if(!f)return;
  if(f.style.display==='none'){f.style.display='block';if(t)t.textContent='▲';}
  else{f.style.display='none';if(t)t.textContent='▼';}
}

function getCustInfoFromForm(prefix){
  prefix=prefix||'u-';
  return {
    bizName:(document.getElementById(prefix+'biz')||{}).value?.trim()||'',
    contactName:(document.getElementById(prefix+'cname')||{}).value?.trim()||'',
    idNum:(document.getElementById(prefix+'id')||{}).value?.trim()||'',
    phone:(document.getElementById(prefix+'phone')||{}).value?.trim()||'',
    address:(document.getElementById(prefix+'address')||{}).value?.trim()||'',
    city:(document.getElementById(prefix+'city')||{}).value?.trim()||'',
    email:(document.getElementById(prefix+'email')||{}).value?.trim()||''
  };
}

function clearCustInfoForm(prefix){
  prefix=prefix||'u-';
  ['biz','cname','id','phone','address','city','email'].forEach(k=>{
    const el=document.getElementById(prefix+k);
    if(el)el.value='';
  });
}

// ============================================================
// תצוגת טופס "הוסף משתמש/חנות" משתנה לפי סוג
// ============================================================
function updateAddFormVisibility(){
  const role=(document.getElementById('u-role')||{}).value||'store';
  const isStore=role==='store';
  const newWrap=document.getElementById('u-newstore-wrap');
  if(newWrap)newWrap.style.display=isStore?'block':'none';
}

function addUser(){
  const username=document.getElementById('u-name').value.trim();
  const password=document.getElementById('u-pass').value;
  const role=document.getElementById('u-role').value;

  console.log('🔍 addUser CALLED:',{username:username,password:password?'***':'(EMPTY)',role:role});

  if(!username||!password){
    toast('t-users','⚠️ מלא שם משתמש וסיסמה');
    document.getElementById(username?'u-pass':'u-name').focus();
    document.getElementById(username?'u-pass':'u-name').style.borderColor='#552020';
    return;
  }
  if(users.find(u=>u.username===username)){
    toast('t-users','⚠️ שם משתמש כבר קיים');
    document.getElementById('u-name').focus();
    return;
  }
  if(password.length<4){
    toast('t-users','⚠️ סיסמה קצרה מדי (מינימום 4 תווים)');
    document.getElementById('u-pass').focus();
    return;
  }
  document.getElementById('u-name').style.borderColor='';
  document.getElementById('u-pass').style.borderColor='';

  let storeId=null;

  // אם זו חנות — נוצרת חנות חדשה אוטומטית, מקושרת למשתמש
  if(role==='store'){
    const sname=document.getElementById('n-name').value.trim();
    if(!sname){
      toast('t-users','חסר שם חנות');
      document.getElementById('n-name').style.borderColor='#552020';
      document.getElementById('n-name').focus();
      return;
    }
    document.getElementById('n-name').style.borderColor='';
    const tier=document.getElementById('n-tier').value;
    const credit=parseInt(document.getElementById('n-credit').value)||0;
    const debtLimit=parseInt(document.getElementById('n-debt').value)||0;
    const custPct=parseFloat(document.getElementById('n-pct').value)||0;
    const custIls=parseFloat(document.getElementById('n-ils').value)||0;
    storeId='s'+Date.now();
    const log=credit>0?[{t:'טעינה פתיחה',amt:credit,plus:true,time:now()}]:[];
    const newStore={id:storeId,name:sname,tier,credit,maxCredit:credit,debtLimit,prices:makePrices(tier,custPct,custIls),log,frozen:false};
    // קרדיט פתיחה > 0 → ממתין לתשלום עד שהאדמין מסמן אותו כשולם
    if(credit>0){
      newStore.openingUnpaid=true;
      newStore.openingAmount=credit;
      newStore.openingDate=now();
    }
    stores.push(newStore);
    // ניקוי שדות החנות
    ['n-name','n-credit','n-debt','n-pct','n-ils'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.value='';
    });
    const tierSel=document.getElementById('n-tier');if(tierSel)tierSel.value='normal';
    const cw=document.getElementById('n-custom-wrap');if(cw)cw.style.display='none';
  }

  // קריאת פרטי הלקוח
  const customerInfo=getCustInfoFromForm('u-');
  const hasInfo=Object.values(customerInfo).some(v=>v);
  const newUser={id:'u'+Date.now(),username,password,role,storeId};
  if(hasInfo)newUser.customerInfo=customerInfo;
  users.push(newUser);
  logAudit('user-create','יצירת משתמש חדש',{username:username,role:role,storeId:storeId});

  // ניקוי שדות המשתמש
  document.getElementById('u-name').value='';
  document.getElementById('u-pass').value='';
  clearCustInfoForm('u-');
  // איפוס לסוג ברירת מחדל "חנות"
  const roleSel=document.getElementById('u-role');if(roleSel)roleSel.value='store';
  updateAddFormVisibility();
  // סגירת תיבת פרטי הלקוח
  const f=document.getElementById('cust-info-fields');
  const t=document.getElementById('cust-info-toggle');
  if(f)f.style.display='none';
  if(t)t.textContent='▼';

  renderUsers();
  renderAll();
  if(role==='store'){
    const sName=stores.find(x=>x.id===storeId);
    toast('t-users','✅ נוצר משתמש "'+username+'"'+(sName?' לחנות "'+sName.name+'"':''));
  }else{
    toast('t-users','✅ המשתמש "'+username+'" נוצר!');
  }
  saveData();

  // === אימות שהשמירה הצליחה ===
  setTimeout(function(){
    try{
      var saved=localStorage.getItem('cp_users');
      if(saved){
        var arr=JSON.parse(saved);
        var found=arr.find(function(x){return x.username===username;});
        if(!found){
          cpAlert('המשתמש "'+username+'" לא נשמר ב-localStorage. ייתכן שהדפדפן חוסם אחסון.',{type:'error',title:'שגיאת שמירה'});
          console.error('User not saved!',{searched:username,inStorage:arr.map(function(u){return u.username;})});
        }else{
          console.log('✅ אומת: המשתמש "'+username+'" נשמר ב-localStorage');
        }
      }else{
        cpAlert('localStorage ריק לחלוטין. ייתכן שהדפדפן במצב פרטי או חוסם אחסון.',{type:'error',title:'אחסון לא זמין'});
      }
    }catch(e){
      cpAlert('שגיאה בקריאת localStorage: '+e.message,{type:'error'});
    }
  },200);
}

async function delUser(id){
  if(id==='admin'){toast('t-users','לא ניתן למחוק אדמין ראשי');return;}
  var ud=(users.find(u=>u.id===id)||{}).username||id;
  if(!await cpConfirm('האם למחוק את המשתמש "'+ud+'"?\nפעולה זו אינה ניתנת לביטול.',{type:'danger',title:'מחיקת משתמש'}))return;
  users=users.filter(u=>u.id!==id);
  logAudit('user-delete','מחיקת משתמש',{userId:id,username:ud});
  renderUsers();saveData();
}

async function changePass(id){
  const p=await cpPrompt('הקלד סיסמה חדשה (מינימום 4 תווים):',{
    title:'🔑 שינוי סיסמה',
    icon:'🔑',
    inputType:'text',
    placeholder:'סיסמה חדשה',
    validate:function(v){if(!v||v.length<4)return 'סיסמה חייבת להיות באורך 4 תווים לפחות';return null;}
  });
  if(p===null)return;
  const u=users.find(u=>u.id===id);if(u){u.password=p;logAudit('password-change','שינוי סיסמה למשתמש',{userId:id,username:u.username});toast('t-users','הסיסמה עודכנה!');saveData();}
}

// עריכת פרטי לקוח של משתמש
function editUserInfo(userId){
  const u=users.find(x=>x.id===userId);
  if(!u)return;
  const ci=u.customerInfo||{};
  // יצירת מודאל
  let m=document.getElementById('edit-user-modal');
  if(m)m.remove();
  m=document.createElement('div');
  m.id='edit-user-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML=`
    <div style="background:#3a4556;border:1px solid #5a6478;border-radius:14px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;direction:rtl;">
      <div style="padding:16px 20px;border-bottom:1px solid #475467;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:16px;font-weight:700;color:#fff;">📝 ערוך פרטי לקוח — ${u.username}</div>
        <button onclick="document.getElementById('edit-user-modal').remove()" style="background:none;border:none;color:#888;font-size:22px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div style="padding:18px 20px;">
        <div class="g2">
          <div><label class="lbl">שם העסק</label><input id="eu-biz" value="${ci.bizName||''}" placeholder="למשל: גיימינג ת״א"/></div>
          <div><label class="lbl">שם איש קשר</label><input id="eu-cname" value="${ci.contactName||''}" placeholder="שם מלא"/></div>
        </div>
        <div class="g2">
          <div><label class="lbl">ת.ז / ח.פ</label><input id="eu-id" value="${ci.idNum||''}" placeholder="מספר זהות או ח.פ"/></div>
          <div><label class="lbl">📞 נייד</label><input id="eu-phone" value="${ci.phone||''}" placeholder="050-0000000" type="tel"/></div>
        </div>
        <div class="g2">
          <div><label class="lbl">כתובת</label><input id="eu-address" value="${ci.address||''}" placeholder="רחוב ומספר"/></div>
          <div><label class="lbl">עיר</label><input id="eu-city" value="${ci.city||''}" placeholder="עיר"/></div>
        </div>
        <div><label class="lbl">📧 אימייל</label><input id="eu-email" value="${ci.email||''}" placeholder="example@gmail.com" type="email"/></div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button onclick="saveUserInfo('${userId}')" class="gbtn" style="flex:2;">💾 שמור שינויים</button>
          <button onclick="document.getElementById('edit-user-modal').remove()" style="flex:1;background:#2a2a2a;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">ביטול</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
}

function saveUserInfo(userId){
  const u=users.find(x=>x.id===userId);
  if(!u)return;
  const customerInfo=getCustInfoFromForm('eu-');
  const hasInfo=Object.values(customerInfo).some(v=>v);
  if(hasInfo)u.customerInfo=customerInfo;
  else delete u.customerInfo;
  document.getElementById('edit-user-modal').remove();
  renderUsers();
  renderAll();
  saveData();
  toast('t-users','✅ הפרטים נשמרו!');
  // אם מודאל ניהול חנות פתוח עבור החנות הזו — רענן אותו
  if(u.storeId){
    const sm=document.getElementById('store-manager-modal');
    if(sm)setTimeout(()=>renderStoreManager(u.storeId),50);
  }
}

// עריכת פרטי לקוח דרך הקשר חנות (משמש את מודאל ניהול חנות)
function editStoreCustomerInfo(storeId){
  const u=users.find(x=>x.storeId===storeId);
  if(u){
    editUserInfo(u.id);
    return;
  }
  // חנות יתומה ללא משתמש — נערוך פרטים על אובייקט החנות עצמו
  const s=stores.find(x=>x.id===storeId);
  if(!s)return;
  const ci=s.customerInfo||{};
  let m=document.getElementById('edit-user-modal');
  if(m)m.remove();
  m=document.createElement('div');
  m.id='edit-user-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML=`
    <div style="background:#3a4556;border:1px solid #5a6478;border-radius:14px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;direction:rtl;">
      <div style="padding:16px 20px;border-bottom:1px solid #475467;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:16px;font-weight:700;color:#fff;">📝 ערוך פרטי לקוח — ${s.name}</div>
        <button onclick="document.getElementById('edit-user-modal').remove()" style="background:none;border:none;color:#888;font-size:22px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div style="padding:18px 20px;">
        <div class="g2">
          <div><label class="lbl">שם העסק</label><input id="eu-biz" value="${ci.bizName||''}" placeholder="למשל: גיימינג ת״א"/></div>
          <div><label class="lbl">שם איש קשר</label><input id="eu-cname" value="${ci.contactName||''}" placeholder="שם מלא"/></div>
        </div>
        <div class="g2">
          <div><label class="lbl">ת.ז / ח.פ</label><input id="eu-id" value="${ci.idNum||''}" placeholder="מספר זהות או ח.פ"/></div>
          <div><label class="lbl">📞 נייד</label><input id="eu-phone" value="${ci.phone||''}" placeholder="050-0000000" type="tel"/></div>
        </div>
        <div class="g2">
          <div><label class="lbl">כתובת</label><input id="eu-address" value="${ci.address||''}" placeholder="רחוב ומספר"/></div>
          <div><label class="lbl">עיר</label><input id="eu-city" value="${ci.city||''}" placeholder="עיר"/></div>
        </div>
        <div><label class="lbl">📧 אימייל</label><input id="eu-email" value="${ci.email||''}" placeholder="example@gmail.com" type="email"/></div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button onclick="saveStoreCustomerInfo('${storeId}')" class="gbtn" style="flex:2;">💾 שמור שינויים</button>
          <button onclick="document.getElementById('edit-user-modal').remove()" style="flex:1;background:#2a2a2a;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">ביטול</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
}

function saveStoreCustomerInfo(storeId){
  const s=stores.find(x=>x.id===storeId);
  if(!s)return;
  const customerInfo=getCustInfoFromForm('eu-');
  const hasInfo=Object.values(customerInfo).some(v=>v);
  if(hasInfo)s.customerInfo=customerInfo;
  else delete s.customerInfo;
  document.getElementById('edit-user-modal').remove();
  renderUsers();
  renderAll();
  saveData();
  toast('t-users','✅ הפרטים נשמרו!');
  // אם מודאל ניהול חנות פתוח — רענן אותו
  const sm=document.getElementById('store-manager-modal');
  if(sm)setTimeout(()=>renderStoreManager(storeId),50);
}

// ============================================================
// ============ מודאל ניהול חנות מאוחד ============
// פותח חלון אחד עם: קרדיט/חוב, טעינה, מסגרת חוב,
// מוצרים מושבתים, מחירים, תצוגת חנות, הקפאה ומחיקה.
// ============================================================
function closeStoreManager(){
  const m=document.getElementById('store-manager-modal');
  if(m)m.remove();
}

function openStoreManager(storeId){
  const s=stores.find(x=>x.id===storeId);
  if(!s)return;
  closeStoreManager();
  renderStoreManager(storeId);
}

function renderStoreManager(storeId){
  const s=stores.find(x=>x.id===storeId);
  if(!s)return;
  // הסר תצוגה קיימת אם קיימת
  const ex=document.getElementById('store-manager-modal');
  if(ex)ex.remove();

  const cs=creditStatus(s);
  const tier=TIERS[s.tier]||TIERS.normal;
  const pct=s.maxCredit>0?Math.max(0,Math.round(s.credit/s.maxCredit*100)):0;
  const bc=s.credit<=0?'empty':pct<20?'low':'';
  const u=users.find(x=>x.storeId===s.id);
  const ci=(u&&u.customerInfo)?u.customerInfo:(s.customerInfo||{});
  const disabledCount=(s.disabledProds||[]).length;
  const totalProds=(typeof PRODS!=='undefined'&&Array.isArray(PRODS))?PRODS.length:0;

  const m=document.createElement('div');
  m.id='store-manager-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;';
  m.onclick=function(e){if(e.target===m)closeStoreManager();};

  m.innerHTML=`
    <div style="background:#3a4556;border:1px solid #5a6478;border-radius:14px;max-width:640px;width:100%;max-height:92vh;overflow-y:auto;">
      <!-- כותרת -->
      <div style="padding:16px 20px;border-bottom:1px solid #475467;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;position:sticky;top:0;background:#3a4556;z-index:1;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:17px;font-weight:700;color:#fff;">${s.name}</span>
            <span class="badge ${cs.cls}">${cs.txt}</span>
            <span class="badge ${tier.b}">${tier.l}</span>
            ${s.frozen?'<span style="background:#1e3a5f;color:#7cb3ff;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">🧊 מוקפא</span>':''}
            ${s.openingUnpaid?'<span style="background:#1a1300;color:#ef9f27;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">📥 פתיחה לא שולמה</span>':''}
          </div>
          ${ci.contactName?`<div style="font-size:12px;color:#888;margin-top:4px;">👤 ${ci.contactName}${ci.phone?' · 📞 '+ci.phone:''}</div>`:''}
          ${u?`<div style="font-size:11px;color:#39e600;margin-top:2px;">🔐 ${u.username} / ${u.password}</div>`:`<div style="font-size:11px;color:#ef9f27;margin-top:2px;">⚠️ ללא משתמש מוגדר</div>`}
        </div>
        <button onclick="closeStoreManager()" style="background:none;border:none;color:#888;font-size:24px;cursor:pointer;line-height:1;padding:0 6px;">×</button>
      </div>

      <div style="padding:18px 20px;">

        <!-- קרדיט ויתרה -->
        <div style="background:#2d3748;border:1px solid #5a6478;border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
            <span style="font-size:12px;color:#888;font-weight:600;">💰 יתרת קרדיט</span>
            <span style="font-size:11px;color:#666;">${s.credit.toLocaleString()} מתוך ₪${s.maxCredit.toLocaleString()}</span>
          </div>
          <div class="cbar-wrap"><div class="cbar ${bc}" style="width:${pct}%"></div></div>
          <div class="cnums" style="margin-top:6px;">
            <span>יתרה: <strong style="color:${s.credit<0?'#e24b4a':'#39e600'};">${s.credit<0?'חוב: ':''}₪${Math.abs(s.credit).toLocaleString()}</strong></span>
            <span>${pct}%</span>
          </div>
          ${s.debtLimit>0?`<div style="font-size:11px;color:#ef9f27;margin-top:6px;">⚠️ מסגרת חוב: ₪${s.debtLimit.toLocaleString()}${s.credit<0?' · נוצל: ₪'+Math.abs(s.credit).toLocaleString():''}</div>`:''}
        </div>

        ${s.openingUnpaid?`<div style="background:#1a1300;border:1px solid #3a2a00;border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:12px;font-weight:700;color:#ef9f27;">📥 קרדיט פתיחה לא שולם</div>
            <div style="font-size:11px;color:#bb8030;margin-top:2px;">סכום: ₪${Number(s.openingAmount||0).toLocaleString()}${s.openingDate?' · '+s.openingDate:''}</div>
          </div>
          <button onclick="markOpeningPaid('${s.id}');setTimeout(()=>renderStoreManager('${s.id}'),50);" style="background:#39e600;color:#000;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">✅ סמן שולם</button>
        </div>`:''}

        <!-- פרטי לקוח -->
        <div style="background:#2d3748;border:1px solid #5a6478;border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:12px;color:#888;font-weight:600;">📋 פרטי לקוח</span>
            <button onclick="editStoreCustomerInfo('${s.id}');" style="background:#0a2a3a;color:#7cdfff;border:1px solid #1a4a5a;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">📝 ערוך פרטים</button>
          </div>
          ${(ci.bizName||ci.contactName||ci.idNum||ci.phone||ci.email||ci.address||ci.city)
            ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:12px;">
                ${ci.bizName?`<div><span style="color:#666;">עסק:</span> <span style="color:#ddd;">${ci.bizName}</span></div>`:''}
                ${ci.contactName?`<div><span style="color:#666;">איש קשר:</span> <span style="color:#ddd;">${ci.contactName}</span></div>`:''}
                ${ci.idNum?`<div><span style="color:#666;">ת.ז/ח.פ:</span> <span style="color:#ddd;">${ci.idNum}</span></div>`:''}
                ${ci.phone?`<div><span style="color:#666;">טלפון:</span> <a href="tel:${ci.phone}" style="color:#7cb3ff;text-decoration:none;">${ci.phone}</a></div>`:''}
                ${ci.email?`<div style="grid-column:1 / -1;"><span style="color:#666;">אימייל:</span> <a href="mailto:${ci.email}" style="color:#7cb3ff;text-decoration:none;">${ci.email}</a></div>`:''}
                ${ci.address||ci.city?`<div style="grid-column:1 / -1;"><span style="color:#666;">כתובת:</span> <span style="color:#ddd;">${[ci.address,ci.city].filter(x=>x).join(', ')}</span></div>`:''}
              </div>`
            : '<div style="font-size:12px;color:#666;font-style:italic;">אין פרטי לקוח — לחץ "ערוך פרטים" להוספה</div>'
          }
        </div>

        <!-- טעינת קרדיט / הפחתה -->
        <div style="background:#2d3748;border:1px solid #5a6478;border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="font-size:12px;color:#888;font-weight:600;margin-bottom:8px;">⚡ עדכון קרדיט</div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <input id="sm-topup-amt" type="number" min="0" placeholder="סכום (₪)" style="flex:1;background:#3a4556;border:1px solid #5a6478;border-radius:8px;padding:9px 12px;color:#fff;font-size:13px;font-family:inherit;" onkeydown="if(event.key==='Enter')smTopup('${s.id}')"/>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="gbtn" onclick="smTopup('${s.id}')" style="flex:1;white-space:nowrap;">📥 טען +</button>
            <button onclick="smReduce('${s.id}')" style="flex:1;background:linear-gradient(135deg,#552020,#7a2828);color:#fff;border:1px solid #8a3030;border-radius:10px;padding:9px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">📤 הפחת −</button>
          </div>
        </div>

        <!-- 💳 חוב פתוח -->
        <div style="background:linear-gradient(135deg,#3a2828,#2d3748);border:1px solid ${(s.unpaidBalance||0)>0?'#8a3030':'#5a6478'};border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-size:12px;color:#888;font-weight:600;">💳 חוב פתוח</div>
              <div style="font-size:22px;font-weight:800;color:${(s.unpaidBalance||0)>0?'#ef9f27':'#888'};margin-top:2px;">₪${(s.unpaidBalance||0).toLocaleString()}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${(s.unpaidBalance||0)>0
                ? `<button onclick="recordPayment('${s.id}');setTimeout(()=>renderStoreManager('${s.id}'),100);" style="background:linear-gradient(135deg,#39e600,#2ab800);color:#000;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">💰 שולם לי...</button>`
                : ''
              }
              <button onclick="setUnpaidBalance('${s.id}');setTimeout(()=>renderStoreManager('${s.id}'),100);" style="background:#475467;color:#fff;border:1px solid #5a6478;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">✏️ ערוך סכום</button>
            </div>
          </div>
          ${s.unpaidUpdatedAt?`<div style="font-size:11px;color:#666;text-align:left;">עודכן: ${new Date(s.unpaidUpdatedAt).toLocaleString('he-IL')}</div>`:''}
        </div>

        <!-- פעולות מנהליות -->
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;">
          <button onclick="setDebtLimit('${s.id}');setTimeout(()=>renderStoreManager('${s.id}'),50);" style="background:#1a1300;color:#ef9f27;border:1px solid #3a2a00;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>💳</span><span>מסגרת חוב</span>
          </button>
          <button onclick="manageProducts('${s.id}')" style="background:#0a1a2a;color:#7cb3ff;border:1px solid #1e3a5f;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>🎮</span><span>מוצרים${disabledCount>0?` (${totalProds-disabledCount}/${totalProds})`:''}</span>
          </button>
          <button onclick="closeStoreManager();editPrices('${s.id}');" style="background:#0a2a1a;color:#39e600;border:1px solid #1a5a3a;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>💲</span><span>עריכת מחירים</span>
          </button>
          <button onclick="closeStoreManager();prevStore('${s.id}');" style="background:#1a0a2a;color:#c490ff;border:1px solid #3a1a5f;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>👁️</span><span>תצוגת חנות</span>
          </button>
        </div>

        <!-- מצב/מחיקה -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:12px;border-top:1px solid #475467;">
          ${s.frozen
            ? `<button onclick="unfreezeStore('${s.id}');setTimeout(()=>renderStoreManager('${s.id}'),50);" style="background:#1e3a5f;color:#7cb3ff;border:1px solid #2a5288;border-radius:10px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">🔥 הפשר חנות</button>`
            : `<button onclick="freezeStore('${s.id}');setTimeout(()=>renderStoreManager('${s.id}'),50);" style="background:#0a1a2a;color:#7cb3ff;border:1px solid #1e3a5f;border-radius:10px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">🧊 הקפא חנות</button>`
          }
          <button onclick="closeStoreManager();deleteStorePerm('${s.id}');" style="background:#3a0a0a;color:#ff7070;border:1px solid #5a1010;border-radius:10px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">🗑️ מחק לצמיתות</button>
        </div>

        ${!u?`<div style="margin-top:14px;padding:10px 12px;background:#1a1300;border:1px solid #3a2a00;border-radius:10px;font-size:12px;color:#ef9f27;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>⚠️ אין משתמש מקושר לחנות זו</span>
          <button onclick="closeStoreManager();goCreateUser('${s.id}');" style="background:#39e600;color:#000;border:none;border-radius:6px;padding:5px 11px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">➕ צור משתמש</button>
        </div>`:''}

      </div>
    </div>
  `;
  document.body.appendChild(m);
}

// טעינת קרדיט מתוך המודאל המאוחד
function smTopup(storeId){
  const inp=document.getElementById('sm-topup-amt');
  if(!inp)return;
  const amt=parseInt(inp.value)||0;
  if(amt<=0){
    inp.style.borderColor='#552020';
    inp.focus();
    return;
  }
  inp.style.borderColor='';
  topup(storeId,amt);
  // רענון המודאל לעדכון הבר ויתרה
  setTimeout(function(){renderStoreManager(storeId);},50);
}

// הפחתת קרדיט מתוך המודאל המאוחד
async function smReduce(storeId){
  const inp=document.getElementById('sm-topup-amt');
  if(!inp)return;
  const amt=parseInt(inp.value)||0;
  if(amt<=0){
    inp.style.borderColor='#552020';
    inp.focus();
    return;
  }
  inp.style.borderColor='';
  // אישור עם פירוט
  var s=stores.find(function(x){return x.id===storeId;});
  if(!s)return;
  var msg='יתרה נוכחית: ₪'+s.credit.toLocaleString()+'\n';
  msg+='סכום ההפחתה: ₪'+amt.toLocaleString()+'\n';
  msg+='יתרה חדשה: ₪'+(s.credit-amt).toLocaleString();
  if((s.unpaidBalance||0)>0){
    var newUnpaid=Math.max(0,(s.unpaidBalance||0)-amt);
    msg+='\n💳 חוב פתוח: ₪'+s.unpaidBalance.toLocaleString()+' → ₪'+newUnpaid.toLocaleString();
  }
  if(!await cpConfirm(msg,{type:'warning',title:'➖ הפחתת קרדיט — '+s.name,okText:'הפחת'}))return;
  // בקשת סיבה
  var reason=await cpPrompt('למשל: "תיקון טעות", "החזר", "זיכוי"',{
    title:'סיבת ההפחתה (אופציונלי)',
    icon:'📝',
    placeholder:'אפשר להשאיר ריק'
  });
  if(reason===null)return;
  reason=(reason||'').trim();
  reduceCredit(storeId,amt,reason);
  // רענון המודאל
  setTimeout(function(){renderStoreManager(storeId);},50);
}


// ===== הגדרות עמוד וסינון לטבלת המשתמשים =====
let usersPage=1;
const USERS_PER_PAGE=15;

function clearUserFilters(){
  const s=document.getElementById('uf-search');if(s)s.value='';
  const c=document.getElementById('uf-city');if(c)c.value='';
  const st=document.getElementById('uf-status');if(st)st.value='';
  usersPage=1;
  renderUsersTable();
}

function renderUsers(){
  // מעדכנים את התפריטים, את הטבלה, וקוראים לפונקציה המתקדמת
  try{updateUserStoreLink();}catch(e){console.error(e);}
  try{renderUsersTable();}catch(e){console.error('renderUsersTable failed:',e);}
  // עדכון סטטיסטיקות החנויות שהועברו לדף זה
  try{updateStats();}catch(e){console.error('updateStats failed:',e);}
  // עדכון תצוגת שער הדולר שעברה לדף זה
  try{if(typeof updateDollarDisplay==='function')updateDollarDisplay();}catch(e){}
  // עדכון תצוגת טופס הוספה (חנות חדשה / קיימת / משווק / אדמין)
  try{if(typeof updateAddFormVisibility==='function')updateAddFormVisibility();}catch(e){}
}

function renderUsersTable(){
  try{
    const tbody=document.getElementById('users-table-body');
    if(!tbody)return;
    const userList=Array.isArray(users)?users:[];
    const storeList=Array.isArray(stores)?stores:[];

    // עדכון תפריט עיר (פעם אחת בלבד)
    const citySel=document.getElementById('uf-city');
    if(citySel){
      const cities=Array.from(new Set(storeList.map(s=>(s.customerInfo&&s.customerInfo.city)||'').filter(c=>c))).sort();
      const currentCity=citySel.value;
      citySel.innerHTML='<option value="">— הכל —</option>'+cities.map(c=>`<option value="${c}">${c}</option>`).join('');
      citySel.value=currentCity;
    }

    // בניית רשימת רשומות מאוחדת:
    // 1. כל החנויות (גם שאין להן משתמש) - חוץ מ"ברירת מחדל" שהיא חנות פנימית
    // 2. + משתמשים שאינם מקושרים לחנות (אדמין, משווק)
    const rows=[];
    storeList.forEach(s=>{
      if(s.id==='default')return; // החנות הפנימית לא מוצגת
      const u=userList.find(x=>x.storeId===s.id);
      // עדיפות: customerInfo של המשתמש > של החנות > ריק
      const ci=(u&&u.customerInfo)?u.customerInfo:(s.customerInfo||{});
      rows.push({
        kind:'store',
        store:s,
        user:u,
        name:s.name,
        username:u?u.username:'',
        password:u?u.password:'',
        phone:ci.phone||'',
        email:ci.email||'',
        city:ci.city||'',
        bizName:ci.bizName||'',
        contactName:ci.contactName||'',
        idNum:ci.idNum||'',
        address:ci.address||'',
        role:'store',
        frozen:!!s.frozen,
        hasUser:!!u
      });
    });
    userList.forEach(u=>{
      if(u.storeId)return; // כבר נכלל למעלה
      const ci=u.customerInfo||{};
      rows.push({
        kind:'user',
        store:null,
        user:u,
        name:u.username,
        username:u.username,
        password:u.password,
        phone:ci.phone||'',email:ci.email||'',city:ci.city||'',
        bizName:ci.bizName||'',contactName:ci.contactName||'',idNum:ci.idNum||'',address:ci.address||'',
        role:u.role,
        frozen:false,
        hasUser:true
      });
    });

    // החלת מסננים
    const searchVal=(document.getElementById('uf-search')||{}).value||'';
    const cityVal=(document.getElementById('uf-city')||{}).value||'';
    const statusVal=(document.getElementById('uf-status')||{}).value||'';
    const search=searchVal.trim().toLowerCase();

    let filtered=rows.filter(r=>{
      if(cityVal&&r.city!==cityVal)return false;
      if(statusVal){
        if(statusVal==='frozen'&&!r.frozen)return false;
        if(statusVal==='active'&&(r.frozen||!r.hasUser||r.role!=='store'))return false;
        if(statusVal==='nouser'&&(r.hasUser||r.role!=='store'))return false;
        if(statusVal==='admin'&&r.role!=='admin')return false;
        if(statusVal==='reseller'&&r.role!=='reseller')return false;
      }
      if(search){
        const haystack=[r.name,r.username,r.phone,r.email,r.bizName,r.contactName,r.idNum,r.city,r.address].join(' ').toLowerCase();
        if(haystack.indexOf(search)===-1)return false;
      }
      return true;
    });

    // עדכון מונה
    const badge=document.getElementById('users-count-badge');
    if(badge){
      if(filtered.length===rows.length)badge.textContent=rows.length+' רשומות';
      else badge.textContent=filtered.length+' מתוך '+rows.length;
    }

    // חלוקה לעמודים
    const totalPages=Math.max(1,Math.ceil(filtered.length/USERS_PER_PAGE));
    if(usersPage>totalPages)usersPage=totalPages;
    const startIdx=(usersPage-1)*USERS_PER_PAGE;
    const pageRows=filtered.slice(startIdx,startIdx+USERS_PER_PAGE);

    if(filtered.length===0){
      tbody.innerHTML='<tr><td colspan="10" style="padding:30px;text-align:center;color:#999;">'+(rows.length===0?'אין רשומות עדיין':'אין תוצאות התואמות את החיפוש')+'</td></tr>';
      const pag=document.getElementById('users-pagination');
      if(pag)pag.innerHTML='';
      return;
    }

    tbody.innerHTML=pageRows.map((r,i)=>{
      const idx=startIdx+i+1;
      // תגית סוג
      let typeBadge='';
      if(r.role==='admin')typeBadge='<span style="background:#1a3a5f;color:#7cb3ff;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">👑 אדמין</span>';
      else if(r.role==='reseller')typeBadge='<span style="background:#3a1a5f;color:#c490ff;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">💼 משווק</span>';
      else typeBadge='<span style="background:#0a3a0a;color:#39e600;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">🏪 חנות</span>';
      // תגית סטטוס
      let statusBadge='';
      if(r.frozen)statusBadge='<span style="background:#1a3a5f;color:#7cb3ff;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">🧊 מוקפא</span>';
      else if(r.role==='store'&&!r.hasUser)statusBadge='<span style="background:#3a2a0a;color:#ef9f27;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">⚠️ ללא משתמש</span>';
      else statusBadge='<span style="background:#0f3a0f;color:#39e600;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">✓ פעיל</span>';

      // פעולות
      let actions='';
      if(r.kind==='store'){
        actions+=`<button onclick="openStoreManager('${r.store.id}')" title="ניהול חנות (קרדיט / מסגרת / מוצרים / מחירים)" style="background:linear-gradient(135deg,#0a3a0a,#0f5a0f);color:#39e600;border:1px solid #1a5a1a;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">⚙️ ניהול</button>`;
      }
      if(r.user){
        actions+=`<button onclick="editUserInfo('${r.user.id}')" title="ערוך פרטי לקוח" style="background:#0a2a3a;color:#7cdfff;border:1px solid #1a4a5a;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">📝</button>`;
        actions+=`<button onclick="changePass('${r.user.id}')" title="שנה סיסמה" style="background:#1a3a5f;color:#7cb3ff;border:1px solid #2a5288;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">🔑</button>`;
        // כפתור ניהול למשווק - פותח מודאל לניהול חנויות מוצמדות
        if(r.user.role==='reseller'){
          actions+=`<button onclick="openResellerManager('${r.user.id}')" title="ניהול משווק (חנויות מוצמדות, סטטיסטיקה)" style="background:linear-gradient(135deg,#3a1a5f,#5a2a8f);color:#c490ff;border:1px solid #5a2a8f;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">💼 ניהול</button>`;
        }
      }
      if(r.kind==='store'){
        if(!r.hasUser){
          actions+=`<button onclick="goCreateUser('${r.store.id}')" title="צור משתמש לחנות" style="background:#0a3a0a;color:#39e600;border:1px solid #1a5a1a;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">➕</button>`;
        }
        if(r.frozen){
          actions+=`<button onclick="unfreezeStore('${r.store.id}')" title="הפשר חנות" style="background:#1e3a5f;color:#7cb3ff;border:1px solid #2a5288;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">🔥</button>`;
        }else{
          actions+=`<button onclick="freezeStore('${r.store.id}')" title="הקפא חנות" style="background:#0a1a2a;color:#7cb3ff;border:1px solid #1e3a5f;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">🧊</button>`;
        }
        actions+=`<button onclick="deleteStorePerm('${r.store.id}')" title="מחק חנות לצמיתות" style="background:#3a0a0a;color:#ff7070;border:1px solid #5a1010;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">🗑️</button>`;
      }else if(r.user&&r.user.id!=='admin'){
        actions+=`<button onclick="delUser('${r.user.id}')" title="מחק משתמש" style="background:#3a0a0a;color:#ff7070;border:1px solid #5a1010;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;">🗑️</button>`;
      }

      // תיבת תצוגה למשתמש (שם + סיסמה)
      const userCell=r.username
        ? `<div style="font-weight:700;color:#111;font-size:12px;">${r.username}</div><div style="font-size:10px;color:#aaa;font-family:monospace;">${r.password||''}</div>`
        : '<span style="color:#bbb;font-size:11px;">—</span>';
      // תיבת תצוגה לשם / חנות
      const nameCell=r.kind==='store'
        ? `<div style="font-weight:700;color:#111;">${r.name}</div>${r.bizName?`<div style="font-size:10px;color:#888;">${r.bizName}</div>`:''}`
        : `<div style="font-weight:700;color:#111;">${r.name}</div>`;

      return `<tr style="border-bottom:1px solid #f0f0f0;${r.frozen?'opacity:0.55;':''}" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background=''">
        <td style="padding:8px 6px;text-align:center;color:#999;font-size:11px;">${idx}</td>
        <td style="padding:8px 6px;">${typeBadge}</td>
        <td style="padding:8px 6px;">${nameCell}</td>
        <td style="padding:8px 6px;">${userCell}</td>
        <td style="padding:8px 6px;color:#555;font-size:11px;">${r.phone?'<a href="tel:'+r.phone+'" style="color:#1976d2;text-decoration:none;">'+r.phone+'</a>':'<span style="color:#bbb;">—</span>'}</td>
        <td style="padding:8px 6px;color:#555;font-size:11px;">${r.email?'<a href="mailto:'+r.email+'" style="color:#1976d2;text-decoration:none;">'+r.email+'</a>':'<span style="color:#bbb;">—</span>'}</td>
        <td style="padding:8px 6px;color:#555;font-size:11px;">${r.city||'<span style="color:#bbb;">—</span>'}</td>
        <td style="padding:8px 6px;color:#555;font-size:11px;">${r.contactName||'<span style="color:#bbb;">—</span>'}</td>
        <td style="padding:8px 6px;text-align:center;">${statusBadge}</td>
        <td style="padding:8px 6px;text-align:center;white-space:nowrap;">${actions}</td>
      </tr>`;
    }).join('');

    // עיצוב פסטקת חלוקה לעמודים
    const pag=document.getElementById('users-pagination');
    if(pag){
      if(totalPages<=1){pag.innerHTML='';}
      else{
        let html='';
        const btnStyle='background:#fff;border:1px solid #ddd;border-radius:6px;padding:6px 11px;font-size:12px;cursor:pointer;color:#555;font-family:inherit;font-weight:600;min-width:32px;';
        const activeStyle='background:#39e600;border:1px solid #39e600;border-radius:6px;padding:6px 11px;font-size:12px;color:#000;font-family:inherit;font-weight:700;min-width:32px;';
        const disabledStyle=btnStyle+'opacity:0.4;cursor:not-allowed;';
        html+=`<button ${usersPage===1?'disabled':''} onclick="usersPage=1;renderUsersTable()" style="${usersPage===1?disabledStyle:btnStyle}">«</button>`;
        html+=`<button ${usersPage===1?'disabled':''} onclick="usersPage--;renderUsersTable()" style="${usersPage===1?disabledStyle:btnStyle}">‹</button>`;
        // הצגת כפתורי דפים (חלון של 5 דפים מסביב לנוכחי)
        const start=Math.max(1,usersPage-2);
        const end=Math.min(totalPages,start+4);
        for(let p=start;p<=end;p++){
          if(p===usersPage)html+=`<button style="${activeStyle}">${p}</button>`;
          else html+=`<button onclick="usersPage=${p};renderUsersTable()" style="${btnStyle}">${p}</button>`;
        }
        html+=`<button ${usersPage===totalPages?'disabled':''} onclick="usersPage++;renderUsersTable()" style="${usersPage===totalPages?disabledStyle:btnStyle}">›</button>`;
        html+=`<button ${usersPage===totalPages?'disabled':''} onclick="usersPage=${totalPages};renderUsersTable()" style="${usersPage===totalPages?disabledStyle:btnStyle}">»</button>`;
        html+=`<span style="color:#888;font-size:11px;margin-right:10px;">עמוד ${usersPage} מתוך ${totalPages}</span>`;
        pag.innerHTML=html;
      }
    }
  }catch(err){
    console.error('renderUsersTable failed:',err);
    const tbody=document.getElementById('users-table-body');
    if(tbody)tbody.innerHTML='<tr><td colspan="10" style="padding:20px;text-align:center;color:#e24b4a;">שגיאה: '+(err.message||err)+'</td></tr>';
  }
}

// ============ UTILS ============
function toast(id,msg){
  const t=document.getElementById(id);if(!t)return;
  t.textContent=msg;t.classList.add('on');
  setTimeout(()=>t.classList.remove('on'),2500);
}

function aTab(el,id){
  document.querySelectorAll('.atab').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');
  ['sec-dash','sec-orders','sec-log','sec-stats','sec-debts','sec-monthly','sec-security'].forEach(s=>{
    const el=document.getElementById(s);
    if(el)el.style.display='none';
  });
  const target=document.getElementById(id);
  if(target)target.style.display='block';
  if(id==='sec-orders')renderOrders();
  if(id==='sec-log')renderLog();
  if(id==='sec-stats'){updateStats();renderDebts();renderStoresTable();}
  if(id==='sec-dash')renderDashboard();
  if(id==='sec-debts')renderDebtsTab();
  if(id==='sec-monthly')renderMonthlyReport();
  if(id==='sec-security')renderSecurityTab();
}

// ============ EXCEL EXPORT ============
function downloadCSV(filename, rows){
  const BOM='\uFEFF'; // תמיכה בעברית באקסל
  const csv=BOM+rows.map(r=>r.map(cell=>{
    const s=String(cell===null||cell===undefined?'':cell);
    return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s;
  }).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;a.click();
  URL.revokeObjectURL(url);
}

function exportOrders(){
  if(!orders.length){toast('t-admin','אין הזמנות לייצוא');return;}
  const rows=[
    ['תאריך','שעה','חנות','מוצר','כמות','משתמש','הערה','מחיר','סטטוס'],
    ...orders.map(o=>[
      new Date().toLocaleDateString('he-IL'),
      o.time,
      o.storeName,
      o.prod,
      o.pkg,
      o.user,
      o.note||'',
      o.price,
      o.status==='done'?'הושלם':'ממתין'
    ])
  ];
  downloadCSV(`הזמנות_${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.csv`,rows);
  toast('t-admin','✅ הדוח הורד בהצלחה!');
}

function exportStores(){
  if(!stores.length){toast('t-admin','אין חנויות לייצוא');return;}
  const rows=[
    ['שם חנות','רמת מחיר','קרדיט נוכחי','קרדיט מקסימלי','סה"כ הזמנות','סה"כ הכנסות'],
    ...stores.map(s=>{
      const so=orders.filter(o=>o.storeId===s.id);
      const rev=so.filter(o=>o.status==='done').reduce((t,o)=>t+o.price,0);
      return[s.name,s.tier,s.credit,s.maxCredit,so.length,rev];
    })
  ];
  downloadCSV(`חנויות_${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.csv`,rows);
  toast('t-admin','✅ הדוח הורד בהצלחה!');
}

function exportByStore(){
  if(!orders.length){toast('t-admin','אין הזמנות לייצוא');return;}
  const rows=[['חנות','שעה','מוצר','כמות','משתמש','מחיר','סטטוס']];
  stores.forEach(s=>{
    const so=orders.filter(o=>o.storeId===s.id);
    if(!so.length)return;
    rows.push([`--- ${s.name} ---`,'','','','','','']);
    so.forEach(o=>rows.push(['',o.time,o.prod,o.pkg,o.user,o.price,o.status==='done'?'הושלם':'ממתין']));
    const rev=so.filter(o=>o.status==='done').reduce((t,o)=>t+o.price,0);
    rows.push(['','','','','',`סה"כ: ₪${rev}`,'']);
  });
  downloadCSV(`הזמנות_לפי_חנות_${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.csv`,rows);
  toast('t-admin','✅ הדוח הורד בהצלחה!');
}

function exportSummary(){
  const totalOrders=orders.length;
  const doneOrders=orders.filter(o=>o.status==='done');
  const totalRev=doneOrders.reduce((t,o)=>t+o.price,0);
  const pending=orders.filter(o=>o.status==='new');
  const totalCredit=stores.reduce((t,s)=>t+s.credit,0);
  // מוצרים פופולריים
  const prodCount={};
  orders.forEach(o=>{prodCount[o.prod]=(prodCount[o.prod]||0)+1;});
  const topProds=Object.entries(prodCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const rows=[
    ['דוח סיכום CASHPHONE',''],
    ['תאריך',new Date().toLocaleDateString('he-IL')],
    ['',''],
    ['סה"כ הזמנות',totalOrders],
    ['הזמנות שהושלמו',doneOrders.length],
    ['הזמנות ממתינות',pending.length],
    ['סה"כ הכנסות (הושלם)',`₪${totalRev}`],
    ['סה"כ קרדיט פעיל',`₪${totalCredit}`],
    ['',''],
    ['מוצרים פופולריים','כמות הזמנות'],
    ...topProds.map(([name,cnt])=>[name,cnt]),
    ['',''],
    ['הכנסות לפי חנות',''],
    ...stores.map(s=>{
      const rev=orders.filter(o=>o.storeId===s.id&&o.status==='done').reduce((t,o)=>t+o.price,0);
      return[s.name,`₪${rev}`];
    })
  ];
  downloadCSV(`דוח_סיכום_${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.csv`,rows);
  toast('t-admin','✅ הדוח הורד בהצלחה!');
}


// ===== עזר: חישוב טווחי תאריכים =====
function getMonthRange(monthsBack){
  monthsBack=monthsBack||0;
  const now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth()-monthsBack,1);
  const end=new Date(now.getFullYear(),now.getMonth()-monthsBack+1,1);
  return {start:start.getTime(),end:end.getTime()};
}

// פרסור תאריך מהזמנה (תומך בכמה פורמטים שיש בקוד)
function getOrderDate(order){
  if(!order)return 0;
  // אם יש שדה ts מספרי - ניקח אותו
  if(order.ts&&!isNaN(order.ts))return Number(order.ts);
  if(order.id&&!isNaN(order.id))return Number(order.id);
  if(order.invoiceDate&&order.invoiceTime){
    const parts=String(order.invoiceDate).split('/');
    if(parts.length===3){
      const d=new Date(parseInt(parts[2]),parseInt(parts[1])-1,parseInt(parts[0]));
      return d.getTime();
    }
  }
  return 0;
}

// בדיקה אם הזמנה היא בחודש מסוים
function orderInMonth(order,monthsBack){
  const r=getMonthRange(monthsBack);
  const t=getOrderDate(order);
  if(!t)return false;
  return t>=r.start&&t<r.end;
}

// חישוב רווח להזמנה (מחיר - עלות בש"ח)
function getOrderProfit(order){
  // אם יש שדה profit ישיר
  if(order.profit!=null)return Number(order.profit);
  // ננסה לחשב מ-storeCost ו-myPrice (לעסקאות מסוג load)
  if(order.storeCost!=null&&order.myPrice!=null){
    return Number(order.myPrice)-Number(order.storeCost);
  }
  // אחרת - לפי מחיר ההזמנה והדולר עלות (אם יש)
  const price=Number(order.price||0);
  // נחפש את המוצר ונשער עלות לפי dollarCosts
  if(order.prod&&order.pkg){
    const prod=PRODS.find(p=>p.name===order.prod);
    if(prod){
      const pkg=prod.pkgs.find(pg=>pg.a===order.pkg);
      if(pkg){
        const usdCost=getDollarCost(prod,pkg);
        const ilsCost=Math.round(usdCost*dollarRate);
        return price-ilsCost;
      }
    }
  }
  return 0;
}

function renderDashboard(){
  try{
    // === חישובי הבסיס ===
    const ordersThisMonth=orders.filter(o=>orderInMonth(o,0));
    const ordersLastMonth=orders.filter(o=>orderInMonth(o,1));
    const doneThisMonth=ordersThisMonth.filter(o=>o.status==='done');
    const doneLastMonth=ordersLastMonth.filter(o=>o.status==='done');

    const revThis=doneThisMonth.reduce((t,o)=>t+Number(o.price||0),0);
    const revLast=doneLastMonth.reduce((t,o)=>t+Number(o.price||0),0);
    const profitThis=doneThisMonth.reduce((t,o)=>t+getOrderProfit(o),0);
    const profitLast=doneLastMonth.reduce((t,o)=>t+getOrderProfit(o),0);

    // === KPI 1: הכנסות החודש ===
    const kpiRev=document.getElementById('kpi-rev');
    if(kpiRev)kpiRev.textContent='₪'+Math.round(revThis).toLocaleString();
    const kpiRevTrend=document.getElementById('kpi-rev-trend');
    if(kpiRevTrend){
      if(revLast>0){
        const pct=Math.round(((revThis-revLast)/revLast)*100);
        const color=pct>=0?'#39e600':'#e24b4a';
        const arrow=pct>=0?'↑':'↓';
        kpiRevTrend.innerHTML=`<span style="color:${color};">${arrow} ${Math.abs(pct)}%</span> מול ${Math.round(revLast).toLocaleString()} ₪ בחודש שעבר`;
      }else if(revThis>0){
        kpiRevTrend.innerHTML='<span style="color:#39e600;">חודש ראשון עם הכנסות 🎉</span>';
      }else{
        kpiRevTrend.textContent='אין הכנסות עדיין החודש';
      }
    }

    // === KPI 2: רווח נקי ===
    const kpiProfit=document.getElementById('kpi-profit');
    if(kpiProfit){
      kpiProfit.textContent='₪'+Math.round(profitThis).toLocaleString();
      kpiProfit.style.color=profitThis>=0?'#39e600':'#e24b4a';
    }
    const kpiProfitTrend=document.getElementById('kpi-profit-trend');
    if(kpiProfitTrend){
      const margin=revThis>0?Math.round((profitThis/revThis)*100):0;
      kpiProfitTrend.innerHTML=`שולי רווח: <b style="color:${margin>=20?'#39e600':margin>=10?'#ef9f27':'#e24b4a'};">${margin}%</b>`;
    }

    // === KPI 3: הזמנות החודש ===
    const kpiOrders=document.getElementById('kpi-orders');
    if(kpiOrders)kpiOrders.textContent=ordersThisMonth.length.toLocaleString();
    const kpiOrdersTrend=document.getElementById('kpi-orders-trend');
    if(kpiOrdersTrend){
      const dayOfMonth=new Date().getDate();
      const dailyAvg=dayOfMonth>0?(ordersThisMonth.length/dayOfMonth).toFixed(1):0;
      kpiOrdersTrend.innerHTML=`ממוצע יומי: <b>${dailyAvg}</b> הזמנות`;
    }

    // === KPI 4: חנויות פעילות החודש ===
    const activeStoreIds=new Set(ordersThisMonth.map(o=>o.storeId).filter(x=>x));
    const kpiActive=document.getElementById('kpi-active-stores');
    if(kpiActive)kpiActive.textContent=activeStoreIds.size;
    const kpiActiveSub=document.getElementById('kpi-active-stores-sub');
    if(kpiActiveSub)kpiActiveSub.textContent='מתוך '+stores.filter(s=>!s.frozen&&s.id!=='default').length+' חנויות';

    // === KPI 5: סך החובות ===
    const creditDebts=stores.filter(s=>!s.frozen&&s.credit<0);
    const openingDebts=stores.filter(s=>!s.frozen&&s.openingUnpaid&&(s.openingAmount||0)>0);
    const totalCreditDebt=creditDebts.reduce((t,s)=>t+Math.abs(s.credit),0);
    const totalOpeningDebt=openingDebts.reduce((t,s)=>t+Number(s.openingAmount||0),0);
    const totalDebt=totalCreditDebt+totalOpeningDebt;
    const debtCount=creditDebts.length+openingDebts.length;
    const kpiDebt=document.getElementById('kpi-debt');
    if(kpiDebt)kpiDebt.textContent='₪'+Math.round(totalDebt).toLocaleString();
    const kpiDebtSub=document.getElementById('kpi-debt-sub');
    if(kpiDebtSub)kpiDebtSub.textContent=debtCount+' רשומות חוב';

    // === KPI 6: הזמנות ממתינות ===
    const pending=orders.filter(o=>o.status==='new');
    const kpiPending=document.getElementById('kpi-pending');
    if(kpiPending)kpiPending.textContent=pending.length;
    const kpiPendingSub=document.getElementById('kpi-pending-sub');
    if(kpiPendingSub)kpiPendingSub.textContent=pending.length>0?'דורשות טיפול דחוף':'הכל מטופל ✓';

    // === שער דולר ===
    const drDisp=document.getElementById('dollar-rate-display2');
    if(drDisp)drDisp.textContent='$1 = ₪'+dollarRate;

    // === הזמנות ממתינות ===
    const pendingDiv=document.getElementById('dash-pending');
    if(pendingDiv){
      if(pending.length>0){
        pendingDiv.style.display='block';
        const pl=document.getElementById('dash-pending-list');
        if(pl)pl.innerHTML=pending.slice(0,5).map(o=>
          `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a1a00;font-size:13px;">
            <span>🏪 ${o.storeName||''} — ${o.prod||''} · ${o.user||''}</span>
            <button onclick="doneOrder(${o.id});renderDashboard();" style="background:#39e600;color:#111;border:none;border-radius:5px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">בוצע ✓</button>
          </div>`
        ).join('');
      }else{
        pendingDiv.style.display='none';
      }
    }

    // === חנויות קרדיט נמוך ===
    const lowCredit=stores.filter(s=>!s.frozen&&s.maxCredit>0&&s.credit/s.maxCredit<0.2&&s.credit>0);
    const lowDiv=document.getElementById('dash-low-credit');
    if(lowDiv){
      if(lowCredit.length>0){
        lowDiv.style.display='block';
        const ll=document.getElementById('dash-low-list');
        if(ll)ll.innerHTML=lowCredit.map(s=>
          `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a0000;font-size:13px;">
            <span>${s.name}</span>
            <span style="color:#e24b4a;font-weight:700;">₪${s.credit.toLocaleString()} נותר</span>
          </div>`
        ).join('');
      }else{
        lowDiv.style.display='none';
      }
    }

    // === הזמנות אחרונות ===
    const recent=orders.slice(0,8);
    const dro=document.getElementById('dash-recent-orders');
    if(dro)dro.innerHTML=recent.length?recent.map(o=>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #475467;font-size:13px;">
        <div>
          <div style="font-weight:700;">${o.prod||''} · ${o.pkg||''}</div>
          <div style="font-size:11px;color:#666;">${o.storeName||''} · ${o.user||''} · ${o.time||''}</div>
        </div>
        <div style="text-align:left;">
          <div style="color:#39e600;font-weight:700;">₪${o.price}</div>
          <div style="font-size:11px;" class="${o.status==='done'?'b-ok done-badge':'b-low'}">${o.status==='done'?'הושלם':'ממתין'}</div>
        </div>
      </div>`
    ).join(''):'<div style="text-align:center;padding:1rem;color:#555;font-size:13px;">אין הזמנות עדיין</div>';

    // === מוצרים פופולריים (כללי - היסטוריה) ===
    const counts={};
    orders.forEach(o=>{counts[o.prod]=(counts[o.prod]||0)+1;});
    const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const dtp=document.getElementById('dash-top-products');
    if(dtp)dtp.innerHTML=top.length?top.map(([name,cnt],i)=>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #475467;font-size:13px;">
        <span>${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${name}</span>
        <span style="color:#39e600;font-weight:700;">${cnt} הזמנות</span>
      </div>`
    ).join(''):'<div style="text-align:center;padding:1rem;color:#555;font-size:13px;">אין נתונים עדיין</div>';

    // === גרף 30 ימים אחרונים ===
    drawSalesChart30Days();

    // === טופ 5 מוצרים החודש ===
    renderTopProductsThisMonth(doneThisMonth);

    // === טופ 5 חנויות החודש ===
    renderTopStoresThisMonth(doneThisMonth);
  }catch(err){
    console.error('renderDashboard failed:',err);
  }
}

// ===== ציור גרף מכירות 30 ימים =====
function drawSalesChart30Days(){
  const canvas=document.getElementById('chart-30d');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  // ריזולוציה גבוהה
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  canvas.width=rect.width*dpr;
  canvas.height=150*dpr;
  ctx.scale(dpr,dpr);
  const W=rect.width,H=150;
  ctx.clearRect(0,0,W,H);

  // איסוף נתוני 30 ימים אחרונים
  const days=[];
  const today=new Date();today.setHours(0,0,0,0);
  for(let i=29;i>=0;i--){
    const d=new Date(today);d.setDate(d.getDate()-i);
    days.push({date:d,total:0,count:0});
  }
  orders.filter(o=>o.status==='done').forEach(o=>{
    const t=getOrderDate(o);
    if(!t)return;
    const od=new Date(t);od.setHours(0,0,0,0);
    const day=days.find(d=>d.date.getTime()===od.getTime());
    if(day){day.total+=Number(o.price||0);day.count++;}
  });
  const maxV=Math.max(...days.map(d=>d.total),100);
  const totalSum=days.reduce((t,d)=>t+d.total,0);

  // עדכון סיכום
  const tot=document.getElementById('chart-30d-total');
  if(tot)tot.textContent='סה"כ: ₪'+Math.round(totalSum).toLocaleString();

  // ציור עמודות
  const padL=40,padR=10,padT=10,padB=22;
  const chartW=W-padL-padR,chartH=H-padT-padB;
  const barW=chartW/days.length;
  // קווי רשת
  ctx.strokeStyle='#475467';
  ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=padT+(chartH/4)*i;
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();
  }
  // תוויות ציר Y
  ctx.fillStyle='#666';
  ctx.font='10px Heebo, sans-serif';
  ctx.textAlign='right';
  for(let i=0;i<=4;i++){
    const y=padT+(chartH/4)*i;
    const v=Math.round(maxV*(1-i/4));
    ctx.fillText('₪'+v,padL-5,y+4);
  }
  // עמודות
  days.forEach((d,i)=>{
    const x=padL+i*barW+1;
    const h=d.total>0?(d.total/maxV)*chartH:0;
    const y=padT+chartH-h;
    if(d.total>0){
      const grad=ctx.createLinearGradient(0,y,0,y+h);
      grad.addColorStop(0,'#39e600');
      grad.addColorStop(1,'#1a8a00');
      ctx.fillStyle=grad;
      ctx.fillRect(x,y,barW-2,h);
    }
  });
  // תוויות ציר X (כל 5 ימים)
  ctx.fillStyle='#666';
  ctx.textAlign='center';
  for(let i=0;i<days.length;i+=5){
    const x=padL+i*barW+barW/2;
    const lbl=days[i].date.getDate()+'/'+(days[i].date.getMonth()+1);
    ctx.fillText(lbl,x,H-6);
  }
}

// ===== טופ 5 מוצרים החודש =====
function renderTopProductsThisMonth(doneThisMonth){
  const wrap=document.getElementById('top-products');
  if(!wrap)return;
  const map={};
  doneThisMonth.forEach(o=>{
    const k=o.prod||'?';
    if(!map[k])map[k]={count:0,revenue:0};
    map[k].count++;
    map[k].revenue+=Number(o.price||0);
  });
  const top=Object.entries(map).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,5);
  if(top.length===0){
    wrap.innerHTML='<div style="text-align:center;padding:14px;color:#555;font-size:12px;">אין מכירות החודש</div>';
    return;
  }
  const maxRev=top[0][1].revenue;
  const medals=['🥇','🥈','🥉','4️⃣','5️⃣'];
  wrap.innerHTML=top.map(([name,d],i)=>{
    const pct=maxRev>0?(d.revenue/maxRev)*100:0;
    return `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:12px;">
        <span>${medals[i]} ${name}</span>
        <span style="color:#39e600;font-weight:700;">₪${Math.round(d.revenue).toLocaleString()}</span>
      </div>
      <div style="background:#475467;border-radius:4px;height:6px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#39e600,#2ab800);height:100%;width:${pct}%;border-radius:4px;"></div>
      </div>
      <div style="font-size:10px;color:#888;margin-top:2px;">${d.count} הזמנות</div>
    </div>`;
  }).join('');
}

// ===== טופ 5 חנויות החודש =====
function renderTopStoresThisMonth(doneThisMonth){
  const wrap=document.getElementById('top-stores');
  if(!wrap)return;
  const map={};
  doneThisMonth.forEach(o=>{
    const k=o.storeId||'?';
    if(!map[k]){
      const s=stores.find(x=>x.id===k);
      map[k]={name:s?s.name:(o.storeName||'?'),count:0,revenue:0};
    }
    map[k].count++;
    map[k].revenue+=Number(o.price||0);
  });
  const top=Object.values(map).sort((a,b)=>b.revenue-a.revenue).slice(0,5);
  if(top.length===0){
    wrap.innerHTML='<div style="text-align:center;padding:14px;color:#555;font-size:12px;">אין מכירות החודש</div>';
    return;
  }
  const maxRev=top[0].revenue;
  const medals=['🥇','🥈','🥉','4️⃣','5️⃣'];
  wrap.innerHTML=top.map((d,i)=>{
    const pct=maxRev>0?(d.revenue/maxRev)*100:0;
    return `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:12px;">
        <span>${medals[i]} ${d.name}</span>
        <span style="color:#39e600;font-weight:700;">₪${Math.round(d.revenue).toLocaleString()}</span>
      </div>
      <div style="background:#475467;border-radius:4px;height:6px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#1976d2,#0d47a1);height:100%;width:${pct}%;border-radius:4px;"></div>
      </div>
      <div style="font-size:10px;color:#888;margin-top:2px;">${d.count} הזמנות</div>
    </div>`;
  }).join('');
}

// ============ DEBTS TAB ============
function renderDebtsTab(){
  try{
    // רינדור חנויות עם חוב פתוח (אם הפונקציה קיימת)
    if(typeof renderUnpaidStores==='function')renderUnpaidStores();
    // שני סוגי "חובות":
    // א) חנויות בחוב (credit<0) – חרגו ממסגרת
    // ב) חנויות עם קרדיט פתיחה שעדיין לא שולם
    const creditDebts=stores.filter(s=>!s.frozen&&s.credit<0);
    const openingDebts=stores.filter(s=>!s.frozen&&s.openingUnpaid&&(s.openingAmount||0)>0);

    // סכומים נפרדים לכל סוג
    const totalCreditDebt=creditDebts.reduce((t,s)=>t+Math.abs(s.credit),0);
    const totalOpeningDebt=openingDebts.reduce((t,s)=>t+Number(s.openingAmount||0),0);
    const totalDebt=totalCreditDebt+totalOpeningDebt;
    const debtCount=creditDebts.length+openingDebts.length;
    const avgDebt=debtCount>0?Math.round(totalDebt/debtCount):0;

    // KPIs
    document.getElementById('d-total-debt').textContent='₪'+Math.round(totalDebt).toLocaleString();
    document.getElementById('d-total-debt-sub').textContent=debtCount+' רשומות';
    document.getElementById('d-avg-debt').textContent='₪'+avgDebt.toLocaleString();
    document.getElementById('d-avg-sub').textContent='לרשומה';

    // היסטוריית תשלומים מצטברת מכל החנויות
    const allPayments=[];
    stores.forEach(s=>{
      if(Array.isArray(s.log)){
        s.log.forEach(l=>{
          if(l.plus&&l.t&&(l.t.indexOf('תשלום')>-1||l.t.indexOf('פתיחה שולמה')>-1||l.t.indexOf('טעינה')>-1)){
            allPayments.push({store:s.name,storeId:s.id,...l});
          }
        });
      }
    });
    const totalPaid=allPayments.reduce((t,p)=>t+Number(p.amt||0),0);
    document.getElementById('d-paid-total').textContent='₪'+Math.round(totalPaid).toLocaleString();
    document.getElementById('d-paid-sub').textContent='בכל הזמן';

    // טבלת חובות מאוחדת
    const debtWrap=document.getElementById('debts-table-wrap');
    if(debtCount===0){
      debtWrap.innerHTML='<div style="padding:30px;text-align:center;color:#39e600;font-size:14px;">🎉 אין חובות פתוחים — הכל משולם!</div>';
    }else{
      // איחוד הרשומות עם תיוג סוג
      const rows=[];
      creditDebts.forEach(s=>rows.push({store:s,type:'credit',amount:Math.abs(s.credit)}));
      openingDebts.forEach(s=>rows.push({store:s,type:'opening',amount:Number(s.openingAmount||0)}));
      // מיון לפי גודל
      rows.sort((a,b)=>b.amount-a.amount);

      let html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px;">';
      html+='<thead><tr style="background:#f8f8f8;border-bottom:2px solid #e0e0e0;">';
      html+='<th style="padding:10px 8px;text-align:right;font-weight:700;color:#555;">🏪 חנות</th>';
      html+='<th style="padding:10px 8px;text-align:center;font-weight:700;color:#555;">🏷️ סוג</th>';
      html+='<th style="padding:10px 8px;text-align:right;font-weight:700;color:#555;">📞 טלפון</th>';
      html+='<th style="padding:10px 8px;text-align:center;font-weight:700;color:#555;">💸 סכום</th>';
      html+='<th style="padding:10px 8px;text-align:center;font-weight:700;color:#555;">💳 מסגרת</th>';
      html+='<th style="padding:10px 8px;text-align:center;font-weight:700;color:#555;">📅 תאריך</th>';
      html+='<th style="padding:10px 8px;text-align:center;font-weight:700;color:#555;">⚙️ פעולות</th>';
      html+='</tr></thead><tbody>';
      rows.forEach(row=>{
        const s=row.store;
        const u=users.find(x=>x.storeId===s.id);
        const ci=(u&&u.customerInfo)?u.customerInfo:(s.customerInfo||{});
        const phoneCell=ci.phone?`<a href="tel:${ci.phone}" style="color:#1976d2;text-decoration:none;">${ci.phone}</a>`:'<span style="color:#bbb;">—</span>';

        // תווית סוג חוב
        let typeBadge='';
        let payBtn='';
        let dateCell='—';
        if(row.type==='credit'){
          typeBadge='<span style="background:#3a0a0a;color:#ff7070;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;">⚠️ חוב מסגרת</span>';
          payBtn=`<button onclick="markDebtPaid('${s.id}')" style="background:#39e600;color:#000;border:none;border-radius:5px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;font-family:inherit;">✅ סמן שולם</button>
                  <button onclick="addPartialPayment('${s.id}')" style="background:#1976d2;color:#fff;border:none;border-radius:5px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;font-family:inherit;">💵 חלקי</button>`;
        }else{
          typeBadge='<span style="background:#1a1300;color:#ef9f27;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;">📥 קרדיט פתיחה</span>';
          payBtn=`<button onclick="markOpeningPaid('${s.id}')" style="background:#39e600;color:#000;border:none;border-radius:5px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;margin:1px;font-family:inherit;">✅ סמן שולם</button>`;
          if(s.openingDate)dateCell=String(s.openingDate);
        }

        const amtColor=row.type==='credit'?'#e24b4a':'#ef9f27';
        html+=`<tr style="border-bottom:1px solid #f0f0f0;" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background=''">
          <td style="padding:10px 8px;font-weight:700;color:#111;">${s.name}<div style="font-size:10px;color:#888;">${ci.contactName||''}</div></td>
          <td style="padding:10px 8px;text-align:center;">${typeBadge}</td>
          <td style="padding:10px 8px;color:#555;">${phoneCell}</td>
          <td style="padding:10px 8px;text-align:center;font-weight:700;color:${amtColor};font-size:14px;">₪${row.amount.toLocaleString()}</td>
          <td style="padding:10px 8px;text-align:center;color:#ef9f27;">${s.debtLimit>0?'₪'+s.debtLimit.toLocaleString():'—'}</td>
          <td style="padding:10px 8px;text-align:center;color:#888;font-size:11px;">${dateCell}</td>
          <td style="padding:10px 8px;text-align:center;white-space:nowrap;">
            ${payBtn}
            ${ci.phone?`<a href="tel:${ci.phone}" style="background:#0a3a0a;color:#39e600;border:1px solid #1a5a1a;border-radius:5px;padding:5px 8px;font-size:11px;font-weight:700;text-decoration:none;display:inline-block;margin:1px;">📞</a>`:''}
            ${ci.email?`<a href="mailto:${ci.email}?subject=תזכורת תשלום&body=שלום, יש לך חוב פתוח של ₪${row.amount.toLocaleString()} ב-CashPhone." style="background:#1a3a5f;color:#7cb3ff;border:1px solid #2a5288;border-radius:5px;padding:5px 8px;font-size:11px;font-weight:700;text-decoration:none;display:inline-block;margin:1px;">📧</a>`:''}
          </td>
        </tr>`;
      });
      html+='</tbody></table></div>';
      debtWrap.innerHTML=html;
    }

    // היסטוריית תשלומים אחרונים
    const histWrap=document.getElementById('payments-history-wrap');
    const recentPayments=allPayments.sort((a,b)=>{
      // נשתמש בשם לזיהוי - לא תאריך
      return 0;
    }).slice(-30).reverse();
    if(recentPayments.length===0){
      histWrap.innerHTML='<div style="padding:20px;text-align:center;color:#666;font-size:12px;">אין תשלומים רשומים</div>';
    }else{
      let html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:500px;">';
      html+='<thead><tr style="background:#f8f8f8;border-bottom:2px solid #e0e0e0;">';
      html+='<th style="padding:8px;text-align:right;font-weight:700;color:#555;">🏪 חנות</th>';
      html+='<th style="padding:8px;text-align:right;font-weight:700;color:#555;">תיאור</th>';
      html+='<th style="padding:8px;text-align:center;font-weight:700;color:#555;">סכום</th>';
      html+='<th style="padding:8px;text-align:center;font-weight:700;color:#555;">שעה</th>';
      html+='</tr></thead><tbody>';
      recentPayments.forEach(p=>{
        html+=`<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px;font-weight:700;color:#111;">${p.store}</td>
          <td style="padding:8px;color:#555;">${p.t}</td>
          <td style="padding:8px;text-align:center;font-weight:700;color:#39e600;">+₪${Number(p.amt).toLocaleString()}</td>
          <td style="padding:8px;text-align:center;color:#888;">${p.time||''}</td>
        </tr>`;
      });
      html+='</tbody></table></div>';
      histWrap.innerHTML=html;
    }
  }catch(err){
    console.error('renderDebtsTab failed:',err);
  }
}

// סימון קרדיט פתיחה כשולם
async function markOpeningPaid(storeId){
  const s=stores.find(x=>x.id===storeId);
  if(!s||!s.openingUnpaid)return;
  const amt=Number(s.openingAmount||0);
  if(!await cpConfirm('לסמן שחנות "'+s.name+'" שילמה את קרדיט הפתיחה של ₪'+amt.toLocaleString()+'?',{type:'question',title:'אישור תשלום פתיחה',okText:'סמן כשולם'}))return;
  s.openingUnpaid=false;
  if(!Array.isArray(s.log))s.log=[];
  s.log.unshift({t:'פתיחה שולמה',amt,plus:true,time:now()});
  renderAll();
  saveData();
  toast('t-admin','✅ קרדיט הפתיחה סומן כשולם');
}

// סימון חוב כשולם (החזרת היתרה ל-0)
async function markDebtPaid(storeId){
  const s=stores.find(x=>x.id===storeId);
  if(!s||s.credit>=0)return;
  const debt=Math.abs(s.credit);
  if(!await cpConfirm('לסמן שחנות "'+s.name+'" שילמה את כל החוב של ₪'+debt.toLocaleString()+'?\nהיתרה תאופס ל-0.',{type:'question',title:'תשלום חוב מלא',okText:'סמן כשולם'}))return;
  s.credit=0;
  if(!Array.isArray(s.log))s.log=[];
  s.log.unshift({t:'תשלום מלא של חוב',amt:debt,plus:true,time:now()});
  renderAll();
  saveData();
  toast('t-admin','✅ החוב סומן כשולם');
}

// תשלום חלקי
async function addPartialPayment(storeId){
  const s=stores.find(x=>x.id===storeId);
  if(!s)return;
  const debt=Math.abs(s.credit);
  const amt=await cpPrompt('החוב הנוכחי: ₪'+debt.toLocaleString(),{
    title:'💰 תשלום חלקי — '+s.name,
    icon:'💰',
    inputType:'number',
    min:0,
    placeholder:'סכום ששולם'
  });
  if(amt===null||amt==='')return;
  const n=parseFloat(amt);
  if(isNaN(n)||n<=0){await cpAlert('סכום לא תקין',{type:'error'});return;}
  s.credit=Number(s.credit||0)+n;
  if(!Array.isArray(s.log))s.log=[];
  s.log.unshift({t:'תשלום חלקי על חשבון חוב',amt:n,plus:true,time:now()});
  renderAll();
  saveData();
  toast('t-admin','✅ נרשם תשלום של ₪'+n.toLocaleString());
}

// יצוא דוח חובות לאקסל
function exportDebtsReport(){
  const debts=stores.filter(s=>!s.frozen&&s.credit<0);
  const rows=[
    ['דוח חובות פתוחים','','','','','',''],
    ['תאריך:',new Date().toLocaleDateString('he-IL'),'','','','',''],
    ['',''],
    ['חנות','שם עסק','איש קשר','טלפון','אימייל','עיר','חוב (₪)','מסגרת חוב','גובה הקרדיט המקורי']
  ];
  let totalDebt=0;
  debts.forEach(s=>{
    // קודם של המשתמש המקושר, אחר כך של החנות (לתאימות לאחור)
    const u=users.find(x=>x.storeId===s.id);
    const ci=(u&&u.customerInfo)?u.customerInfo:(s.customerInfo||{});
    const debt=Math.abs(s.credit);
    totalDebt+=debt;
    rows.push([s.name,ci.bizName||'',ci.contactName||'',ci.phone||'',ci.email||'',ci.city||'',debt,s.debtLimit||0,s.maxCredit||0]);
  });
  rows.push(['','','','','','','','','']);
  rows.push(['סה"כ חוב:','','','','','','₪'+totalDebt.toLocaleString(),'','']);
  rows.push(['מספר חנויות בחוב:','','','','','',debts.length,'','']);
  downloadCSV(`דוח_חובות_${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.csv`,rows);
  toast('t-admin','✅ הדוח הורד בהצלחה!');
}

function renderStoresTable(){
  const tbody=document.getElementById('stores-table-body');
  const tfoot=document.getElementById('stores-table-foot');
  if(!tbody)return;

  let totalCredit=0,totalTopup=0,totalOrders=0,totalBought=0,totalDebt=0;

  const rows=stores.map(s=>{
    const storeOrders=orders.filter(o=>o.storeId===s.id);
    const totalPurchased=storeOrders.reduce((t,o)=>t+o.price,0);
    const totalLoaded=s.log?s.log.filter(l=>l.plus).reduce((t,l)=>t+l.amt,0):s.maxCredit;
    const debt=s.credit<0?Math.abs(s.credit):0;
    const tier=TIERS[s.tier]||TIERS.normal;
    const isFrozen=!!s.frozen;
    const storeUser=users.find(u=>u.storeId===s.id);

    if(!isFrozen){
      totalCredit+=s.credit;
      totalTopup+=totalLoaded;
      totalOrders+=storeOrders.length;
      totalBought+=totalPurchased;
      totalDebt+=debt;
    }

    const creditColor=s.credit<0?'#e24b4a':s.credit<200?'#ef9f27':'#39e600';

    // סטטוס: מוקפא / יש משתמש / ללא משתמש
    let statusBadge='';
    if(isFrozen){
      statusBadge='<span style="background:#1e3a5f;color:#7cb3ff;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">🧊 מוקפא</span>';
    }else if(storeUser){
      statusBadge='<span style="background:#0f3a0f;color:#39e600;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;">✓ פעיל</span>';
    }else{
      statusBadge='<span onclick="goCreateUser(\''+s.id+'\')" style="background:#3a2a0a;color:#ef9f27;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;cursor:pointer;" title="ללא משתמש - לחץ ליצור">⚠️ ללא משתמש</span>';
    }

    const loginInfo=storeUser?`<div style="font-weight:600;color:#111;">${storeUser.username}</div><div style="font-size:10px;color:#aaa;">${storeUser.password}</div>`:'<span style="color:#ccc;">—</span>';

    // כפתורי הקפאה/מחיקה
    const actionBtns=`<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
      ${isFrozen
        ? `<button onclick="unfreezeStore('${s.id}')" style="background:#1e3a5f;color:#7cb3ff;border:1px solid #2a5288;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;" title="הפשר חנות">🔥 הפשר</button>`
        : `<button onclick="freezeStore('${s.id}')" style="background:#0a1a2a;color:#7cb3ff;border:1px solid #1e3a5f;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;" title="הקפא חנות זמנית">🧊 הקפא</button>`
      }
      <button onclick="deleteStorePerm('${s.id}')" style="background:#3a0a0a;color:#ff7070;border:1px solid #5a1010;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;" title="מחק לצמיתות">🗑️ מחק</button>
    </div>`;

    return `<tr style="border-bottom:1px solid #f0f0f0;${isFrozen?'opacity:0.5;':''}transition:background .15s;" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background=''">
      <td style="padding:10px 8px;font-weight:600;color:#111;">${s.name}<div style="margin-top:3px;">${statusBadge}</div></td>
      <td style="padding:10px 8px;">${loginInfo}</td>
      <td style="padding:10px 8px;text-align:center;font-weight:700;color:${creditColor};">${s.credit<0?'-':''}₪${Math.abs(s.credit).toLocaleString()}</td>
      <td style="padding:10px 8px;text-align:center;color:#555;">₪${totalLoaded.toLocaleString()}</td>
      <td style="padding:10px 8px;text-align:center;">
        <span style="background:#f0f0f0;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;">${storeOrders.length}</span>
      </td>
      <td style="padding:10px 8px;text-align:center;font-weight:700;color:#39e600;">₪${totalPurchased.toLocaleString()}</td>
      <td style="padding:10px 8px;text-align:center;font-weight:700;color:${debt>0?'#e24b4a':'#aaa'};">${debt>0?'₪'+debt.toLocaleString():'—'}</td>
      <td style="padding:10px 8px;text-align:center;color:#ef9f27;">${s.debtLimit>0?'₪'+s.debtLimit.toLocaleString():'—'}</td>
      <td style="padding:10px 8px;text-align:center;"><span class="badge ${tier.b}">${tier.l}</span></td>
      <td style="padding:10px 8px;text-align:center;">${actionBtns}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML=rows||'<tr><td colspan="10" style="text-align:center;padding:20px;color:#999;">אין חנויות</td></tr>';

  // שורת סיכום
  tfoot.innerHTML=`<tr style="background:#f0fff0;border-top:2px solid #39e600;font-weight:700;">
    <td style="padding:10px 8px;color:#111;">סה"כ <span style="font-weight:400;color:#888;font-size:11px;">(לא כולל מוקפאות)</span></td>
    <td style="padding:10px 8px;text-align:center;color:${totalCredit<0?'#e24b4a':'#39e600'};">${totalCredit<0?'-':''}₪${Math.abs(totalCredit).toLocaleString()}</td>
    <td style="padding:10px 8px;text-align:center;">₪${totalTopup.toLocaleString()}</td>
    <td style="padding:10px 8px;text-align:center;">${totalOrders}</td>
    <td style="padding:10px 8px;text-align:center;color:#39e600;">₪${totalBought.toLocaleString()}</td>
    <td style="padding:10px 8px;text-align:center;color:${totalDebt>0?'#e24b4a':'#aaa'};">${totalDebt>0?'₪'+totalDebt.toLocaleString():'—'}</td>
    <td colspan="3"></td>
  </tr>`;
}

// קפיצה לדף משתמשים עם החנות הנבחרת מראש
function goCreateUser(storeId){
  // לאחר האיחוד: חנות = משתמש, אז כדי "ליצור משתמש לחנות יתומה"
  // צריך פשוט לגלול לטופס ההוספה ולתת לאדמין למלא שוב
  showPage('page-users');
  setTimeout(function(){
    document.querySelectorAll('.ntab').forEach(t=>{t.classList.remove('on');if(t.textContent.includes('משתמש'))t.classList.add('on');});
    const role=document.getElementById('u-role');
    if(role)role.value='store';
    updateAddFormVisibility();
    // אם יש חנות יתומה — מלא את שמה אוטומטית
    const s=stores.find(x=>x.id===storeId);
    if(s){
      const nName=document.getElementById('n-name');
      if(nName)nName.value=s.name;
    }
    setTimeout(function(){
      const name=document.getElementById('u-name');
      if(name){
        try{name.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){}
        name.focus();
      }
    },50);
  },100);
}

// הקפא חנות
async function freezeStore(id){
  const s=stores.find(x=>x.id===id);
  if(!s)return;
  if(!await cpConfirm('המשתמש לא יוכל להתחבר, אבל הנתונים יישמרו.\nאפשר להפשיר בכל עת.',{type:'warning',title:'🧊 הקפאת '+s.name,okText:'הקפא'}))return;
  s.frozen=true;
  if(!Array.isArray(s.log))s.log=[];
  s.log.unshift({t:'חנות הוקפאה',amt:0,plus:false,time:now()});
  logAudit('store-freeze','הקפאת חנות',{storeId:id,storeName:s.name});
  renderAll();
  saveData();
  toast('t-admin','🧊 חנות "'+s.name+'" הוקפאה');
}

// הפשר חנות
function unfreezeStore(id){
  const s=stores.find(x=>x.id===id);
  if(!s)return;
  s.frozen=false;
  if(!Array.isArray(s.log))s.log=[];
  s.log.unshift({t:'חנות הופשרה',amt:0,plus:true,time:now()});
  logAudit('store-unfreeze','הפשרת חנות',{storeId:id,storeName:s.name});
  renderAll();
  saveData();
  toast('t-admin','🔥 חנות "'+s.name+'" הופשרה');
}

// מחיקה לצמיתות - חנות + משתמשים מקושרים
async function deleteStorePerm(id){
  const s=stores.find(x=>x.id===id);
  if(!s)return;
  const linkedUsers=users.filter(u=>u.storeId===id);
  const linkedOrders=orders.filter(o=>o.storeId===id).length;
  let msg='פעולה זו תמחק:\n';
  msg+='• את החנות עם כל הנתונים שלה\n';
  if(linkedUsers.length>0)msg+='• '+linkedUsers.length+' משתמש(ים) מקושרים: '+linkedUsers.map(u=>u.username).join(', ')+'\n';
  if(linkedOrders>0)msg+='• ההיסטוריה של '+linkedOrders+' הזמנות תישאר אבל תאבד את הקישור לחנות\n';
  msg+='\nאי אפשר לבטל את זה.';
  if(!await cpConfirm(msg,{type:'danger',title:'🗑️ מחיקה לצמיתות — '+s.name,okText:'מחק לצמיתות'}))return;
  // מחיקת המשתמשים המקושרים
  users=users.filter(u=>u.storeId!==id);
  // מחיקת החנות
  stores=stores.filter(x=>x.id!==id);
  // אם זו הייתה החנות הנבחרת בעורך מחירים - איפוס
  if(priceStoreId===id&&stores.length>0)priceStoreId=stores[0].id;
  logAudit('store-delete-perm','מחיקה לצמיתות של חנות',{storeId:id,storeName:s.name,linkedUsers:linkedUsers.map(function(u){return u.username;})});
  renderAll();
  saveData();
  toast('t-admin','🗑️ חנות "'+s.name+'" נמחקה לצמיתות');
}

function exportFullTable(){
  const rows=[
    ['חנות','שם עסק','שם לקוח','ת.ז/ח.פ','נייד','מייל','כתובת','עיר','שם משתמש','סיסמה','קרדיט נוכחי','סה"כ טעינות','מספר הזמנות','סה"כ קנה','חוב','מסגרת חוב','רמת מחיר'],
    ...stores.map(s=>{
      const storeOrders=orders.filter(o=>o.storeId===s.id);
      const totalPurchased=storeOrders.reduce((t,o)=>t+o.price,0);
      const totalLoaded=s.log?s.log.filter(l=>l.plus).reduce((t,l)=>t+l.amt,0):s.maxCredit;
      const debt=s.credit<0?Math.abs(s.credit):0;
      const tier=TIERS[s.tier]||TIERS.normal;
      const u=users.find(u=>u.storeId===s.id);
      const ci=s.customerInfo||{};
      return[s.name,ci.bizName||'',ci.contactName||'',ci.idNum||'',ci.phone||'',ci.email||'',ci.address||'',ci.city||'',u?u.username:'—',u?u.password:'—',s.credit,totalLoaded,storeOrders.length,totalPurchased,debt,s.debtLimit||0,tier.l];
    })
  ];
  downloadCSV(`טבלת_חנויות_${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.csv`,rows);
  toast('t-admin','✅ הטבלה הורדה!');
}

// ============================================================
// ============ דוחות חודשיים מתקדמים ============
// ============================================================

let mrSelectedMonth=0; // 0 = החודש, 1 = חודש שעבר, וכו'
let mrTrendMetric='rev'; // rev / profit / orders

const HE_MONTHS=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function mrMonthLabel(monthsBack){
  const now=new Date();
  const d=new Date(now.getFullYear(),now.getMonth()-monthsBack,1);
  return HE_MONTHS[d.getMonth()]+' '+d.getFullYear();
}

// כל ההזמנות בחודש מסוים
function mrOrdersOf(monthsBack){
  return orders.filter(o=>orderInMonth(o,monthsBack));
}

// מחשב KPIs לחודש מסוים
function mrComputeKPIs(monthsBack){
  const ord=mrOrdersOf(monthsBack);
  const done=ord.filter(o=>o.status==='done');
  const rev=done.reduce((t,o)=>t+Number(o.price||0),0);
  const profit=done.reduce((t,o)=>t+getOrderProfit(o),0);
  const avg=done.length?Math.round(rev/done.length):0;
  const activeStores=new Set(ord.map(o=>o.storeId).filter(Boolean)).size;
  const margin=rev>0?Math.round((profit/rev)*100):0;
  return {orders:ord.length,doneOrders:done.length,rev,profit,avg,activeStores,margin};
}

// יוצר השוואה מילולית עם חודש קודם
function mrCompare(curr,prev,prefix,suffix){
  prefix=prefix||'';
  suffix=suffix||'';
  if(prev===0&&curr===0)return '<span style="color:#666;">אין נתונים להשוואה</span>';
  if(prev===0)return '<span style="color:#39e600;">חודש ראשון 🎉</span>';
  const diff=curr-prev;
  const pct=Math.round((diff/Math.abs(prev))*100);
  const color=pct>=0?'#39e600':'#e24b4a';
  const arrow=pct>=0?'↑':'↓';
  return `<span style="color:${color};font-weight:700;">${arrow} ${Math.abs(pct)}%</span> <span style="color:#888;">(${prefix}${Math.round(prev).toLocaleString()}${suffix})</span>`;
}

// מאתחל את ה-dropdown של בחירת חודשים
function mrInitMonthPicker(){
  const sel=document.getElementById('mr-month-picker');
  if(!sel)return;
  sel.innerHTML='';
  for(let i=0;i<12;i++){
    const opt=document.createElement('option');
    opt.value=i;
    opt.textContent=mrMonthLabel(i)+(i===0?' (החודש)':i===1?' (שעבר)':'');
    if(i===mrSelectedMonth)opt.selected=true;
    sel.appendChild(opt);
  }
}

function mrChangeMonth(delta){
  const next=mrSelectedMonth+delta;
  if(next<0||next>11)return;
  mrSelectedMonth=next;
  renderMonthlyReport();
}

function mrSetMonth(m){
  mrSelectedMonth=parseInt(m)||0;
  renderMonthlyReport();
}

function mrSetTrendMetric(m){
  mrTrendMetric=m;
  ['rev','profit','orders'].forEach(k=>{
    const btn=document.getElementById('mr-trend-'+k);
    if(!btn)return;
    if(k===m){
      btn.style.background='#39e600';btn.style.color='#000';
    }else{
      btn.style.background='#475467';btn.style.color='#888';
    }
  });
  drawTrendChart();
}

// ===================================================
// ============ ציור גרפים (Canvas טהור) ============
// ===================================================

function mrCanvasSetup(canvas){
  if(!canvas)return null;
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  const w=rect.width||canvas.parentElement.clientWidth||600;
  const h=parseInt(canvas.getAttribute('height'))||150;
  canvas.width=w*dpr;
  canvas.height=h*dpr;
  canvas.style.width=w+'px';
  canvas.style.height=h+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  return {ctx,w,h};
}

// גרף קווי 6 חודשים
function drawTrendChart(){
  const canvas=document.getElementById('mr-trend-chart');
  const setup=mrCanvasSetup(canvas);
  if(!setup)return;
  const {ctx,w,h}=setup;
  ctx.clearRect(0,0,w,h);

  // אסוף נתוני 6 חודשים אחרונים (מהישן לחדש)
  const data=[];
  for(let i=5;i>=0;i--){
    const k=mrComputeKPIs(i);
    let v=0;
    if(mrTrendMetric==='rev')v=k.rev;
    else if(mrTrendMetric==='profit')v=k.profit;
    else if(mrTrendMetric==='orders')v=k.orders;
    data.push({label:mrMonthLabel(i).split(' ')[0].slice(0,3),value:v,monthsBack:i});
  }

  const padL=50,padR=15,padT=15,padB=30;
  const cw=w-padL-padR;
  const ch=h-padT-padB;
  const max=Math.max(...data.map(d=>d.value),1);
  const min=Math.min(...data.map(d=>d.value),0);
  const range=max-min||1;

  // רקע גריד
  ctx.strokeStyle='#475467';
  ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=padT+(ch/4)*i;
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(w-padR,y);ctx.stroke();
    const val=max-(range/4)*i;
    ctx.fillStyle='#555';
    ctx.font='10px Heebo,sans-serif';
    ctx.textAlign='right';
    ctx.fillText(mrTrendMetric==='orders'?Math.round(val):'₪'+Math.round(val/1000)+'k',padL-4,y+3);
  }

  // ציור הקו עם גרדיאנט מתחתיו
  const points=data.map((d,i)=>{
    const x=padL+(cw/(data.length-1||1))*i;
    const y=padT+ch-((d.value-min)/range)*ch;
    return {x,y,d};
  });

  // שטח (gradient fill)
  const grad=ctx.createLinearGradient(0,padT,0,padT+ch);
  grad.addColorStop(0,'rgba(57,230,0,0.35)');
  grad.addColorStop(1,'rgba(57,230,0,0)');
  ctx.fillStyle=grad;
  ctx.beginPath();
  ctx.moveTo(points[0].x,padT+ch);
  points.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(points[points.length-1].x,padT+ch);
  ctx.closePath();
  ctx.fill();

  // קו
  ctx.strokeStyle='#39e600';
  ctx.lineWidth=2.5;
  ctx.beginPath();
  points.forEach((p,i)=>{
    if(i===0)ctx.moveTo(p.x,p.y);
    else ctx.lineTo(p.x,p.y);
  });
  ctx.stroke();

  // נקודות + תוויות
  points.forEach(p=>{
    const isSelected=p.d.monthsBack===mrSelectedMonth;
    ctx.fillStyle=isSelected?'#fff':'#39e600';
    ctx.beginPath();
    ctx.arc(p.x,p.y,isSelected?6:4,0,Math.PI*2);
    ctx.fill();
    if(isSelected){
      ctx.strokeStyle='#39e600';
      ctx.lineWidth=2;
      ctx.stroke();
    }
    // שם חודש
    ctx.fillStyle=isSelected?'#39e600':'#888';
    ctx.font=(isSelected?'bold 11px':'10px')+' Heebo,sans-serif';
    ctx.textAlign='center';
    ctx.fillText(p.d.label,p.x,padT+ch+18);
  });
}

// גרף יומי (עמודות) לחודש הנבחר
// state - איזה מדד מציג בגרף היומי
var mrDailyMetric='rev'; // 'rev' או 'profit'

function mrSetDailyMetric(m){
  mrDailyMetric=m;
  // עדכון מצב הכפתורים
  var revBtn=document.getElementById('mr-daily-rev-btn');
  var profitBtn=document.getElementById('mr-daily-profit-btn');
  if(revBtn){
    revBtn.style.background=m==='rev'?'#39e600':'#475467';
    revBtn.style.color=m==='rev'?'#000':'#888';
  }
  if(profitBtn){
    profitBtn.style.background=m==='profit'?'#39e600':'#475467';
    profitBtn.style.color=m==='profit'?'#000':'#888';
  }
  drawDailyChart();
}

function drawDailyChart(){
  const canvas=document.getElementById('mr-daily-chart');
  const setup=mrCanvasSetup(canvas);
  if(!setup)return;
  const {ctx,w,h}=setup;
  ctx.clearRect(0,0,w,h);

  // קבע את החודש המתאים והכן מערך ימים
  const r=getMonthRange(mrSelectedMonth);
  const startD=new Date(r.start);
  const endD=new Date(r.end-1);
  const daysInMonth=endD.getDate();
  const today=new Date();
  const isCurrentMonth=mrSelectedMonth===0;
  const lastDay=isCurrentMonth?today.getDate():daysInMonth;

  const dailyTotals=new Array(daysInMonth).fill(0);
  const ord=mrOrdersOf(mrSelectedMonth).filter(o=>o.status==='done');
  ord.forEach(o=>{
    const t=getOrderDate(o);
    if(!t)return;
    const d=new Date(t);
    const day=d.getDate()-1;
    if(day>=0&&day<daysInMonth){
      // לפי המדד הנבחר: הכנסות (price) או רווח (profit)
      var val=mrDailyMetric==='profit'?getOrderProfit(o):Number(o.price||0);
      dailyTotals[day]+=val;
    }
  });

  const padL=40,padR=10,padT=15,padB=22;
  const cw=w-padL-padR;
  const ch=h-padT-padB;
  const max=Math.max(...dailyTotals,1);
  const barW=cw/daysInMonth;

  // צבע לפי מדד (רווח = ירוק, הכנסות = ירוק)
  // אם רווח שלילי - אדום
  var hasNegative=mrDailyMetric==='profit'&&dailyTotals.some(v=>v<0);

  // גריד אופקי
  ctx.strokeStyle='#475467';
  ctx.lineWidth=1;
  for(let i=0;i<=3;i++){
    const y=padT+(ch/3)*i;
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(w-padR,y);ctx.stroke();
    const val=max-(max/3)*i;
    ctx.fillStyle='#555';
    ctx.font='10px Heebo,sans-serif';
    ctx.textAlign='right';
    var lbl=Math.abs(val)>=1000?'₪'+Math.round(val/1000)+'k':'₪'+Math.round(val);
    ctx.fillText(lbl,padL-4,y+3);
  }

  // עמודות
  for(let i=0;i<daysInMonth;i++){
    const v=dailyTotals[i];
    const isFuture=isCurrentMonth&&i>=lastDay;
    const x=padL+i*barW+barW*0.15;
    const bw=barW*0.7;
    const bh=v!==0?(Math.abs(v)/max)*ch:0;
    const y=padT+ch-bh;
    if(isFuture){
      ctx.fillStyle='#161616';
      ctx.fillRect(x,padT+ch-2,bw,2);
    }else if(v>0){
      const g=ctx.createLinearGradient(0,y,0,padT+ch);
      g.addColorStop(0,'#39e600');
      g.addColorStop(1,'#1d6f42');
      ctx.fillStyle=g;
      ctx.fillRect(x,y,bw,bh);
    }else if(v<0){
      // רווח שלילי = הפסד
      const g=ctx.createLinearGradient(0,y,0,padT+ch);
      g.addColorStop(0,'#e24b4a');
      g.addColorStop(1,'#7a2828');
      ctx.fillStyle=g;
      ctx.fillRect(x,y,bw,bh);
    }else{
      ctx.fillStyle='#222';
      ctx.fillRect(x,padT+ch-2,bw,2);
    }
  }

  // תוויות יום (כל 5)
  ctx.fillStyle='#666';
  ctx.font='9px Heebo,sans-serif';
  ctx.textAlign='center';
  for(let i=0;i<daysInMonth;i+=Math.ceil(daysInMonth/10)){
    ctx.fillText((i+1).toString(),padL+i*barW+barW/2,padT+ch+15);
  }

  // עדכן statistic זוטא
  const stats=document.getElementById('mr-daily-stats');
  if(stats){
    const slicedTotals=dailyTotals.slice(0,lastDay);
    const sumTotal=slicedTotals.reduce((a,b)=>a+b,0);
    const avgDay=lastDay>0?Math.round(sumTotal/lastDay):0;
    const peakVal=Math.max(...slicedTotals);
    const peakDay=slicedTotals.indexOf(peakVal)+1;
    var metricLabel=mrDailyMetric==='profit'?'רווח יומי':'הכנסה יומית';
    var metricColor=mrDailyMetric==='profit'?(avgDay>=0?'#39e600':'#e24b4a'):'#39e600';
    stats.innerHTML='ממוצע '+(mrDailyMetric==='profit'?'רווח':'הכנסה')+' יומי: <b style="color:'+metricColor+';">₪'+avgDay.toLocaleString()+'</b> · יום שיא: <b style="color:#39e600;">'+peakDay+'.'+(startD.getMonth()+1)+'</b> (₪'+peakVal.toLocaleString()+')';
  }
}

// גרף עוגה - חלוקה לפי קטגוריה (מוצרים)
function drawCategoryChart(){
  const canvas=document.getElementById('mr-cat-chart');
  const setup=mrCanvasSetup(canvas);
  if(!setup)return;
  const {ctx,w,h}=setup;
  ctx.clearRect(0,0,w,h);

  const ord=mrOrdersOf(mrSelectedMonth).filter(o=>o.status==='done');
  const byProduct={};
  ord.forEach(o=>{
    const k=o.prod||'אחר';
    byProduct[k]=(byProduct[k]||0)+Number(o.price||0);
  });
  const entries=Object.entries(byProduct).sort((a,b)=>b[1]-a[1]);
  if(entries.length===0){
    ctx.fillStyle='#555';
    ctx.font='12px Heebo,sans-serif';
    ctx.textAlign='center';
    ctx.fillText('אין נתונים',w/2,h/2);
    document.getElementById('mr-cat-legend').innerHTML='';
    return;
  }
  // קח 6 ראשונים + "אחר"
  let top=entries.slice(0,6);
  const rest=entries.slice(6).reduce((t,e)=>t+e[1],0);
  if(rest>0)top.push(['אחר',rest]);
  const total=top.reduce((t,e)=>t+e[1],0);

  const colors=['#39e600','#2ab800','#5fff3e','#1d6f42','#88ff66','#0d5c2a','#aaffaa'];
  const cx=w/2,cy=h/2-5;
  const r=Math.min(w,h)/2-15;
  const rInner=r*0.55;

  let angle=-Math.PI/2;
  top.forEach((e,i)=>{
    const slice=(e[1]/total)*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,angle,angle+slice);
    ctx.closePath();
    ctx.fillStyle=colors[i%colors.length];
    ctx.fill();
    angle+=slice;
  });
  // חור באמצע (donut)
  ctx.fillStyle='#3a4556';
  ctx.beginPath();
  ctx.arc(cx,cy,rInner,0,Math.PI*2);
  ctx.fill();
  // טקסט במרכז
  ctx.fillStyle='#fff';
  ctx.font='bold 14px Exo 2,sans-serif';
  ctx.textAlign='center';
  ctx.fillText('₪'+(total>=1000?Math.round(total/1000)+'k':total.toLocaleString()),cx,cy-2);
  ctx.fillStyle='#888';
  ctx.font='10px Heebo,sans-serif';
  ctx.fillText(top.length+' קטגוריות',cx,cy+14);

  // legend
  const legend=document.getElementById('mr-cat-legend');
  legend.innerHTML=top.map((e,i)=>{
    const pct=Math.round((e[1]/total)*100);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;">
      <span style="display:flex;align-items:center;gap:6px;color:#ccc;"><span style="display:inline-block;width:10px;height:10px;background:${colors[i%colors.length]};border-radius:2px;"></span>${e[0]}</span>
      <span style="color:#888;">₪${Math.round(e[1]).toLocaleString()} <b style="color:#39e600;">${pct}%</b></span>
    </div>`;
  }).join('');
}

// גרף שעות שיא (24 שעות)
function drawHoursChart(){
  const canvas=document.getElementById('mr-hours-chart');
  const setup=mrCanvasSetup(canvas);
  if(!setup)return;
  const {ctx,w,h}=setup;
  ctx.clearRect(0,0,w,h);

  const hours=new Array(24).fill(0);
  const ord=mrOrdersOf(mrSelectedMonth);
  ord.forEach(o=>{
    const t=getOrderDate(o);
    if(!t)return;
    const hr=new Date(t).getHours();
    hours[hr]++;
  });
  const max=Math.max(...hours,1);

  const padL=25,padR=8,padT=10,padB=22;
  const cw=w-padL-padR;
  const ch=h-padT-padB;
  const barW=cw/24;

  // גריד
  ctx.strokeStyle='#475467';
  for(let i=0;i<=2;i++){
    const y=padT+(ch/2)*i;
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(w-padR,y);ctx.stroke();
  }

  // עמודות
  for(let i=0;i<24;i++){
    const v=hours[i];
    const x=padL+i*barW+barW*0.1;
    const bw=barW*0.8;
    const bh=v>0?(v/max)*ch:0;
    const y=padT+ch-bh;
    if(v>0){
      const intensity=v/max;
      ctx.fillStyle=`rgba(57,230,0,${0.3+intensity*0.7})`;
      ctx.fillRect(x,y,bw,bh);
    }
  }

  // תוויות שעות (כל 4)
  ctx.fillStyle='#666';
  ctx.font='9px Heebo,sans-serif';
  ctx.textAlign='center';
  for(let i=0;i<24;i+=4){
    ctx.fillText(i+':00',padL+i*barW+barW/2,padT+ch+14);
  }

  // הצגת שעת השיא
  const peakHour=hours.indexOf(Math.max(...hours));
  const peakVal=hours[peakHour];
  const info=document.getElementById('mr-hours-info');
  if(info){
    if(peakVal===0){
      info.innerHTML='אין נתונים';
    }else{
      info.innerHTML=`שעת שיא: <b style="color:#39e600;">${peakHour}:00–${peakHour+1}:00</b> (${peakVal} הזמנות) · סה"כ ${hours.reduce((a,b)=>a+b,0)} הזמנות`;
    }
  }
}

// ====================================================
// ============== טבלאות ורשימות ==============
// ====================================================

function renderMonthlyStores(){
  const tbody=document.getElementById('mr-stores-body');
  const tfoot=document.getElementById('mr-stores-foot');
  if(!tbody)return;
  const sortBy=document.getElementById('mr-stores-sort')?.value||'rev';

  const currOrd=mrOrdersOf(mrSelectedMonth);
  const prevOrd=mrOrdersOf(mrSelectedMonth+1);

  const storeData=stores.map(s=>{
    const so=currOrd.filter(o=>o.storeId===s.id);
    const sod=so.filter(o=>o.status==='done');
    const rev=sod.reduce((t,o)=>t+Number(o.price||0),0);
    const profit=sod.reduce((t,o)=>t+getOrderProfit(o),0);
    const margin=rev>0?Math.round((profit/rev)*100):0;
    const prevSo=prevOrd.filter(o=>o.storeId===s.id&&o.status==='done');
    const prevRev=prevSo.reduce((t,o)=>t+Number(o.price||0),0);
    const growth=prevRev>0?Math.round(((rev-prevRev)/prevRev)*100):(rev>0?100:0);
    return {s,orders:so.length,rev,profit,margin,prevRev,growth};
  }).filter(d=>d.orders>0);

  storeData.sort((a,b)=>{
    if(sortBy==='rev')return b.rev-a.rev;
    if(sortBy==='profit')return b.profit-a.profit;
    if(sortBy==='orders')return b.orders-a.orders;
    if(sortBy==='growth')return b.growth-a.growth;
    return 0;
  });

  if(storeData.length===0){
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">אין הזמנות בחודש זה</td></tr>';
    tfoot.innerHTML='';
    return;
  }

  tbody.innerHTML=storeData.map((d,i)=>{
    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
    const growthColor=d.growth>=0?'#39e600':'#e24b4a';
    const growthArrow=d.growth>=0?'↑':'↓';
    const growthText=d.prevRev===0?'<span style="color:#888;font-size:11px;">חדש</span>':`<span style="color:${growthColor};font-weight:700;">${growthArrow}${Math.abs(d.growth)}%</span>`;
    const marginColor=d.margin>=20?'#39e600':d.margin>=10?'#ef9f27':'#e24b4a';
    return `<tr style="border-bottom:1px solid #eee;">
      <td style="padding:9px 8px;">${medal||(i+1)}</td>
      <td style="padding:9px 8px;font-weight:600;">${d.s.name}</td>
      <td style="padding:9px 8px;text-align:center;">${d.orders}</td>
      <td style="padding:9px 8px;text-align:center;color:#1d6f42;font-weight:700;">₪${Math.round(d.rev).toLocaleString()}</td>
      <td style="padding:9px 8px;text-align:center;color:${d.profit>=0?'#1d6f42':'#e24b4a'};font-weight:700;">₪${Math.round(d.profit).toLocaleString()}</td>
      <td style="padding:9px 8px;text-align:center;color:${marginColor};font-weight:700;">${d.margin}%</td>
      <td style="padding:9px 8px;text-align:center;">${growthText}</td>
    </tr>`;
  }).join('');

  // שורת סיכום
  const totals=storeData.reduce((acc,d)=>({
    orders:acc.orders+d.orders,
    rev:acc.rev+d.rev,
    profit:acc.profit+d.profit
  }),{orders:0,rev:0,profit:0});
  const totalMargin=totals.rev>0?Math.round((totals.profit/totals.rev)*100):0;
  tfoot.innerHTML=`<tr style="background:#f0f8f0;border-top:2px solid #39e600;font-weight:700;">
    <td colspan="2" style="padding:10px 8px;">סה"כ (${storeData.length} חנויות)</td>
    <td style="padding:10px 8px;text-align:center;">${totals.orders}</td>
    <td style="padding:10px 8px;text-align:center;color:#1d6f42;">₪${Math.round(totals.rev).toLocaleString()}</td>
    <td style="padding:10px 8px;text-align:center;color:#1d6f42;">₪${Math.round(totals.profit).toLocaleString()}</td>
    <td style="padding:10px 8px;text-align:center;">${totalMargin}%</td>
    <td></td>
  </tr>`;
}

function renderMonthlyTopProducts(){
  const el=document.getElementById('mr-top-products');
  if(!el)return;
  const ord=mrOrdersOf(mrSelectedMonth).filter(o=>o.status==='done');
  const byProd={};
  ord.forEach(o=>{
    const k=o.prod||'אחר';
    if(!byProd[k])byProd[k]={count:0,rev:0};
    byProd[k].count++;
    byProd[k].rev+=Number(o.price||0);
  });
  const top=Object.entries(byProd).sort((a,b)=>b[1].rev-a[1].rev).slice(0,10);
  if(top.length===0){el.innerHTML='<div style="text-align:center;padding:20px;color:#888;">אין הזמנות</div>';return;}
  const maxRev=top[0][1].rev;
  el.innerHTML=top.map(([name,data],i)=>{
    const pct=Math.round((data.rev/maxRev)*100);
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">
        <span style="color:#222;font-weight:600;">${i+1}. ${name} <span style="color:#888;font-weight:400;">(${data.count} הזמנות)</span></span>
        <span style="color:#1d6f42;font-weight:700;">₪${Math.round(data.rev).toLocaleString()}</span>
      </div>
      <div style="background:#eee;border-radius:6px;height:7px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#39e600,#2ab800);height:100%;width:${pct}%;border-radius:6px;"></div>
      </div>
    </div>`;
  }).join('');
}

function renderMonthlyTopUsers(){
  const el=document.getElementById('mr-top-users');
  if(!el)return;
  const ord=mrOrdersOf(mrSelectedMonth).filter(o=>o.status==='done');
  const byUser={};
  ord.forEach(o=>{
    const k=(o.user||'אנונימי').trim()||'אנונימי';
    if(!byUser[k])byUser[k]={count:0,rev:0,stores:new Set()};
    byUser[k].count++;
    byUser[k].rev+=Number(o.price||0);
    if(o.storeName)byUser[k].stores.add(o.storeName);
  });
  const top=Object.entries(byUser).sort((a,b)=>b[1].rev-a[1].rev).slice(0,10);
  if(top.length===0){el.innerHTML='<div style="text-align:center;padding:20px;color:#888;">אין הזמנות</div>';return;}
  el.innerHTML=top.map(([name,data],i)=>{
    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`<span style="color:#888;font-weight:700;">${i+1}.</span>`;
    const storesArr=Array.from(data.stores);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
      <div>
        <div style="font-weight:600;color:#222;">${medal} ${name}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">${data.count} הזמנות${storesArr.length?' · '+storesArr.slice(0,2).join(', ')+(storesArr.length>2?` +${storesArr.length-2}`:''):''}</div>
      </div>
      <div style="color:#1d6f42;font-weight:700;font-size:14px;">₪${Math.round(data.rev).toLocaleString()}</div>
    </div>`;
  }).join('');
}

// תובנות אוטומטיות (דורש קצת חכמה)
function renderMonthlyInsights(){
  const el=document.getElementById('mr-insights');
  if(!el)return;
  const curr=mrComputeKPIs(mrSelectedMonth);
  const prev=mrComputeKPIs(mrSelectedMonth+1);
  const insights=[];

  // תובנה 1: מגמת הכנסות
  if(prev.rev>0){
    const diff=curr.rev-prev.rev;
    const pct=Math.round((diff/prev.rev)*100);
    if(pct>=20){
      insights.push(`🚀 <b>צמיחה מרשימה:</b> ההכנסות צמחו ב-${pct}% לעומת החודש הקודם (₪${Math.round(diff).toLocaleString()} יותר). המשיכו במגמה!`);
    }else if(pct<=-20){
      insights.push(`⚠️ <b>ירידה משמעותית:</b> ההכנסות ירדו ב-${Math.abs(pct)}% מול החודש הקודם. כדאי לבדוק מה השתנה.`);
    }else if(pct>0){
      insights.push(`📈 <b>צמיחה מתונה:</b> +${pct}% הכנסות לעומת החודש הקודם.`);
    }
  }

  // תובנה 2: שולי רווח
  if(curr.rev>0){
    if(curr.margin>=25)insights.push(`💎 <b>שולי רווח מצוינים:</b> ${curr.margin}% — הרבה מעל הממוצע בענף.`);
    else if(curr.margin<10&&curr.margin>0)insights.push(`📉 <b>שולי רווח נמוכים:</b> ${curr.margin}% בלבד. שקלו עדכון מחירים או הוזלת עלויות.`);
    else if(curr.margin<0)insights.push(`🔴 <b>הפסד החודש!</b> שולי רווח שליליים (${curr.margin}%). חשוב לבדוק מיד.`);
  }

  // תובנה 3: חנות מובילה
  const ord=mrOrdersOf(mrSelectedMonth).filter(o=>o.status==='done');
  if(ord.length>0){
    const byStore={};
    ord.forEach(o=>{byStore[o.storeName||'?']=(byStore[o.storeName||'?']||0)+Number(o.price||0);});
    const top=Object.entries(byStore).sort((a,b)=>b[1]-a[1])[0];
    if(top&&curr.rev>0){
      const pct=Math.round((top[1]/curr.rev)*100);
      if(pct>=40)insights.push(`👑 <b>חנות דומיננטית:</b> "${top[0]}" מהווה ${pct}% מההכנסות (₪${Math.round(top[1]).toLocaleString()}). תלות גבוהה — שווה לפזר.`);
      else insights.push(`🏆 <b>חנות מובילה:</b> "${top[0]}" עם ₪${Math.round(top[1]).toLocaleString()} הכנסות (${pct}% מהסה"כ).`);
    }
  }

  // תובנה 4: יום שיא
  const r=getMonthRange(mrSelectedMonth);
  const daysInMonth=new Date(r.end-1).getDate();
  const dailyTotals=new Array(daysInMonth).fill(0);
  ord.forEach(o=>{
    const t=getOrderDate(o);
    if(!t)return;
    const day=new Date(t).getDate()-1;
    if(day>=0&&day<daysInMonth)dailyTotals[day]+=Number(o.price||0);
  });
  const peakDayVal=Math.max(...dailyTotals);
  if(peakDayVal>0){
    const peakDay=dailyTotals.indexOf(peakDayVal)+1;
    const monthName=mrMonthLabel(mrSelectedMonth).split(' ')[0];
    insights.push(`📅 <b>יום שיא:</b> ${peakDay} ב${monthName} עם ₪${Math.round(peakDayVal).toLocaleString()} הכנסות.`);
  }

  // תובנה 5: הזמנות ממתינות
  const pendThisMonth=mrOrdersOf(mrSelectedMonth).filter(o=>o.status==='new').length;
  if(pendThisMonth>0){
    insights.push(`⏳ <b>${pendThisMonth} הזמנות ממתינות</b> מהחודש הזה — כדאי לטפל בהן.`);
  }

  // תובנה 6: ערך הזמנה
  if(curr.avg>0&&prev.avg>0){
    const diff=curr.avg-prev.avg;
    const pct=Math.round((diff/prev.avg)*100);
    if(Math.abs(pct)>=15){
      insights.push(`🛒 <b>ערך הזמנה ממוצע ${pct>0?'עלה':'ירד'} ב-${Math.abs(pct)}%</b> (מ-₪${prev.avg} ל-₪${curr.avg}).`);
    }
  }

  if(insights.length===0){
    el.innerHTML='<div style="color:#888;text-align:center;padding:14px;">אין מספיק נתונים לתובנות עבור החודש הזה</div>';
  }else{
    el.innerHTML=insights.map(t=>`<div style="padding:8px 0;border-bottom:1px solid rgba(57,230,0,0.1);color:#ddd;">${t}</div>`).join('');
  }
}

// ====================================================
// ============= הפונקציה הראשית =============
// ====================================================

function renderMonthlyReport(){
  try{
    mrInitMonthPicker();

    // עדכן כותרת
    const title=document.getElementById('mr-title');
    const period=document.getElementById('mr-period');
    if(title)title.textContent='דוח '+mrMonthLabel(mrSelectedMonth);
    if(period){
      const r=getMonthRange(mrSelectedMonth);
      const start=new Date(r.start).toLocaleDateString('he-IL');
      const end=new Date(r.end-1).toLocaleDateString('he-IL');
      period.textContent=`${start} – ${end}`;
    }

    // הגבל כפתור הבא
    const nextBtn=document.getElementById('mr-next-btn');
    if(nextBtn){
      nextBtn.disabled=mrSelectedMonth===0;
      nextBtn.style.opacity=mrSelectedMonth===0?'0.4':'1';
      nextBtn.style.cursor=mrSelectedMonth===0?'not-allowed':'pointer';
    }

    // KPIs
    const curr=mrComputeKPIs(mrSelectedMonth);
    const prev=mrComputeKPIs(mrSelectedMonth+1);

    document.getElementById('mr-rev').textContent='₪'+Math.round(curr.rev).toLocaleString();
    document.getElementById('mr-rev-cmp').innerHTML=mrCompare(curr.rev,prev.rev,'₪',' ');

    const profitEl=document.getElementById('mr-profit');
    profitEl.textContent='₪'+Math.round(curr.profit).toLocaleString();
    profitEl.style.color=curr.profit>=0?'#39e600':'#e24b4a';
    document.getElementById('mr-profit-cmp').innerHTML=mrCompare(curr.profit,prev.profit,'₪',' ');

    document.getElementById('mr-orders').textContent=curr.orders.toLocaleString();
    document.getElementById('mr-orders-cmp').innerHTML=mrCompare(curr.orders,prev.orders);

    document.getElementById('mr-avg').textContent='₪'+curr.avg.toLocaleString();
    document.getElementById('mr-avg-cmp').innerHTML=mrCompare(curr.avg,prev.avg,'₪',' ');

    document.getElementById('mr-stores').textContent=curr.activeStores;
    document.getElementById('mr-stores-cmp').innerHTML=mrCompare(curr.activeStores,prev.activeStores);

    const marginEl=document.getElementById('mr-margin');
    marginEl.textContent=curr.margin+'%';
    marginEl.style.color=curr.margin>=20?'#39e600':curr.margin>=10?'#ef9f27':curr.margin>=0?'#e24b4a':'#e24b4a';
    document.getElementById('mr-margin-cmp').innerHTML=mrCompare(curr.margin,prev.margin,'',' %');

    // 🔮 חיזוי לסוף החודש (רק כשמסתכלים על החודש הנוכחי)
    var forecastCard=document.getElementById('mr-forecast-card');
    if(forecastCard){
      if(mrSelectedMonth===0){
        // החודש הנוכחי — נחשב חיזוי
        var now=new Date();
        var year=now.getFullYear();
        var month=now.getMonth();
        var daysInMonth=new Date(year,month+1,0).getDate();
        var dayOfMonth=now.getDate();
        var hourOfDay=now.getHours();
        // חישוב מדויק יותר: יום נוכחי כולל החלק שעבר ביום
        var elapsedDays=dayOfMonth-1+(hourOfDay/24);
        var elapsedDaysInt=Math.max(1,Math.round(elapsedDays));
        var progress=Math.min(100,Math.round((elapsedDays/daysInMonth)*100));

        var forecastRev=elapsedDays>0?Math.round((curr.rev/elapsedDays)*daysInMonth):0;
        var forecastProfit=elapsedDays>0?Math.round((curr.profit/elapsedDays)*daysInMonth):0;

        forecastCard.style.display='block';

        var subEl=document.getElementById('mr-forecast-sub');
        if(subEl){
          subEl.textContent='עברו '+elapsedDaysInt+' מתוך '+daysInMonth+' ימים · על פי הקצב הנוכחי';
        }

        var revEl=document.getElementById('mr-forecast-rev');
        var profitEl2=document.getElementById('mr-forecast-profit');
        if(revEl)revEl.textContent='₪'+forecastRev.toLocaleString();
        if(profitEl2){
          profitEl2.textContent='₪'+forecastProfit.toLocaleString();
          profitEl2.style.color=forecastProfit>=0?'#39e600':'#e24b4a';
        }

        // השוואה לחודש שעבר
        var revVsEl=document.getElementById('mr-forecast-rev-vs');
        var profitVsEl=document.getElementById('mr-forecast-profit-vs');
        if(revVsEl){
          if(prev.rev===0){
            revVsEl.innerHTML='<span style="color:#666;">חודש ראשון</span>';
          } else {
            var revDiff=forecastRev-prev.rev;
            var revPct=Math.round((revDiff/prev.rev)*100);
            var revColor=revDiff>=0?'#39e600':'#e24b4a';
            var revArrow=revDiff>=0?'▲':'▼';
            revVsEl.innerHTML='<span style="color:'+revColor+';">'+revArrow+' '+(revDiff>=0?'+':'')+revPct+'% מ'+mrMonthLabel(1)+'</span>';
          }
        }
        if(profitVsEl){
          if(prev.profit===0){
            profitVsEl.innerHTML='<span style="color:#666;">חודש ראשון</span>';
          } else {
            var profitDiff=forecastProfit-prev.profit;
            var profitPct=Math.round((profitDiff/Math.abs(prev.profit))*100);
            var profitColor=profitDiff>=0?'#39e600':'#e24b4a';
            var profitArrow=profitDiff>=0?'▲':'▼';
            profitVsEl.innerHTML='<span style="color:'+profitColor+';">'+profitArrow+' '+(profitDiff>=0?'+':'')+profitPct+'% מ'+mrMonthLabel(1)+'</span>';
          }
        }

        // מדד התקדמות
        var progressTxt=document.getElementById('mr-forecast-progress-txt');
        var progressBar=document.getElementById('mr-forecast-progress-bar');
        if(progressTxt)progressTxt.textContent=progress+'%';
        if(progressBar)progressBar.style.width=progress+'%';
      } else {
        // חודש קודם — לא צריך חיזוי
        forecastCard.style.display='none';
      }
    }

    // ציור גרפים (בהשהיה כדי שה-DOM ייערך נכון)
    setTimeout(()=>{
      drawTrendChart();
      drawDailyChart();
      drawCategoryChart();
      drawHoursChart();
    },50);

    // טבלאות
    renderMonthlyStores();
    renderMonthlyTopProducts();
    renderMonthlyTopUsers();
    renderMonthlyInsights();
  }catch(e){
    console.error('renderMonthlyReport error:',e);
  }
}

// ===================================================
// ================ ייצוא דוחות ================
// ===================================================

function exportMonthlyCSV(){
  const ord=mrOrdersOf(mrSelectedMonth).filter(o=>o.status==='done');
  const monthLabel=mrMonthLabel(mrSelectedMonth);
  const curr=mrComputeKPIs(mrSelectedMonth);
  const prev=mrComputeKPIs(mrSelectedMonth+1);

  const rows=[
    ['דוח חודשי - '+monthLabel],
    [],
    ['== סיכום ==' ],
    ['','החודש','חודש קודם','שינוי %'],
    ['הכנסות','₪'+Math.round(curr.rev),'₪'+Math.round(prev.rev),prev.rev>0?Math.round(((curr.rev-prev.rev)/prev.rev)*100)+'%':'—'],
    ['רווח נקי','₪'+Math.round(curr.profit),'₪'+Math.round(prev.profit),prev.profit!==0?Math.round(((curr.profit-prev.profit)/Math.abs(prev.profit))*100)+'%':'—'],
    ['הזמנות',curr.orders,prev.orders,prev.orders>0?Math.round(((curr.orders-prev.orders)/prev.orders)*100)+'%':'—'],
    ['ערך הזמנה ממוצע','₪'+curr.avg,'₪'+prev.avg,'—'],
    ['חנויות פעילות',curr.activeStores,prev.activeStores,'—'],
    ['שולי רווח',curr.margin+'%',prev.margin+'%','—'],
    [],
    ['== פירוט הזמנות =='],
    ['#','תאריך','שעה','חנות','מוצר','חבילה','משתמש','מחיר','רווח'],
    ...ord.map((o,i)=>{
      const t=new Date(getOrderDate(o));
      return [i+1,t.toLocaleDateString('he-IL'),t.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}),o.storeName||'',o.prod||'',o.pkg||'',o.user||'',Math.round(Number(o.price||0)),Math.round(getOrderProfit(o))];
    })
  ];
  const fname=`דוח_חודשי_${monthLabel.replace(' ','_')}.csv`;
  downloadCSV(fname,rows);
  toast('t-admin','✅ הדוח החודשי הורד!');
}

function exportMonthlyPDF(){
  // נשתמש בחלון הדפסה עם עיצוב מותאם
  const monthLabel=mrMonthLabel(mrSelectedMonth);
  const curr=mrComputeKPIs(mrSelectedMonth);
  const prev=mrComputeKPIs(mrSelectedMonth+1);
  const r=getMonthRange(mrSelectedMonth);
  const dateRange=new Date(r.start).toLocaleDateString('he-IL')+' – '+new Date(r.end-1).toLocaleDateString('he-IL');

  // נתוני חנויות
  const currOrd=mrOrdersOf(mrSelectedMonth);
  const prevOrd=mrOrdersOf(mrSelectedMonth+1);
  const storeData=stores.map(s=>{
    const so=currOrd.filter(o=>o.storeId===s.id);
    const sod=so.filter(o=>o.status==='done');
    const rev=sod.reduce((t,o)=>t+Number(o.price||0),0);
    const profit=sod.reduce((t,o)=>t+getOrderProfit(o),0);
    const margin=rev>0?Math.round((profit/rev)*100):0;
    const prevSo=prevOrd.filter(o=>o.storeId===s.id&&o.status==='done');
    const prevRev=prevSo.reduce((t,o)=>t+Number(o.price||0),0);
    const growth=prevRev>0?Math.round(((rev-prevRev)/prevRev)*100):(rev>0?100:0);
    return {s,orders:so.length,rev,profit,margin,prevRev,growth};
  }).filter(d=>d.orders>0).sort((a,b)=>b.rev-a.rev);

  // טופ מוצרים
  const ord=currOrd.filter(o=>o.status==='done');
  const byProd={};
  ord.forEach(o=>{const k=o.prod||'אחר';if(!byProd[k])byProd[k]={count:0,rev:0};byProd[k].count++;byProd[k].rev+=Number(o.price||0);});
  const topProds=Object.entries(byProd).sort((a,b)=>b[1].rev-a[1].rev).slice(0,10);

  // טופ לקוחות
  const byUser={};
  ord.forEach(o=>{const k=(o.user||'אנונימי').trim()||'אנונימי';if(!byUser[k])byUser[k]={count:0,rev:0};byUser[k].count++;byUser[k].rev+=Number(o.price||0);});
  const topUsers=Object.entries(byUser).sort((a,b)=>b[1].rev-a[1].rev).slice(0,10);

  const fmtCmp=(c,p)=>{
    if(p===0)return c===0?'—':'חדש';
    const pct=Math.round(((c-p)/Math.abs(p))*100);
    const color=pct>=0?'#1d6f42':'#c0392b';
    return `<span style="color:${color};font-weight:700;">${pct>=0?'+':''}${pct}%</span>`;
  };

  const html=`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>דוח חודשי - ${monthLabel}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=Exo+2:wght@700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Heebo',sans-serif;background:#fff;color:#222;padding:30px;direction:rtl;}
.header{border-bottom:3px solid #39e600;padding-bottom:18px;margin-bottom:25px;display:flex;justify-content:space-between;align-items:flex-end;}
.header .brand{font-family:'Exo 2',sans-serif;font-size:32px;font-weight:800;letter-spacing:3px;}
.header .brand span{color:#39e600;}
.header .meta{text-align:left;font-size:13px;color:#666;}
h1{font-size:24px;color:#0d4d1a;margin-bottom:6px;}
.period{color:#666;font-size:14px;margin-bottom:25px;}
h2{font-size:17px;color:#222;margin:22px 0 12px;padding-bottom:6px;border-bottom:2px solid #e8f5e8;}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;}
.kpi{background:#f5fbf5;border:1px solid #d8edd8;border-radius:10px;padding:14px;}
.kpi-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;}
.kpi-value{font-size:22px;font-weight:800;color:#0d4d1a;margin:4px 0;}
.kpi-cmp{font-size:11px;color:#666;}
table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12px;}
th{background:#0d4d1a;color:#fff;padding:9px 8px;text-align:right;font-weight:700;}
td{padding:8px;border-bottom:1px solid #eee;}
tr:nth-child(even) td{background:#f8fbf8;}
tfoot td{background:#e8f5e8 !important;font-weight:700;border-top:2px solid #39e600;}
.footer{margin-top:30px;padding-top:14px;border-top:1px solid #ddd;font-size:11px;color:#888;text-align:center;}
@media print{body{padding:15px;}.no-print{display:none;}h2{page-break-after:avoid;}table{page-break-inside:auto;}tr{page-break-inside:avoid;}}
.print-btn{position:fixed;top:15px;left:15px;background:#39e600;color:#000;border:none;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;z-index:9999;}
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨️ הדפס / שמור כ-PDF</button>
<div class="header"><div class="brand">CASH<span>PHONE</span></div><div class="meta">דוח חודשי<br>הופק: ${new Date().toLocaleString('he-IL')}</div></div>
<h1>📅 דוח ${monthLabel}</h1>
<div class="period">תקופה: ${dateRange}</div>

<h2>📊 מדדים מרכזיים</h2>
<div class="kpi-grid">
<div class="kpi"><div class="kpi-label">💰 הכנסות</div><div class="kpi-value">₪${Math.round(curr.rev).toLocaleString()}</div><div class="kpi-cmp">${fmtCmp(curr.rev,prev.rev)} מול ₪${Math.round(prev.rev).toLocaleString()}</div></div>
<div class="kpi"><div class="kpi-label">💵 רווח נקי</div><div class="kpi-value">₪${Math.round(curr.profit).toLocaleString()}</div><div class="kpi-cmp">${fmtCmp(curr.profit,prev.profit)} מול ₪${Math.round(prev.profit).toLocaleString()}</div></div>
<div class="kpi"><div class="kpi-label">📦 הזמנות</div><div class="kpi-value">${curr.orders}</div><div class="kpi-cmp">${fmtCmp(curr.orders,prev.orders)} מול ${prev.orders}</div></div>
<div class="kpi"><div class="kpi-label">📊 ערך הזמנה ממוצע</div><div class="kpi-value">₪${curr.avg.toLocaleString()}</div><div class="kpi-cmp">מול ₪${prev.avg.toLocaleString()}</div></div>
<div class="kpi"><div class="kpi-label">🏪 חנויות פעילות</div><div class="kpi-value">${curr.activeStores}</div><div class="kpi-cmp">מול ${prev.activeStores}</div></div>
<div class="kpi"><div class="kpi-label">📈 שולי רווח</div><div class="kpi-value">${curr.margin}%</div><div class="kpi-cmp">מול ${prev.margin}%</div></div>
</div>

<h2>🏆 ביצועי חנויות</h2>
<table><thead><tr><th>#</th><th>חנות</th><th>הזמנות</th><th>הכנסות</th><th>רווח</th><th>שולי %</th><th>מגמה</th></tr></thead>
<tbody>${storeData.map((d,i)=>`<tr><td>${i+1}</td><td><b>${d.s.name}</b></td><td>${d.orders}</td><td>₪${Math.round(d.rev).toLocaleString()}</td><td>₪${Math.round(d.profit).toLocaleString()}</td><td>${d.margin}%</td><td>${d.prevRev===0?'חדש':(d.growth>=0?'+':'')+d.growth+'%'}</td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:20px;">אין נתונים</td></tr>'}</tbody>
${storeData.length?`<tfoot><tr><td colspan="2">סה"כ (${storeData.length} חנויות)</td><td>${storeData.reduce((t,d)=>t+d.orders,0)}</td><td>₪${Math.round(storeData.reduce((t,d)=>t+d.rev,0)).toLocaleString()}</td><td>₪${Math.round(storeData.reduce((t,d)=>t+d.profit,0)).toLocaleString()}</td><td colspan="2"></td></tr></tfoot>`:''}
</table>

<h2>🎮 טופ 10 מוצרים</h2>
<table><thead><tr><th>#</th><th>מוצר</th><th>הזמנות</th><th>הכנסות</th></tr></thead>
<tbody>${topProds.map(([n,d],i)=>`<tr><td>${i+1}</td><td>${n}</td><td>${d.count}</td><td>₪${Math.round(d.rev).toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;">אין נתונים</td></tr>'}</tbody></table>

<h2>👥 טופ 10 לקוחות</h2>
<table><thead><tr><th>#</th><th>לקוח</th><th>הזמנות</th><th>סה"כ קנה</th></tr></thead>
<tbody>${topUsers.map(([n,d],i)=>`<tr><td>${i+1}</td><td>${n}</td><td>${d.count}</td><td>₪${Math.round(d.rev).toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;">אין נתונים</td></tr>'}</tbody></table>

<div class="footer">CashPhone © ${new Date().getFullYear()} · דוח אוטומטי · ${dateRange}</div>
<\/body><\/html>`;

  const win=window.open('','_blank');
  if(!win){toast('t-admin','⚠️ אנא אפשר חלונות קופצים כדי להדפיס');return;}
  win.document.write(html);
  // הוסף סקריפט הדפסה אוטומטית אחרי שהמסמך נטען
  const autoPrint=win.document.createElement('script');
  autoPrint.text='setTimeout(()=>window.print(),700);';
  win.document.body.appendChild(autoPrint);
  win.document.close();
  toast('t-admin','✅ הדוח נפתח בחלון חדש - לחץ הדפס כדי לשמור כ-PDF');
}


function renderDebts(){
  const el=document.getElementById('debts-list');
  if(!el)return;
  const inDebt=stores.filter(s=>s.credit<0);
  const withLimit=stores.filter(s=>s.debtLimit>0);
  let html='';
  // סיכום כללי
  const totalDebt=stores.reduce((t,s)=>t+(s.credit<0?Math.abs(s.credit):0),0);
  if(totalDebt>0){
    html+=`<div style="background:#fff5f5;border:1px solid #e24b4a;border-radius:10px;padding:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:13px;color:#e24b4a;font-weight:700;">סה"כ חובות</span>
      <span style="font-size:20px;font-weight:800;color:#e24b4a;">₪${totalDebt.toLocaleString()}</span>
    </div>`;
  }
  // רשימת חנויות
  html+='<div style="display:grid;gap:8px;">';
  stores.forEach(s=>{
    const isDebt=s.credit<0;
    const debtLimit=s.debtLimit||0;
    const used=isDebt?Math.abs(s.credit):0;
    const pct=debtLimit>0?Math.min(100,Math.round(used/debtLimit*100)):0;
    const color=isDebt?'#e24b4a':s.credit<100?'#ef9f27':'#39e600';
    html+=`<div style="background:#fff;border:1px solid ${isDebt?'#fcc':debtLimit>0?'#ffe5b4':'#e8e8e8'};border-radius:12px;padding:12px 14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <div style="font-weight:700;font-size:14px;color:#111;">${s.name}</div>
          <div style="font-size:11px;color:#999;margin-top:2px;">${debtLimit>0?`מסגרת: ₪${debtLimit.toLocaleString()}`:'ללא מסגרת אשראי'}</div>
        </div>
        <div style="text-align:left;">
          <div style="font-size:16px;font-weight:800;color:${color};">${isDebt?'-':''}₪${Math.abs(s.credit).toLocaleString()}</div>
          <div style="font-size:11px;color:#999;">${isDebt?'חוב':'יתרה'}</div>
        </div>
      </div>
      ${debtLimit>0&&isDebt?`
        <div style="background:#f0f0f0;border-radius:20px;height:6px;overflow:hidden;">
          <div style="height:100%;border-radius:20px;background:${pct>80?'#e24b4a':'#ef9f27'};width:${pct}%;transition:width .3s;"></div>
        </div>
        <div style="font-size:11px;color:#999;margin-top:4px;text-align:left;">${pct}% מהמסגרת</div>
      `:''}
    </div>`;
  });
  html+='</div>';
  if(stores.length===0)html='<div style="text-align:center;padding:20px;color:#999;">אין חנויות עדיין</div>';
  el.innerHTML=html;
}

function exportDebts(){
  const rows=[
    ['שם חנות','יתרה (₪)','מסגרת חוב (₪)','סטטוס','אחוז מסגרת'],
    ...stores.map(s=>{
      const isDebt=s.credit<0;
      const debtLimit=s.debtLimit||0;
      const pct=debtLimit>0&&isDebt?Math.round(Math.abs(s.credit)/debtLimit*100):0;
      return[s.name,s.credit,debtLimit,isDebt?'חוב':'תקין',debtLimit>0?pct+'%':'—'];
    })
  ];
  downloadCSV(`חובות_${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.csv`,rows);
  toast('t-admin','✅ דוח חובות הורד!');
}

// ============================================================
// ============ 💼 פאנל משווק — עמוד נפרד ובלעדי ============
// ============================================================

// קבלת רשימת החנויות של המשווק הנוכחי
function rsGetMyStores(){
  if(!currentUser||currentUser.role!=='reseller')return [];
  // חנות שייכת למשווק אם:
  // (א) שדה s.resellerId שווה ל-id של המשווק (הצמדה ע"י אדמין)
  // (ב) למשתמש של החנות יש resellerOf == id של המשווק (פתיחה ע"י המשווק)
  return stores.filter(function(s){
    if(s.resellerId===currentUser.id)return true;
    var u=users.find(function(x){return x.storeId===s.id;});
    return u&&u.resellerOf===currentUser.id;
  });
}

// קבלת רשימת ההזמנות של חנויות המשווק
function rsGetMyOrders(){
  var myStoreIds=rsGetMyStores().map(function(s){return s.id;});
  return orders.filter(function(o){return myStoreIds.indexOf(o.storeId)>=0;});
}

// טאב פנימי בעמוד המשווק
function rsTab(el,id){
  document.querySelectorAll('#page-reseller .atab').forEach(function(t){t.classList.remove('on');});
  el.classList.add('on');
  ['rs-sec-stores','rs-sec-orders','rs-sec-prices','rs-sec-margin','rs-sec-add'].forEach(function(s){
    var x=document.getElementById(s);
    if(x)x.style.display='none';
  });
  var target=document.getElementById(id);
  if(target)target.style.display='block';
  if(id==='rs-sec-stores')renderResellerStores();
  if(id==='rs-sec-orders')renderResellerOrders();
  if(id==='rs-sec-prices')renderResellerPrices();
  if(id==='rs-sec-margin')renderResellerMargin();
}

// פונקציה ראשית — מציירת את כל עמוד המשווק
function renderResellerPanel(){
  if(!currentUser||currentUser.role!=='reseller')return;
  // עדכון KPIs
  rsUpdateKPIs();
  // עדכון ברכת קבלת פנים
  var welcome=document.getElementById('rs-welcome');
  if(welcome){
    var info=currentUser.customerInfo||{};
    var displayName=info.contactName||info.bizName||currentUser.username;
    welcome.textContent='שלום '+displayName+' 👋';
  }
  // ציור הטאב הפעיל
  renderResellerStores();
}

function rsUpdateKPIs(){
  var myStores=rsGetMyStores();
  var myOrders=rsGetMyOrders();

  // הכנסות החודש (מחיר ההזמנה - מחיר הבסיס = רווח של המשווק)
  // לפשטות, מציגים את סה"כ ההזמנות שעברו דרך החנויות שלו החודש
  var now=new Date();
  var monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  var thisMonthOrders=myOrders.filter(function(o){
    var t=o.id||0;
    return t>=monthStart&&o.status==='done';
  });
  var revThisMonth=thisMonthOrders.reduce(function(t,o){return t+(o.price||0);},0);

  // חוב פתוח של החנויות שלו אליו
  var unpaid=myStores.reduce(function(t,s){return t+(s.unpaidBalance||0);},0);

  var elS=document.getElementById('rs-kpi-stores');
  var elR=document.getElementById('rs-kpi-rev');
  var elU=document.getElementById('rs-kpi-unpaid');
  var elO=document.getElementById('rs-kpi-orders');
  if(elS)elS.textContent=myStores.length;
  if(elR)elR.textContent='₪'+revThisMonth.toLocaleString();
  if(elU)elU.textContent='₪'+unpaid.toLocaleString();
  if(elO)elO.textContent=thisMonthOrders.length;
}

// ============ טאב: החנויות שלי ============
function renderResellerStores(){
  var el=document.getElementById('rs-sec-stores');
  if(!el)return;
  var myStores=rsGetMyStores();
  if(myStores.length===0){
    el.innerHTML='<div class="card" style="text-align:center;padding:40px 20px;">'+
      '<div style="font-size:48px;margin-bottom:12px;">🏪</div>'+
      '<div style="font-size:16px;color:#fff;font-weight:700;margin-bottom:6px;">אין לך חנויות עדיין</div>'+
      '<div style="font-size:13px;color:#999;margin-bottom:16px;">פתח חנות ראשונה כדי להתחיל לעבוד</div>'+
      '<button class="gbtn" onclick="document.querySelectorAll(\'#page-reseller .atab\')[3].click()">➕ פתח חנות חדשה</button>'+
      '</div>';
    return;
  }
  var html='<div class="card"><div class="card-title">🏪 החנויות שלי ('+myStores.length+')</div>';
  // טבלת חנויות
  html+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html+='<thead><tr style="background:#2d3748;color:#aaa;">'+
    '<th style="padding:10px 8px;text-align:right;border-bottom:1px solid #5a6478;">חנות</th>'+
    '<th style="padding:10px 8px;text-align:center;border-bottom:1px solid #5a6478;">יתרה</th>'+
    '<th style="padding:10px 8px;text-align:center;border-bottom:1px solid #5a6478;">חוב פתוח</th>'+
    '<th style="padding:10px 8px;text-align:center;border-bottom:1px solid #5a6478;">סטטוס</th>'+
    '<th style="padding:10px 8px;text-align:center;border-bottom:1px solid #5a6478;">פעולות</th>'+
    '</tr></thead><tbody>';
  myStores.forEach(function(s){
    var credit=s.credit||0;
    var unpaid=s.unpaidBalance||0;
    var creditClr=credit<0?'#e24b4a':credit===0?'#888':'#39e600';
    var creditTxt=credit<0?'חוב ₪'+Math.abs(credit).toLocaleString():'₪'+credit.toLocaleString();
    var u=users.find(function(x){return x.storeId===s.id;});
    var ownerType=s.resellerId===currentUser.id&&(!u||u.resellerOf!==currentUser.id)
      ?'<span style="background:#3a1a5f;color:#c490ff;padding:2px 6px;border-radius:8px;font-size:9px;">מוצמד</span>'
      :'<span style="background:#1a3a1a;color:#90c490;padding:2px 6px;border-radius:8px;font-size:9px;">פתחתי</span>';
    var statusBadge=s.frozen
      ?'<span style="background:#0a1a2a;color:#7cb3ff;padding:3px 8px;border-radius:8px;font-size:10px;">🧊 קפוא</span>'
      :'<span style="background:#1a3a1a;color:#90c490;padding:3px 8px;border-radius:8px;font-size:10px;">✓ פעיל</span>';
    html+='<tr style="border-bottom:1px solid #3a4556;">'+
      '<td style="padding:10px 8px;cursor:pointer;" onclick="openCustomerCard(\''+s.id+'\')" title="פתח כרטיס לקוח"><div style="font-weight:700;color:#fff;text-decoration:underline;text-decoration-color:#5a6478;">'+s.name+'</div><div style="font-size:10px;color:#888;margin-top:2px;">'+ownerType+'</div></td>'+
      '<td style="padding:10px 8px;text-align:center;color:'+creditClr+';font-weight:700;">'+creditTxt+'</td>'+
      '<td style="padding:10px 8px;text-align:center;color:'+(unpaid>0?'#ef9f27':'#666')+';font-weight:700;">'+(unpaid>0?'₪'+unpaid.toLocaleString():'—')+'</td>'+
      '<td style="padding:10px 8px;text-align:center;">'+statusBadge+'</td>'+
      '<td style="padding:10px 8px;text-align:center;white-space:nowrap;">'+
        '<button onclick="rsTopup(\''+s.id+'\')" title="טעינת קרדיט" style="background:#1a3a1a;color:#90c490;border:1px solid #2a5a2a;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;margin:0 2px;">➕ טען</button>'+
        (unpaid>0?'<button onclick="rsRecordPayment(\''+s.id+'\')" title="קבלת תשלום" style="background:#3a2a1a;color:#ef9f27;border:1px solid #5a3a1a;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;margin:0 2px;">💰 שולם</button>':'')+
        '<button onclick="rsOpenMarginForStore(\''+s.id+'\')" title="קבע רווח לחנות" style="background:#0a2a1a;color:#86efac;border:1px solid #1a5a2a;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;margin:0 2px;">💰 רווח</button>'+
        '<button onclick="openCustomerCard(\''+s.id+'\')" title="כרטיס לקוח" style="background:#1a2a3a;color:#7cb3ff;border:1px solid #2a3a5a;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;margin:0 2px;">🎴 כרטיס</button>'+
      '</td>'+
    '</tr>';
  });
  html+='</tbody></table></div></div>';
  el.innerHTML=html;
}

// ============ טאב: הזמנות ============
function renderResellerOrders(){
  var el=document.getElementById('rs-sec-orders');
  if(!el)return;
  var myOrders=rsGetMyOrders().slice().sort(function(a,b){return (b.id||0)-(a.id||0);});

  // דוח רווחים בראש העמוד
  var profitHtml=rsRenderProfitReport();
  var html=profitHtml;

  if(myOrders.length===0){
    html+='<div class="card" style="text-align:center;padding:40px 20px;color:#999;">'+
      '<div style="font-size:48px;margin-bottom:12px;">📋</div>'+
      'אין הזמנות עדיין מהחנויות שלך</div>';
    el.innerHTML=html;
    return;
  }
  html+='<div class="card"><div class="card-title">📋 הזמנות מהחנויות שלי ('+myOrders.length+')</div>';
  html+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">';
  html+='<thead><tr style="background:#2d3748;color:#aaa;">'+
    '<th style="padding:8px;text-align:right;">חנות</th>'+
    '<th style="padding:8px;text-align:right;">מוצר</th>'+
    '<th style="padding:8px;text-align:right;">חבילה</th>'+
    '<th style="padding:8px;text-align:right;">שחקן</th>'+
    '<th style="padding:8px;text-align:center;">מחיר</th>'+
    '<th style="padding:8px;text-align:center;">רווח</th>'+
    '<th style="padding:8px;text-align:center;">סטטוס</th>'+
    '<th style="padding:8px;text-align:center;">זמן</th>'+
    '</tr></thead><tbody>';
  myOrders.slice(0,100).forEach(function(o){
    var statusClr=o.status==='done'?'#39e600':o.status==='new'?'#ef9f27':'#888';
    var statusTxt=o.status==='done'?'✓ בוצע':o.status==='new'?'⏱ ממתין':o.status;
    var orderProfit=o.basePrice?Math.max(0,(o.price||0)-(o.basePrice||0)):0;
    html+='<tr style="border-bottom:1px solid #3a4556;cursor:pointer;" onclick="openCustomerCard(\''+o.storeId+'\')" onmouseover="this.style.background=\'#3a4556\'" onmouseout="this.style.background=\'\'">'+
      '<td style="padding:8px;color:#fff;font-weight:600;">'+(o.storeName||'—')+'</td>'+
      '<td style="padding:8px;color:#ccc;">'+(o.prod||'—')+'</td>'+
      '<td style="padding:8px;color:#aaa;">'+(o.pkg||'—')+'</td>'+
      '<td style="padding:8px;color:#aaa;">'+(o.user||'—')+'</td>'+
      '<td style="padding:8px;text-align:center;color:#39e600;font-weight:700;">₪'+(o.price||0).toLocaleString()+'</td>'+
      '<td style="padding:8px;text-align:center;color:'+(orderProfit>0?'#39e600':'#666')+';font-weight:700;">'+(orderProfit>0?'₪'+orderProfit.toLocaleString():'—')+'</td>'+
      '<td style="padding:8px;text-align:center;color:'+statusClr+';">'+statusTxt+'</td>'+
      '<td style="padding:8px;text-align:center;color:#888;font-size:11px;">'+(o.time||'')+'</td>'+
    '</tr>';
  });
  html+='</tbody></table></div>';
  if(myOrders.length>100)html+='<div style="text-align:center;color:#888;font-size:12px;padding:10px;">מוצגות 100 ההזמנות האחרונות מתוך '+myOrders.length+'</div>';
  html+='</div>';
  el.innerHTML=html;
}

// ============ טאב: עריכת מחירים ============
function renderResellerPrices(){
  var el=document.getElementById('rs-sec-prices');
  if(!el)return;
  var myStores=rsGetMyStores();
  if(myStores.length===0){
    el.innerHTML='<div class="card" style="text-align:center;padding:40px 20px;color:#999;">פתח קודם חנות כדי לערוך מחירים</div>';
    return;
  }
  // השתמש בעורך המחירים הקיים אבל מוגבל לחנויות של המשווק
  if(!priceStoreId||!myStores.find(function(s){return s.id===priceStoreId;})){
    priceStoreId=myStores[0].id;
  }
  pendingP=null;
  var html='<div class="card"><div class="card-title">💵 עריכת מחירים בחנויות שלי</div>';
  html+='<div style="font-size:12px;color:#aaa;margin-bottom:10px;">בחר חנות, ערוך מחירים, ושמור. השינויים ייכנסו לתוקף מיידית.</div>';
  html+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;" id="rs-store-tabs">';
  myStores.forEach(function(s){
    var isOn=s.id===priceStoreId;
    html+='<button class="stab'+(isOn?' on':'')+'" onclick="rsSelectPriceStore(\''+s.id+'\')">'+s.name+'</button>';
  });
  html+='</div>';
  html+='<div id="rs-price-editor"></div>';
  html+='</div>';
  el.innerHTML=html;
  rsRenderPriceEditor();
}

function rsSelectPriceStore(id){
  if(pendingP){
    cpConfirm('יש שינויים שלא נשמרו. לעבור בכל זאת?',{type:'warning',okText:'עבור (בטל שינויים)'}).then(function(ok){
      if(!ok)return;
      priceStoreId=id;pendingP=null;
      // עדכון class של הטאבים
      document.querySelectorAll('#rs-store-tabs .stab').forEach(function(b){b.classList.remove('on');});
      var btns=document.querySelectorAll('#rs-store-tabs .stab');
      var myStores=rsGetMyStores();
      var idx=myStores.findIndex(function(s){return s.id===id;});
      if(idx>=0&&btns[idx])btns[idx].classList.add('on');
      rsRenderPriceEditor();
    });
    return;
  }
  priceStoreId=id;pendingP=null;
  document.querySelectorAll('#rs-store-tabs .stab').forEach(function(b){b.classList.remove('on');});
  var btns=document.querySelectorAll('#rs-store-tabs .stab');
  var myStores=rsGetMyStores();
  var idx=myStores.findIndex(function(s){return s.id===id;});
  if(idx>=0&&btns[idx])btns[idx].classList.add('on');
  rsRenderPriceEditor();
}

function rsRenderPriceEditor(){
  var wrap=document.getElementById('rs-price-editor');
  if(!wrap)return;
  var s=stores.find(function(x){return x.id===priceStoreId;});
  if(!s){wrap.innerHTML='<div style="color:#999;text-align:center;padding:20px;">בחר חנות</div>';return;}
  var current=pendingP||s.prices||makePrices('normal');
  var html='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:10px;padding:14px;margin-bottom:14px;">';
  html+='<div style="font-size:13px;color:#aaa;margin-bottom:10px;">חנות: <b style="color:#fff;">'+s.name+'</b></div>';
  // טבלת מחירים פשוטה — מציג מוצרים עם המחיר הבסיסי
  html+='<table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html+='<thead><tr style="color:#aaa;"><th style="padding:8px;text-align:right;">מוצר</th><th style="padding:8px;text-align:right;">חבילה</th><th style="padding:8px;text-align:center;">מחיר בסיס</th><th style="padding:8px;text-align:center;">מחיר חדש</th></tr></thead>';
  html+='<tbody>';
  PRODS.forEach(function(prod){
    prod.pkgs.forEach(function(pkg,pkgIdx){
      var key=prod.id+'_'+pkg.p;
      var basePrice=pkg.p;
      var currentPrice=current[key]!==undefined?current[key]:basePrice;
      html+='<tr style="border-bottom:1px solid #3a4556;">'+
        '<td style="padding:7px;color:#fff;">'+prod.name+'</td>'+
        '<td style="padding:7px;color:#ccc;">'+pkg.a+'</td>'+
        '<td style="padding:7px;text-align:center;color:#888;">₪'+basePrice+'</td>'+
        '<td style="padding:7px;text-align:center;"><input type="number" value="'+currentPrice+'" data-key="'+key+'" oninput="rsOnPriceChange(this)" style="width:75px;background:#1a2030;color:#fff;border:1px solid #5a6478;border-radius:6px;padding:5px;text-align:center;"/></td>'+
      '</tr>';
    });
  });
  html+='</tbody></table>';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid #5a6478;">';
  html+='<span id="rs-price-changes" style="font-size:12px;color:#666;">'+(pendingP?'יש שינויים — לחץ שמור':'אין שינויים')+'</span>';
  html+='<div style="display:flex;gap:8px;">';
  html+='<button class="obtn" onclick="rsDiscardPrices()">בטל</button>';
  html+='<button class="gbtn" onclick="rsSavePrices()">💾 שמור</button>';
  html+='</div>';
  html+='</div>';
  html+='</div>';
  wrap.innerHTML=html;
}

function rsOnPriceChange(input){
  var key=input.dataset.key;
  var val=parseFloat(input.value)||0;
  var s=stores.find(function(x){return x.id===priceStoreId;});
  if(!s)return;
  if(!pendingP)pendingP=Object.assign({},s.prices||makePrices('normal'));
  pendingP[key]=val;
  var ch=document.getElementById('rs-price-changes');
  if(ch){ch.textContent='יש שינויים — לחץ שמור';ch.style.color='#ef9f27';}
}

function rsSavePrices(){
  if(!pendingP){toast('t-reseller','אין שינויים לשמור');return;}
  var s=stores.find(function(x){return x.id===priceStoreId;});
  if(!s)return;
  var oldPrices=s.prices?Object.assign({},s.prices):null;
  s.prices=Object.assign({},pendingP);
  pendingP=null;
  saveData();
  logAudit('reseller-prices-update','משווק עדכן מחירים בחנות',{
    storeId:s.id,storeName:s.name,resellerId:currentUser.id,
    resellerName:currentUser.username
  });
  toast('t-reseller','✅ המחירים נשמרו');
  rsRenderPriceEditor();
}

function rsDiscardPrices(){
  if(!pendingP){return;}
  pendingP=null;
  rsRenderPriceEditor();
  toast('t-reseller','השינויים בוטלו');
}

// ============ טאב: קביעת רווח (משווק) ============
function renderResellerMargin(){
  var el=document.getElementById('rs-sec-margin');
  if(!el)return;
  var myStores=rsGetMyStores();
  if(myStores.length===0){
    el.innerHTML='<div class="card" style="text-align:center;padding:40px 20px;color:#999;">פתח חנות כדי לקבוע רווחים</div>';
    return;
  }
  // אם לא נבחרה חנות - בחר את הראשונה
  if(!mgState.resellerStoreId||!myStores.find(function(s){return s.id===mgState.resellerStoreId;})){
    mgState.resellerStoreId=myStores[0].id;
  }
  var html='<div class="card">';
  html+='<div class="card-title">💰 קביעת רווח אוטומטי</div>';
  html+='<div style="background:#0a1a0a;border:1px solid #1a3a1a;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#86efac;">';
  html+='💡 בחר חנות, סוג חישוב (אחוזים/קבוע), והערך — והמערכת תעדכן את כל המחירים שלה ללקוחות אוטומטית. הרווח מחושב מעל מה שהחנות משלמת לך.';
  html+='</div>';

  // בחירת חנות
  html+='<div style="margin-bottom:14px;">';
  html+='<label class="lbl">🏪 בחר חנות לעריכה</label>';
  html+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;" id="rsmg-store-tabs">';
  myStores.forEach(function(s){
    var isOn=s.id===mgState.resellerStoreId;
    html+='<button class="stab'+(isOn?' on':'')+'" onclick="rsmgSelectStore(\''+s.id+'\')">'+s.name+'</button>';
  });
  html+='</div></div>';

  // היקף
  html+='<div style="margin-bottom:14px;">';
  html+='<label class="lbl">📦 על מה להחיל?</label>';
  html+='<div style="display:flex;gap:6px;margin-top:6px;">';
  html+='<button class="atab on" id="rsmg-scope-all" onclick="rsmgSetScope(\'all\')">🌍 כל המוצרים</button>';
  html+='<button class="atab" id="rsmg-scope-prod" onclick="rsmgSetScope(\'prod\')">🎯 מוצר ספציפי</button>';
  html+='</div></div>';

  // בחירת מוצר
  html+='<div id="rsmg-prod-wrap" style="display:none;margin-bottom:14px;">';
  html+='<label class="lbl">בחר מוצר</label>';
  html+='<select id="rsmg-prod-select" onchange="rsmgPickProd(this.value)" style="width:100%;background:#1a2030;color:#fff;border:1px solid #5a6478;border-radius:10px;padding:10px;font-size:13px;font-family:inherit;">';
  PRODS.forEach(function(p){
    html+='<option value="'+p.id+'">'+p.name+'</option>';
  });
  html+='</select></div>';

  // סוג
  html+='<div style="margin-bottom:14px;">';
  html+='<label class="lbl">💵 סוג חישוב</label>';
  html+='<div style="display:flex;gap:6px;margin-top:6px;">';
  html+='<button class="atab on" id="rsmg-type-pct" onclick="rsmgSetType(\'pct\')">📊 אחוזים %</button>';
  html+='<button class="atab" id="rsmg-type-fixed" onclick="rsmgSetType(\'fixed\')">💵 רווח קבוע ₪</button>';
  html+='</div></div>';

  // ערך
  html+='<div style="margin-bottom:14px;">';
  html+='<label class="lbl" id="rsmg-value-label">📈 אחוז רווח (%)</label>';
  html+='<div style="display:flex;align-items:center;gap:8px;">';
  html+='<input type="number" id="rsmg-value" min="0" step="0.5" placeholder="20" style="flex:1;background:#1a2030;color:#fff;border:1px solid #5a6478;border-radius:10px;padding:12px;font-size:18px;font-weight:700;text-align:center;font-family:inherit;" oninput="rsmgPreview()"/>';
  html+='<span id="rsmg-value-suffix" style="font-size:24px;font-weight:800;color:#39e600;min-width:32px;text-align:center;">%</span>';
  html+='</div></div>';

  // קיצורי דרך
  html+='<div style="margin-bottom:14px;"><label class="lbl" style="font-size:11px;">⚡ קיצורי דרך</label>';
  html+='<div id="rsmg-shortcuts" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;"></div></div>';

  // תצוגה מקדימה
  html+='<div id="rsmg-preview" style="background:#0a1a0a;border:1px solid #1a3a1a;border-radius:10px;padding:12px;margin-bottom:14px;display:none;">';
  html+='<div style="font-size:12px;color:#86efac;margin-bottom:8px;font-weight:700;">👁️ תצוגה מקדימה</div>';
  html+='<div id="rsmg-preview-list"></div>';
  html+='</div>';

  // כפתורים
  html+='<div style="display:flex;gap:8px;">';
  html+='<button class="obtn" onclick="rsmgReset()" style="flex:1;">🔄 אפס למחירי בסיס</button>';
  html+='<button class="gbtn" onclick="rsmgApply()" style="flex:2;">✓ החל</button>';
  html+='</div>';

  html+='</div>';

  // טבלת מצב נוכחי
  html+='<div class="card"><div class="card-title">📋 המחירים הנוכחיים בחנות</div>';
  html+='<div id="rsmg-current-list" style="max-height:400px;overflow-y:auto;"></div>';
  html+='</div>';

  el.innerHTML=html;
  rsmgInitUI();
}

function rsmgInitUI(){
  // אתחול state
  if(!mgState.scope)mgState.scope='all';
  if(!mgState.type)mgState.type='pct';
  if(!mgState.prodId&&PRODS.length)mgState.prodId=PRODS[0].id;
  rsmgRenderShortcuts();
  rsmgRenderCurrent();
}

function rsmgSelectStore(id){
  mgState.resellerStoreId=id;
  // עדכון class של הטאבים
  document.querySelectorAll('#rsmg-store-tabs .stab').forEach(function(b){b.classList.remove('on');});
  var btns=document.querySelectorAll('#rsmg-store-tabs .stab');
  var myStores=rsGetMyStores();
  var idx=myStores.findIndex(function(s){return s.id===id;});
  if(idx>=0&&btns[idx])btns[idx].classList.add('on');
  rsmgPreview();
  rsmgRenderCurrent();
}

function rsmgSetScope(scope){
  mgState.scope=scope;
  document.getElementById('rsmg-scope-all').classList.toggle('on',scope==='all');
  document.getElementById('rsmg-scope-prod').classList.toggle('on',scope==='prod');
  var w=document.getElementById('rsmg-prod-wrap');
  if(w)w.style.display=scope==='prod'?'block':'none';
  rsmgPreview();
}

function rsmgPickProd(id){
  mgState.prodId=parseInt(id);
  rsmgPreview();
}

function rsmgSetType(t){
  mgState.type=t;
  document.getElementById('rsmg-type-pct').classList.toggle('on',t==='pct');
  document.getElementById('rsmg-type-fixed').classList.toggle('on',t==='fixed');
  var lbl=document.getElementById('rsmg-value-label');
  var sfx=document.getElementById('rsmg-value-suffix');
  if(lbl)lbl.textContent=t==='pct'?'📈 אחוז רווח (%)':'💵 רווח קבוע (₪)';
  if(sfx)sfx.textContent=t==='pct'?'%':'₪';
  rsmgRenderShortcuts();
  rsmgPreview();
}

function rsmgRenderShortcuts(){
  var w=document.getElementById('rsmg-shortcuts');
  if(!w)return;
  var values=mgState.type==='pct'?[5,10,15,20,30,50]:[1,2,3,5,10,20];
  var html='';
  values.forEach(function(v){
    html+='<button onclick="rsmgSetVal('+v+')" style="background:#2d3748;color:#86efac;border:1px solid #475467;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">+'+v+(mgState.type==='pct'?'%':'₪')+'</button>';
  });
  w.innerHTML=html;
}

function rsmgSetVal(v){
  var inp=document.getElementById('rsmg-value');
  if(inp)inp.value=v;
  mgState.value=v;
  rsmgPreview();
}

function rsmgPreview(){
  var s=mgGetStore();
  if(!s)return;
  var inp=document.getElementById('rsmg-value');
  if(inp)mgState.value=parseFloat(inp.value)||0;
  var preview=document.getElementById('rsmg-preview');
  var list=document.getElementById('rsmg-preview-list');
  if(!preview||!list)return;
  if(!mgState.value||mgState.value<=0){preview.style.display='none';return;}
  var prodsToShow=mgState.scope==='all'?PRODS.slice(0,2):[PRODS.find(function(p){return p.id===mgState.prodId;})].filter(Boolean);
  var html='';
  var samples=0;
  prodsToShow.forEach(function(p){
    if(!p)return;
    var pkgsToShow=mgState.scope==='all'?[p.pkgs[0]]:p.pkgs.slice(0,3);
    pkgsToShow.forEach(function(pkg){
      if(!pkg)return;
      var basePay=sp(s,p.id,pkg.p);
      var newPrice=mgComputePrice(s,p,pkg);
      var profit=newPrice-basePay;
      html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1a3a1a;font-size:12px;">';
      html+='<span style="color:#ccc;">'+p.name+' — '+pkg.a+'</span>';
      html+='<span style="display:flex;gap:6px;align-items:center;">';
      html+='<span style="color:#888;">משלם ₪'+basePay+'</span>';
      html+='<span style="color:#86efac;">→</span>';
      html+='<span style="color:#39e600;font-weight:700;">₪'+newPrice+'</span>';
      html+='<span style="background:#1a3a1a;color:#86efac;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;">+₪'+profit+'</span>';
      html+='</span></div>';
      samples++;
    });
  });
  if(samples===0){preview.style.display='none';return;}
  list.innerHTML=html;
  preview.style.display='block';
}

async function rsmgApply(){
  await mgApply();
  // רענון התצוגה הנוכחית
  setTimeout(function(){rsmgRenderCurrent();},100);
}

async function rsmgReset(){
  await mgReset();
  setTimeout(function(){rsmgRenderCurrent();},100);
}

function rsmgRenderCurrent(){
  var s=mgGetStore();
  if(!s)return;
  var wrap=document.getElementById('rsmg-current-list');
  if(!wrap)return;
  var html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html+='<thead><tr style="background:#2d3748;color:#aaa;">'+
    '<th style="padding:8px;text-align:right;">מוצר</th>'+
    '<th style="padding:8px;text-align:right;">חבילה</th>'+
    '<th style="padding:8px;text-align:center;">משלם לי</th>'+
    '<th style="padding:8px;text-align:center;">מחיר ללקוח</th>'+
    '<th style="padding:8px;text-align:center;">רווח</th>'+
    '</tr></thead><tbody>';
  PRODS.forEach(function(p){
    p.pkgs.forEach(function(pkg){
      var basePay=sp(s,p.id,pkg.p);
      var customerPrice=getCostPrice(s,p,pkg);
      var profit=customerPrice-basePay;
      var hasOverride=s.costPrices&&s.costPrices[p.id+'_'+pkg.p]!=null;
      html+='<tr style="border-bottom:1px solid #3a4556;">'+
        '<td style="padding:7px;color:#fff;">'+p.name+'</td>'+
        '<td style="padding:7px;color:#aaa;">'+pkg.a+'</td>'+
        '<td style="padding:7px;text-align:center;color:#888;">₪'+basePay+'</td>'+
        '<td style="padding:7px;text-align:center;color:'+(hasOverride?'#86efac':'#aaa')+';font-weight:700;">₪'+customerPrice+(hasOverride?' ✓':'')+'</td>'+
        '<td style="padding:7px;text-align:center;color:'+(profit>0?'#39e600':profit<0?'#e24b4a':'#666')+';font-weight:700;">'+(profit>0?'+':'')+'₪'+profit+'</td>'+
      '</tr>';
    });
  });
  html+='</tbody></table></div>';
  wrap.innerHTML=html;
}

// פתיחת טאב המרווח עם חנות מסוימת מבחירה (מהטבלה)
function rsOpenMarginForStore(storeId){
  var mine=rsGetMyStores().find(function(x){return x.id===storeId;});
  if(!mine){toast('t-reseller','חנות זו אינה שייכת לך');return;}
  mgState.resellerStoreId=storeId;
  // עבור לטאב margin
  var allTabs=document.querySelectorAll('#page-reseller .atab');
  if(allTabs.length>=4){
    allTabs[3].click(); // 0=stores, 1=orders, 2=prices, 3=margin
  }
}

// ============ פעולות על חנות ============
async function rsTopup(storeId){
  var s=stores.find(function(x){return x.id===storeId;});
  if(!s)return;
  // ודא שהחנות אכן שייכת למשווק
  var mine=rsGetMyStores().find(function(x){return x.id===storeId;});
  if(!mine){toast('t-reseller','חנות זו אינה שייכת לך');return;}
  var input=await cpPrompt('יתרה נוכחית: ₪'+(s.credit||0).toLocaleString(),{
    title:'➕ טעינת קרדיט — '+s.name,
    icon:'💰',
    inputType:'number',
    min:1,
    placeholder:'סכום בש"ח'
  });
  if(input===null||input==='')return;
  var amt=parseInt(input);
  if(isNaN(amt)||amt<=0){toast('t-reseller','סכום לא תקין');return;}
  s.credit=Number(s.credit||0)+amt;
  s.maxCredit=Number(s.maxCredit||0)+amt;
  s.unpaidBalance=Number(s.unpaidBalance||0)+amt;
  s.unpaidUpdatedAt=Date.now();
  if(!Array.isArray(s.log))s.log=[];
  s.log.unshift({t:'טעינת קרדיט (משווק)',amt:amt,plus:true,time:now()});
  logAudit('credit-topup','טעינת קרדיט (משווק)',{
    storeId:s.id,storeName:s.name,amount:amt,
    resellerId:currentUser.id,resellerName:currentUser.username
  });
  saveData();
  renderResellerPanel();
  toast('t-reseller','✅ ₪'+amt.toLocaleString()+' נטענו ל-"'+s.name+'"');
}

async function rsRecordPayment(storeId){
  var s=stores.find(function(x){return x.id===storeId;});
  if(!s)return;
  var mine=rsGetMyStores().find(function(x){return x.id===storeId;});
  if(!mine){toast('t-reseller','חנות זו אינה שייכת לך');return;}
  var current=s.unpaidBalance||0;
  if(current<=0){toast('t-reseller','אין חוב פתוח לחנות זו');return;}
  var input=await cpPrompt(
    'חוב פתוח כרגע: ₪'+current.toLocaleString()+'\n\nהקלד סכום או השאר ריק לתשלום מלא:',
    {title:'💰 קבלת תשלום מ-'+s.name,icon:'💰',inputType:'number',min:0,default:current}
  );
  if(input===null)return;
  input=String(input).trim();
  var amt;
  if(input==='')amt=current;
  else amt=parseInt(input);
  if(isNaN(amt)||amt<=0){toast('t-reseller','סכום לא תקין');return;}
  if(amt>current){
    if(!await cpConfirm('הסכום (₪'+amt+') גדול מהחוב (₪'+current+'). היתרה תהיה 0.\nלהמשיך?',{type:'warning'}))return;
    amt=current;
  }
  s.unpaidBalance=current-amt;
  s.unpaidUpdatedAt=Date.now();
  if(!Array.isArray(s.log))s.log=[];
  s.log.unshift({t:'תשלום מהחנות (למשווק)',amt:amt,plus:false,time:now(),isPayment:true});
  logAudit('payment-received','קבלת תשלום מחנות (משווק)',{
    storeId:s.id,storeName:s.name,amount:amt,remaining:s.unpaidBalance,
    resellerId:currentUser.id,resellerName:currentUser.username
  });
  saveData();
  renderResellerPanel();
  toast('t-reseller','✅ ₪'+amt.toLocaleString()+' נרשמו · '+(s.unpaidBalance>0?'נשאר חוב: ₪'+s.unpaidBalance.toLocaleString():'החוב סגור!'));
}

// ניהול חנות — מודאל פשוט
function rsManageStore(storeId){
  var s=stores.find(function(x){return x.id===storeId;});
  if(!s)return;
  var mine=rsGetMyStores().find(function(x){return x.id===storeId;});
  if(!mine){toast('t-reseller','חנות זו אינה שייכת לך');return;}
  var u=users.find(function(x){return x.storeId===s.id;});
  var ci=s.customerInfo||{};
  var totalLoaded=0,totalReduced=0,totalPayments=0;
  if(Array.isArray(s.log)){
    s.log.forEach(function(l){
      if(l.plus&&(l.t||'').indexOf('טעינ')>=0)totalLoaded+=(l.amt||0);
      if(!l.plus&&l.isReduction)totalReduced+=(l.amt||0);
      if(!l.plus&&l.isPayment)totalPayments+=(l.amt||0);
    });
  }
  var orderCount=orders.filter(function(o){return o.storeId===s.id;}).length;
  var html='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">';
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#888;">📥 סה"כ נטען</div><div style="font-size:16px;color:#39e600;font-weight:700;">₪'+totalLoaded.toLocaleString()+'</div></div>';
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#888;">💰 סה"כ שולם</div><div style="font-size:16px;color:#90c490;font-weight:700;">₪'+totalPayments.toLocaleString()+'</div></div>';
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#888;">💳 חוב פתוח</div><div style="font-size:16px;color:'+((s.unpaidBalance||0)>0?'#ef9f27':'#888')+';font-weight:700;">₪'+(s.unpaidBalance||0).toLocaleString()+'</div></div>';
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#888;">📋 הזמנות</div><div style="font-size:16px;color:#7cb3ff;font-weight:700;">'+orderCount+'</div></div>';
  html+='</div>';
  // פרטי קשר
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:12px;margin-bottom:12px;">';
  html+='<div style="font-size:12px;color:#888;margin-bottom:6px;">👤 פרטי לקוח</div>';
  html+='<div style="font-size:13px;color:#ddd;">';
  if(ci.contactName)html+='<div>'+ci.contactName+'</div>';
  if(ci.phone)html+='<div style="color:#7cb3ff;">📞 '+ci.phone+'</div>';
  if(ci.email)html+='<div style="color:#7cb3ff;">📧 '+ci.email+'</div>';
  if(!ci.contactName&&!ci.phone&&!ci.email)html+='<div style="color:#666;">אין פרטים</div>';
  html+='</div></div>';
  // משתמש
  if(u){
    html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:12px;margin-bottom:12px;">';
    html+='<div style="font-size:12px;color:#888;margin-bottom:6px;">🔑 פרטי כניסה</div>';
    html+='<div style="font-size:13px;color:#ddd;">משתמש: <b>'+u.username+'</b></div>';
    html+='<div style="font-size:13px;color:#ddd;">סיסמה: <b style="font-family:monospace;">'+u.password+'</b></div>';
    html+='</div>';
  }
  // היסטוריית פעולות
  if(Array.isArray(s.log)&&s.log.length>0){
    html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:12px;">';
    html+='<div style="font-size:12px;color:#888;margin-bottom:8px;">📜 פעולות אחרונות</div>';
    html+='<div style="max-height:160px;overflow-y:auto;">';
    s.log.slice(0,15).forEach(function(l){
      var clr=l.plus?'#90c490':l.isReduction?'#ef9f27':l.isPayment?'#7cb3ff':'#aaa';
      var sign=l.plus?'+':l.isPayment?'':'';
      html+='<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #3a4556;font-size:12px;">';
      html+='<span style="color:#ddd;">'+(l.t||'')+'</span>';
      html+='<span style="color:'+clr+';font-weight:700;">'+sign+'₪'+(l.amt||0).toLocaleString()+'</span>';
      html+='</div>';
    });
    html+='</div></div>';
  }
  cpAlert(html,{title:'⚙️ ניהול: '+s.name,html:true,icon:'⚙️',okText:'סגור'});
}

// ============ פתיחת חנות חדשה ============
async function rsCreateStore(){
  var name=(document.getElementById('rs-name')||{}).value||'';name=name.trim();
  var username=(document.getElementById('rs-user')||{}).value||'';username=username.trim();
  var password=(document.getElementById('rs-pass')||{}).value||'';
  var cname=((document.getElementById('rs-cname')||{}).value||'').trim();
  var phone=((document.getElementById('rs-phone')||{}).value||'').trim();
  var email=((document.getElementById('rs-email')||{}).value||'').trim();
  var address=((document.getElementById('rs-address')||{}).value||'').trim();
  var city=((document.getElementById('rs-city')||{}).value||'').trim();
  if(!name||!username||!password){
    await cpAlert('יש למלא: שם חנות, שם משתמש וסיסמה',{type:'warning'});
    return;
  }
  if(password.length<4){
    await cpAlert('סיסמה חייבת להיות באורך 4 תווים לפחות',{type:'warning'});
    return;
  }
  if(users.find(function(u){return u.username===username;})){
    await cpAlert('שם המשתמש "'+username+'" כבר תפוס',{type:'error'});
    return;
  }
  var id='s'+Date.now();
  stores.push({
    id:id,name:name,tier:'normal',credit:0,maxCredit:0,unpaidBalance:0,
    customerInfo:{contactName:cname,phone:phone,email:email,address:address,city:city},
    prices:makePrices('normal'),log:[],
    resellerId:currentUser.id  // החנות שייכת למשווק שיצר אותה
  });
  users.push({
    id:'u'+Date.now(),username:username,password:password,
    role:'store',storeId:id,resellerOf:currentUser.id
  });
  logAudit('store-create','יצירת חנות (משווק)',{
    storeId:id,storeName:name,
    resellerId:currentUser.id,resellerName:currentUser.username
  });
  saveData();
  // ניקוי טופס
  ['rs-name','rs-user','rs-pass','rs-cname','rs-phone','rs-email','rs-address','rs-city'].forEach(function(fid){
    var el=document.getElementById(fid);if(el)el.value='';
  });
  await cpAlert('החנות "'+name+'" נפתחה בהצלחה!\nמשתמש: '+username,{type:'success',title:'✅ חנות נפתחה'});
  // חזור לטאב חנויות
  var firstTab=document.querySelectorAll('#page-reseller .atab')[0];
  if(firstTab)firstTab.click();
}

// ============================================================
// ============ 💼 ניהול משווק (פאנל אדמין) ============
// ============================================================
// פותח מודאל המאפשר לאדמין לראות את חנויות המשווק,
// להצמיד אליו חנויות נוספות מהמערכת, ולנתק חנויות.

function openResellerManager(resellerId){
  if(!currentUser||currentUser.role!=='admin'){
    cpAlert('רק אדמין יכול לנהל משווקים',{type:'error',title:'גישה חסומה'});
    return;
  }
  var reseller=users.find(function(u){return u.id===resellerId;});
  if(!reseller||reseller.role!=='reseller'){
    cpAlert('משווק לא נמצא',{type:'error'});
    return;
  }

  // חנויות שהמשווק פתח (דרך resellerOf במשתמש שלהן)
  var openedStores=stores.filter(function(s){
    var u=users.find(function(x){return x.storeId===s.id;});
    return u&&u.resellerOf===resellerId;
  });
  // חנויות שמוצמדות אליו ידנית (דרך s.resellerId) - בלי כפילויות עם הקודמות
  var attachedStores=stores.filter(function(s){
    if(s.resellerId!==resellerId)return false;
    return !openedStores.find(function(o){return o.id===s.id;});
  });
  var allMyStores=openedStores.concat(attachedStores);

  // חנויות זמינות להצמדה (לא של משווק אחר ולא שלי)
  var availableStores=stores.filter(function(s){
    if(allMyStores.find(function(m){return m.id===s.id;}))return false;
    if(s.resellerId&&s.resellerId!==resellerId)return false;
    var u=users.find(function(x){return x.storeId===s.id;});
    if(u&&u.resellerOf&&u.resellerOf!==resellerId)return false;
    return true;
  });

  // חישוב סטטיסטיקות
  var totalCredit=allMyStores.reduce(function(t,s){return t+(s.credit||0);},0);
  var totalUnpaid=allMyStores.reduce(function(t,s){return t+(s.unpaidBalance||0);},0);
  var totalOrders=orders.filter(function(o){return allMyStores.find(function(s){return s.id===o.storeId;});}).length;

  // בנייה של ה-HTML
  var ci=reseller.customerInfo||{};
  var html='';
  // פרטי משווק
  html+='<div style="background:linear-gradient(135deg,#3a1a5f,#2d1245);border:1px solid #5a2a8f;border-radius:10px;padding:14px;margin-bottom:14px;">';
  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
  html+='<div style="font-size:24px;">💼</div>';
  html+='<div style="flex:1;">';
  html+='<div style="font-weight:700;color:#fff;font-size:15px;">'+reseller.username+'</div>';
  if(ci.contactName)html+='<div style="font-size:12px;color:#c490ff;">'+ci.contactName+'</div>';
  html+='</div></div>';
  if(ci.phone||ci.email){
    html+='<div style="font-size:12px;color:#c490ff;">';
    if(ci.phone)html+='📞 '+ci.phone+'  ';
    if(ci.email)html+='📧 '+ci.email;
    html+='</div>';
  }
  html+='</div>';

  // KPIs
  html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:#888;">חנויות</div><div style="font-size:18px;color:#fff;font-weight:700;">'+allMyStores.length+'</div></div>';
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:#888;">קרדיט כולל</div><div style="font-size:18px;color:#39e600;font-weight:700;">₪'+totalCredit.toLocaleString()+'</div></div>';
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:#888;">חוב פתוח</div><div style="font-size:18px;color:'+(totalUnpaid>0?'#ef9f27':'#666')+';font-weight:700;">₪'+totalUnpaid.toLocaleString()+'</div></div>';
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:#888;">הזמנות</div><div style="font-size:18px;color:#7cb3ff;font-weight:700;">'+totalOrders+'</div></div>';
  html+='</div>';

  // חנויות שלו
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:10px;padding:12px;margin-bottom:12px;">';
  html+='<div style="font-size:13px;color:#aaa;margin-bottom:8px;font-weight:700;">🏪 חנויות של המשווק ('+allMyStores.length+')</div>';
  if(allMyStores.length===0){
    html+='<div style="color:#666;text-align:center;padding:14px;font-size:12px;">אין חנויות עדיין</div>';
  }else{
    html+='<div style="max-height:200px;overflow-y:auto;">';
    allMyStores.forEach(function(s){
      var isOpened=openedStores.find(function(o){return o.id===s.id;});
      var typeBadge=isOpened
        ?'<span style="background:#1a3a1a;color:#90c490;padding:2px 6px;border-radius:6px;font-size:9px;">פתח</span>'
        :'<span style="background:#3a1a5f;color:#c490ff;padding:2px 6px;border-radius:6px;font-size:9px;">מוצמד</span>';
      html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid #3a4556;">';
      html+='<div style="flex:1;"><div style="color:#fff;font-size:13px;font-weight:600;">'+s.name+' '+typeBadge+'</div>';
      html+='<div style="color:#888;font-size:11px;">יתרה: ₪'+(s.credit||0).toLocaleString()+(s.unpaidBalance>0?' · חוב: ₪'+s.unpaidBalance.toLocaleString():'')+'</div></div>';
      // כפתור ניתוק רק למוצמדות (לא לפתוחות)
      if(!isOpened){
        html+='<button onclick="rmDetachStore(\''+s.id+'\',\''+resellerId+'\')" style="background:#3a0a0a;color:#ff7070;border:1px solid #5a1010;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">🔓 נתק</button>';
      }
      html+='</div>';
    });
    html+='</div>';
  }
  html+='</div>';

  // הצמדת חנות
  html+='<div style="background:#2d3748;border:1px solid #5a6478;border-radius:10px;padding:12px;">';
  html+='<div style="font-size:13px;color:#aaa;margin-bottom:8px;font-weight:700;">🔗 הצמד חנות קיימת למשווק זה</div>';
  if(availableStores.length===0){
    html+='<div style="color:#666;text-align:center;padding:14px;font-size:12px;">אין חנויות פנויות להצמדה</div>';
  }else{
    html+='<div style="display:flex;gap:6px;align-items:center;">';
    html+='<select id="rm-attach-select" style="flex:1;background:#1a2030;color:#fff;border:1px solid #5a6478;border-radius:8px;padding:8px;font-size:13px;">';
    html+='<option value="">בחר חנות להצמדה...</option>';
    availableStores.forEach(function(s){
      html+='<option value="'+s.id+'">'+s.name+'</option>';
    });
    html+='</select>';
    html+='<button onclick="rmAttachStore(\''+resellerId+'\')" style="background:linear-gradient(135deg,#39e600,#2ab800);color:#000;border:none;border-radius:8px;padding:9px 14px;font-size:12px;font-weight:700;cursor:pointer;">🔗 הצמד</button>';
    html+='</div>';
    html+='<div style="font-size:11px;color:#888;margin-top:6px;">חנות מוצמדת תופיע אצל המשווק עם תג "מוצמד" וניתן לנתק אותה בכל עת.</div>';
  }
  html+='</div>';

  cpAlert(html,{title:'💼 ניהול משווק',html:true,icon:'💼',okText:'סגור'});
}

function rmAttachStore(resellerId){
  var sel=document.getElementById('rm-attach-select');
  if(!sel||!sel.value){toast('t-users','בחר חנות');return;}
  var storeId=sel.value;
  var store=stores.find(function(s){return s.id===storeId;});
  var reseller=users.find(function(u){return u.id===resellerId;});
  if(!store||!reseller)return;
  store.resellerId=resellerId;
  logAudit('reseller-attach','הצמדת חנות למשווק',{
    storeId:storeId,storeName:store.name,
    resellerId:resellerId,resellerName:reseller.username
  });
  saveData();
  toast('t-users','✅ "'+store.name+'" הוצמדה ל-'+reseller.username);
  // סגור את המודאל הנוכחי ופתח מחדש כדי לרענן
  var existing=document.querySelector('.cpd-overlay');
  if(existing)existing.remove();
  setTimeout(function(){openResellerManager(resellerId);},100);
}

async function rmDetachStore(storeId,resellerId){
  var store=stores.find(function(s){return s.id===storeId;});
  if(!store)return;
  if(!await cpConfirm('לנתק את "'+store.name+'" מהמשווק?\nהחנות תישאר במערכת אך לא תופיע יותר אצל המשווק.',{type:'warning',title:'ניתוק חנות',okText:'נתק'}))return;
  delete store.resellerId;
  logAudit('reseller-detach','ניתוק חנות ממשווק',{
    storeId:storeId,storeName:store.name,resellerId:resellerId
  });
  saveData();
  toast('t-users','🔓 "'+store.name+'" נותקה');
  // רענון המודאל
  var existing=document.querySelector('.cpd-overlay');
  if(existing)existing.remove();
  setTimeout(function(){openResellerManager(resellerId);},100);
}

// ============================================================
// ============ 🎴 כרטיס לקוח מאוחד (Customer Card) ============
// ============================================================
// מודאל אחד שמרכז את כל המידע על חנות:
// פרטים, KPIs, timeline פעולות, הזמנות, רווחים.
// פתוח לאדמין ולמשווק (כל אחד רואה רק את החנויות שלו).

// בונה timeline אחיד מכל המקורות (log, orders, loads)
function buildStoreTimeline(store){
  var events=[];
  // א. פעולות מתוך store.log (טעינות, תשלומים, הפחתות, הקפאות)
  if(Array.isArray(store.log)){
    store.log.forEach(function(l){
      events.push({
        time:l.time||0,
        type:l.isPayment?'payment':l.isReduction?'reduction':l.plus?'topup':'debit',
        title:l.t||'פעולה',
        amount:l.amt||0,
        plus:!!l.plus,
        source:'log'
      });
    });
  }
  // ב. הזמנות מהחנות
  if(Array.isArray(orders)){
    orders.filter(function(o){return o.storeId===store.id;}).forEach(function(o){
      events.push({
        time:o.id||0,
        type:'order',
        title:(o.prod||'הזמנה')+(o.pkg?' — '+o.pkg:''),
        subtitle:o.user?'שחקן: '+o.user:'',
        amount:o.price||0,
        plus:false,
        status:o.status,
        source:'order',
        orderId:o.id
      });
    });
  }
  // ג. טעינות (loads) — רק טעינות אמיתיות שמשפיעות על קרדיט
  if(Array.isArray(loads)){
    loads.filter(function(l){return l.storeId===store.id;}).forEach(function(l){
      events.push({
        time:l.timestamp||l.time||0,
        type:l.mode==='refund'?'refund':'load',
        title:(l.mode==='refund'?'ביטול: ':'טעינה: ')+(l.playerName||l.type||''),
        subtitle:l.playerId?'מזהה: '+l.playerId:'',
        amount:Math.abs(Number(l.storeCost||0)),
        plus:l.mode==='refund',
        source:'load'
      });
    });
  }
  // מיון לפי זמן יורד
  events.sort(function(a,b){return (b.time||0)-(a.time||0);});
  return events;
}

// חישוב סטטיסטיקות מצרפיות לחנות
function calcStoreStats(store){
  var totalLoaded=0,totalReduced=0,totalPayments=0,totalOrders=0,ordersValue=0;
  if(Array.isArray(store.log)){
    store.log.forEach(function(l){
      if(l.plus&&(l.t||'').indexOf('טעינ')>=0)totalLoaded+=(l.amt||0);
      if(!l.plus&&l.isReduction)totalReduced+=(l.amt||0);
      if(!l.plus&&l.isPayment)totalPayments+=(l.amt||0);
    });
  }
  var storeOrders=orders.filter(function(o){return o.storeId===store.id;});
  totalOrders=storeOrders.length;
  ordersValue=storeOrders.reduce(function(t,o){return t+(o.price||0);},0);

  // רווח מהזמנות (מחיר חנות - מחיר בסיס לכל פריט)
  var profit=0;
  storeOrders.forEach(function(o){
    if(!o.basePrice)return; // אם אין מחיר בסיס שמור, נדלג
    profit+=Math.max(0,(o.price||0)-(o.basePrice||0));
  });

  return {
    totalLoaded:totalLoaded,
    totalReduced:totalReduced,
    totalPayments:totalPayments,
    totalOrders:totalOrders,
    ordersValue:ordersValue,
    profit:profit,
    currentBalance:store.credit||0,
    unpaid:store.unpaidBalance||0
  };
}

// בודק האם המשתמש הנוכחי רשאי לראות את החנות
function canViewStore(store){
  if(!currentUser)return false;
  if(currentUser.role==='admin')return true;
  if(currentUser.role==='reseller'){
    if(store.resellerId===currentUser.id)return true;
    var u=users.find(function(x){return x.storeId===store.id;});
    return u&&u.resellerOf===currentUser.id;
  }
  if(currentUser.role==='store')return store.id===currentUser.storeId;
  return false;
}

// פתיחת כרטיס לקוח (מודאל מלא)
function openCustomerCard(storeId){
  var s=stores.find(function(x){return x.id===storeId;});
  if(!s){cpAlert('חנות לא נמצאה',{type:'error'});return;}
  if(!canViewStore(s)){cpAlert('אין לך הרשאה לראות חנות זו',{type:'error',title:'גישה חסומה'});return;}

  var ci=s.customerInfo||{};
  var stats=calcStoreStats(s);
  var timeline=buildStoreTimeline(s);
  var u=users.find(function(x){return x.storeId===s.id;});

  // טירים ובעלות
  var tierLabel=(TIERS[s.tier]||{l:s.tier||''}).l;
  var ownership='';
  if(s.resellerId){
    var resellerUser=users.find(function(x){return x.id===s.resellerId;});
    if(resellerUser)ownership='💼 משווק: '+(resellerUser.username||'');
  }else if(u&&u.resellerOf){
    var openerUser=users.find(function(x){return x.id===u.resellerOf;});
    if(openerUser)ownership='💼 נפתח ע"י: '+(openerUser.username||'');
  }

  var html='';

  // ===== Header עם פרטי לקוח =====
  html+='<div style="background:linear-gradient(135deg,#1f2937,#283447);border:1px solid #475467;border-radius:12px;padding:14px;margin-bottom:14px;">';
  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">';
  html+='<div style="font-size:30px;">🏪</div>';
  html+='<div style="flex:1;">';
  html+='<div style="font-weight:800;color:#fff;font-size:17px;">'+s.name+'</div>';
  if(tierLabel)html+='<div style="font-size:11px;color:#7cb3ff;">📊 רמת מחיר: '+tierLabel+'</div>';
  if(ownership)html+='<div style="font-size:11px;color:#c490ff;margin-top:2px;">'+ownership+'</div>';
  html+='</div>';
  if(s.frozen){
    html+='<span style="background:#0a1a2a;color:#7cb3ff;padding:4px 10px;border-radius:10px;font-size:11px;font-weight:700;">🧊 קפוא</span>';
  }
  html+='</div>';
  // פרטי קשר
  var contactParts=[];
  if(ci.contactName)contactParts.push('👤 '+ci.contactName);
  if(ci.phone)contactParts.push('📞 <a href="tel:'+ci.phone+'" style="color:#7cb3ff;text-decoration:none;">'+ci.phone+'</a>');
  if(ci.email)contactParts.push('📧 <a href="mailto:'+ci.email+'" style="color:#7cb3ff;text-decoration:none;">'+ci.email+'</a>');
  if(ci.city||ci.address){
    var loc='';
    if(ci.address)loc=ci.address;
    if(ci.city)loc+=(loc?', ':'')+ci.city;
    contactParts.push('📍 '+loc);
  }
  if(contactParts.length){
    html+='<div style="font-size:12px;color:#ccc;line-height:1.8;">'+contactParts.join(' &nbsp;·&nbsp; ')+'</div>';
  }
  html+='</div>';

  // ===== KPIs =====
  html+='<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;">';
  var kpis=[
    {label:'יתרה נוכחית',value:'₪'+stats.currentBalance.toLocaleString(),color:stats.currentBalance<0?'#e24b4a':'#39e600',icon:'💰'},
    {label:'חוב פתוח',value:'₪'+stats.unpaid.toLocaleString(),color:stats.unpaid>0?'#ef9f27':'#666',icon:'💳'},
    {label:'סה״כ הזמנות',value:stats.totalOrders.toLocaleString(),color:'#7cb3ff',icon:'📋'},
    {label:'מחזור הזמנות',value:'₪'+stats.ordersValue.toLocaleString(),color:'#c490ff',icon:'📊'},
    {label:'סה״כ נטען',value:'₪'+stats.totalLoaded.toLocaleString(),color:'#39e600',icon:'📥'},
    {label:'סה״כ שולם',value:'₪'+stats.totalPayments.toLocaleString(),color:'#90c490',icon:'✅'}
  ];
  kpis.forEach(function(k){
    html+='<div style="background:#2d3748;border:1px solid #475467;border-radius:10px;padding:10px;">';
    html+='<div style="font-size:10.5px;color:#888;">'+k.icon+' '+k.label+'</div>';
    html+='<div style="font-size:16px;color:'+k.color+';font-weight:700;margin-top:2px;">'+k.value+'</div>';
    html+='</div>';
  });
  html+='</div>';

  // ===== הצגת רווח מהחנות (רק אם משווק/אדמין) =====
  if(currentUser.role!=='store'&&stats.profit>0){
    html+='<div style="background:linear-gradient(135deg,#1a3a1a,#0f2a0f);border:1px solid #2a5a2a;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">';
    html+='<div style="font-size:24px;">💎</div>';
    html+='<div style="flex:1;">';
    html+='<div style="font-size:11px;color:#90c490;">רווח כולל מחנות זו</div>';
    html+='<div style="font-size:18px;color:#39e600;font-weight:800;">₪'+stats.profit.toLocaleString()+'</div>';
    html+='</div></div>';
  }

  // ===== פרטי משתמש =====
  if(u){
    html+='<div style="background:#2d3748;border:1px solid #475467;border-radius:10px;padding:12px;margin-bottom:14px;">';
    html+='<div style="font-size:11px;color:#888;margin-bottom:6px;">🔑 פרטי כניסה</div>';
    html+='<div style="font-size:13px;color:#ddd;">משתמש: <b style="color:#fff;">'+(u.username||'')+'</b></div>';
    if(currentUser.role==='admin'||currentUser.role==='reseller'){
      html+='<div style="font-size:13px;color:#ddd;">סיסמה: <b style="font-family:monospace;color:#fff;">'+(u.password||'')+'</b></div>';
    }
    html+='</div>';
  }

  // ===== Timeline =====
  if(timeline.length>0){
    html+='<div style="background:#2d3748;border:1px solid #475467;border-radius:10px;padding:12px;">';
    html+='<div style="font-size:12px;color:#888;margin-bottom:10px;font-weight:700;">📜 היסטוריית פעולות ('+timeline.length+')</div>';
    html+='<div style="max-height:280px;overflow-y:auto;padding-left:4px;">';
    timeline.slice(0,80).forEach(function(ev){
      var iconMap={topup:'➕',debit:'➖',payment:'💰',reduction:'🔻',order:'🎮',load:'📥',refund:'↩️'};
      var clr=ev.plus?'#39e600':ev.type==='order'?'#7cb3ff':ev.type==='reduction'?'#ef9f27':ev.type==='payment'?'#90c490':'#e88'; 
      var sign=ev.plus?'+':'';
      var statusBadge='';
      if(ev.type==='order'){
        var statusClr=ev.status==='done'?'#39e600':ev.status==='new'?'#ef9f27':'#888';
        var statusTxt=ev.status==='done'?'בוצע':ev.status==='new'?'ממתין':(ev.status||'');
        statusBadge=' <span style="background:#1a2030;color:'+statusClr+';padding:1px 6px;border-radius:6px;font-size:9px;">'+statusTxt+'</span>';
      }
      var dateStr='';
      if(ev.time){
        var d=new Date(ev.time);
        if(!isNaN(d.getTime()))dateStr=d.toLocaleDateString('he-IL')+' '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
      }
      html+='<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #3a4556;">';
      html+='<div style="font-size:16px;flex-shrink:0;">'+(iconMap[ev.type]||'•')+'</div>';
      html+='<div style="flex:1;min-width:0;">';
      html+='<div style="color:#fff;font-size:12.5px;font-weight:600;">'+ev.title+statusBadge+'</div>';
      if(ev.subtitle)html+='<div style="color:#aaa;font-size:11px;margin-top:1px;">'+ev.subtitle+'</div>';
      if(dateStr)html+='<div style="color:#666;font-size:10px;margin-top:1px;">'+dateStr+'</div>';
      html+='</div>';
      if(ev.amount>0){
        html+='<div style="color:'+clr+';font-weight:700;font-size:13px;flex-shrink:0;">'+sign+'₪'+ev.amount.toLocaleString()+'</div>';
      }
      html+='</div>';
    });
    if(timeline.length>80)html+='<div style="text-align:center;color:#666;font-size:11px;padding:8px;">מוצגות 80 הפעולות האחרונות מתוך '+timeline.length+'</div>';
    html+='</div></div>';
  }else{
    html+='<div style="background:#2d3748;border:1px solid #475467;border-radius:10px;padding:20px;text-align:center;color:#666;font-size:13px;">אין פעולות עדיין</div>';
  }

  cpAlert(html,{title:'🎴 כרטיס לקוח: '+s.name,html:true,icon:'🎴',okText:'סגור'});
}

// ============================================================
// ============ 💎 דוח רווחים למשווק ============
// ============================================================
function rsRenderProfitReport(){
  if(!currentUser||currentUser.role!=='reseller')return '';
  var myStores=rsGetMyStores();
  if(myStores.length===0)return '';
  // חישוב רווח לכל חנות
  var totalProfit=0,totalOrders=0,totalRevenue=0;
  var perStore=myStores.map(function(s){
    var stats=calcStoreStats(s);
    totalProfit+=stats.profit;
    totalOrders+=stats.totalOrders;
    totalRevenue+=stats.ordersValue;
    return {store:s,stats:stats};
  });
  // מיין לפי רווח יורד
  perStore.sort(function(a,b){return b.stats.profit-a.stats.profit;});

  var html='<div class="card">';
  html+='<div class="card-title">💎 דוח רווחים</div>';
  // KPIs כוללים
  html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">';
  html+='<div style="background:linear-gradient(135deg,#1a3a1a,#0f2a0f);border:1px solid #2a5a2a;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:11px;color:#90c490;">💎 רווח כולל</div><div style="font-size:20px;color:#39e600;font-weight:800;margin-top:2px;">₪'+totalProfit.toLocaleString()+'</div></div>';
  html+='<div style="background:#2d3748;border:1px solid #475467;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:11px;color:#888;">📊 מחזור</div><div style="font-size:20px;color:#7cb3ff;font-weight:700;margin-top:2px;">₪'+totalRevenue.toLocaleString()+'</div></div>';
  html+='<div style="background:#2d3748;border:1px solid #475467;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:11px;color:#888;">📋 הזמנות</div><div style="font-size:20px;color:#c490ff;font-weight:700;margin-top:2px;">'+totalOrders.toLocaleString()+'</div></div>';
  html+='</div>';

  // טבלת רווח לכל חנות
  html+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">';
  html+='<thead><tr style="background:#2d3748;color:#aaa;">'+
    '<th style="padding:9px;text-align:right;">חנות</th>'+
    '<th style="padding:9px;text-align:center;">הזמנות</th>'+
    '<th style="padding:9px;text-align:center;">מחזור</th>'+
    '<th style="padding:9px;text-align:center;">רווח</th>'+
    '<th style="padding:9px;text-align:center;">% רווח</th>'+
    '</tr></thead><tbody>';
  perStore.forEach(function(item){
    var s=item.store,st=item.stats;
    var pct=st.ordersValue>0?Math.round(st.profit/st.ordersValue*100):0;
    html+='<tr style="border-bottom:1px solid #3a4556;cursor:pointer;" onclick="openCustomerCard(\''+s.id+'\')" onmouseover="this.style.background=\'#3a4556\'" onmouseout="this.style.background=\'\'">'+
      '<td style="padding:8px;color:#fff;font-weight:600;">'+s.name+'</td>'+
      '<td style="padding:8px;text-align:center;color:#ccc;">'+st.totalOrders+'</td>'+
      '<td style="padding:8px;text-align:center;color:#7cb3ff;">₪'+st.ordersValue.toLocaleString()+'</td>'+
      '<td style="padding:8px;text-align:center;color:#39e600;font-weight:700;">₪'+st.profit.toLocaleString()+'</td>'+
      '<td style="padding:8px;text-align:center;color:'+(pct>=15?'#39e600':pct>=5?'#ef9f27':'#888')+';">'+pct+'%</td>'+
    '</tr>';
  });
  html+='</tbody></table></div>';
  if(totalOrders===0||totalProfit===0){
    html+='<div style="margin-top:14px;padding:10px;background:#2d3748;border-radius:8px;font-size:11px;color:#888;text-align:center;">'+
      '💡 רווח מחושב כהפרש בין מחיר החנות (שאתה גובה) למחיר הבסיס (שאתה משלם). הוא יתחיל להופיע אחרי שיהיו הזמנות.</div>';
  }
  html+='</div>';
  return html;
}

// ============================================================
// ============ 🔍 חיפוש גלובלי (Cmd/Ctrl+K) ============
// ============================================================
// פתיחה: Cmd/Ctrl+K, או הקלקה על כפתור חיפוש בנאב
// מחפש: חנויות, משתמשים, הזמנות, מוצרים
// תוצאות: חנויות → openCustomerCard, מוצרים → ניווט לעמוד חנות

function openGlobalSearch(){
  if(!currentUser){cpAlert('יש להתחבר תחילה',{type:'warning'});return;}
  // אם כבר פתוח - סגור
  var existing=document.getElementById('cp-global-search');
  if(existing){existing.remove();return;}

  var overlay=document.createElement('div');
  overlay.id='cp-global-search';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(10,15,25,0.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:10500;display:flex;align-items:flex-start;justify-content:center;padding:60px 16px 16px;animation:cpdFadeIn .15s ease;';

  var box=document.createElement('div');
  box.style.cssText='width:100%;max-width:560px;background:#3a4556;border:1px solid #5a6478;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;direction:rtl;animation:cpdSlideIn .2s ease;';
  overlay.appendChild(box);

  // input
  var inputWrap=document.createElement('div');
  inputWrap.style.cssText='padding:14px 16px;border-bottom:1px solid #475467;display:flex;align-items:center;gap:10px;';
  inputWrap.innerHTML='<div style="font-size:20px;">🔍</div>';
  var input=document.createElement('input');
  input.type='text';
  input.placeholder='חיפוש חנות, משתמש, הזמנה, מוצר...';
  input.style.cssText='flex:1;background:none;border:none;color:#fff;font-size:15px;font-family:inherit;outline:none;text-align:right;';
  inputWrap.appendChild(input);
  var hint=document.createElement('div');
  hint.style.cssText='font-size:10px;color:#666;background:#2d3748;padding:3px 8px;border-radius:6px;border:1px solid #475467;';
  hint.textContent='Esc';
  inputWrap.appendChild(hint);
  box.appendChild(inputWrap);

  // results
  var resultsWrap=document.createElement('div');
  resultsWrap.style.cssText='max-height:60vh;overflow-y:auto;padding:6px;';
  box.appendChild(resultsWrap);

  function close(){
    overlay.style.animation='cpdFadeOut .12s ease forwards';
    setTimeout(function(){try{overlay.remove();}catch(e){}},120);
  }

  // איסוף תוצאות
  function search(query){
    query=(query||'').trim().toLowerCase();
    var results=[];
    if(query.length===0){
      // הצג קיצורי דרך
      results.push({type:'shortcut',label:'🏪 כל החנויות',action:'all-stores'});
      if(currentUser.role==='admin'){
        results.push({type:'shortcut',label:'👥 כל המשתמשים',action:'all-users'});
        results.push({type:'shortcut',label:'📋 כל ההזמנות',action:'all-orders'});
      }
      results.push({type:'shortcut',label:'❓ עזרה: השתמש ב-Cmd/Ctrl+K',action:'help'});
      return results;
    }

    // חנויות
    stores.forEach(function(s){
      if(!canViewStore(s))return;
      var ci=s.customerInfo||{};
      var hay=(s.name+' '+(ci.contactName||'')+' '+(ci.phone||'')+' '+(ci.email||'')+' '+(ci.city||'')).toLowerCase();
      if(hay.indexOf(query)>=0){
        var sub=[];
        if(ci.contactName)sub.push(ci.contactName);
        if(ci.phone)sub.push(ci.phone);
        if(ci.city)sub.push(ci.city);
        results.push({
          type:'store',icon:'🏪',
          title:s.name,
          subtitle:sub.length?sub.join(' · '):'יתרה: ₪'+(s.credit||0).toLocaleString(),
          action:'store',
          storeId:s.id
        });
      }
    });

    // משתמשים (רק לאדמין)
    if(currentUser.role==='admin'){
      users.forEach(function(u){
        var ci=u.customerInfo||{};
        var hay=((u.username||'')+' '+(ci.contactName||'')+' '+(ci.phone||'')+' '+(ci.email||'')).toLowerCase();
        if(hay.indexOf(query)>=0){
          var roleIcon=u.role==='admin'?'👑':u.role==='reseller'?'💼':'👤';
          results.push({
            type:'user',icon:roleIcon,
            title:u.username,
            subtitle:(u.role==='admin'?'אדמין':u.role==='reseller'?'משווק':'חנות')+(ci.contactName?' · '+ci.contactName:''),
            action:'user',
            userId:u.id,
            storeId:u.storeId
          });
        }
      });
    }

    // הזמנות (לפי שם שחקן או מזהה)
    orders.forEach(function(o){
      if(!o.storeId)return;
      var s=stores.find(function(x){return x.id===o.storeId;});
      if(s&&!canViewStore(s))return;
      var hay=((o.user||'')+' '+(o.prod||'')+' '+(o.pkg||'')+' '+(o.storeName||'')).toLowerCase();
      if(hay.indexOf(query)>=0){
        results.push({
          type:'order',icon:'📋',
          title:(o.prod||'הזמנה')+' — '+(o.user||''),
          subtitle:(o.storeName||'')+' · ₪'+(o.price||0).toLocaleString()+' · '+(o.status==='done'?'✓ בוצע':o.status==='new'?'⏱ ממתין':o.status||''),
          action:'order',
          orderId:o.id,
          storeId:o.storeId
        });
      }
    });

    // מוצרים
    if(typeof PRODS!=='undefined'){
      PRODS.forEach(function(p){
        if((p.name||'').toLowerCase().indexOf(query)>=0){
          results.push({
            type:'product',icon:'🎮',
            title:p.name,
            subtitle:p.pkgs.length+' חבילות זמינות',
            action:'product',
            productId:p.id
          });
        }
      });
    }

    return results.slice(0,30);
  }

  function renderResults(query){
    var results=search(query);
    if(results.length===0){
      resultsWrap.innerHTML='<div style="text-align:center;padding:30px 20px;color:#888;font-size:13px;">לא נמצאו תוצאות עבור "'+query+'"</div>';
      return;
    }
    var html='';
    var lastType='';
    results.forEach(function(r,i){
      // הפרדה לפי סוג
      if(r.type!==lastType&&query.length>0){
        var sectionLabel={store:'חנויות',user:'משתמשים',order:'הזמנות',product:'מוצרים',shortcut:'קיצורי דרך'}[r.type]||r.type;
        html+='<div style="font-size:10px;color:#888;font-weight:700;padding:8px 10px 4px;text-transform:uppercase;letter-spacing:0.5px;">'+sectionLabel+'</div>';
        lastType=r.type;
      }
      html+='<div class="cpgs-result" data-idx="'+i+'" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;cursor:pointer;transition:background .1s;">';
      html+='<div style="font-size:20px;flex-shrink:0;">'+(r.icon||'•')+'</div>';
      html+='<div style="flex:1;min-width:0;">';
      html+='<div style="color:#fff;font-size:13.5px;font-weight:600;">'+(r.title||r.label||'')+'</div>';
      if(r.subtitle)html+='<div style="color:#aaa;font-size:11px;margin-top:1px;">'+r.subtitle+'</div>';
      html+='</div></div>';
    });
    resultsWrap.innerHTML=html;
    // אירועי לחיצה
    resultsWrap.querySelectorAll('.cpgs-result').forEach(function(el){
      el.addEventListener('mouseenter',function(){this.style.background='#475467';});
      el.addEventListener('mouseleave',function(){this.style.background='';});
      el.addEventListener('click',function(){
        var idx=parseInt(this.dataset.idx);
        var r=results[idx];
        close();
        setTimeout(function(){
          if(r.type==='store'||(r.type==='user'&&r.storeId)){
            openCustomerCard(r.storeId);
          }else if(r.type==='order'&&r.storeId){
            openCustomerCard(r.storeId);
          }else if(r.type==='product'){
            // נווט לעמוד חנות (רלוונטי גם לחנות וגם לאדמין)
            showPage('page-store');
            if(typeof renderStoreFront==='function')try{renderStoreFront();}catch(e){}
          }else if(r.action==='all-stores'){
            if(currentUser.role==='admin'){showPage('page-users');setTimeout(function(){if(typeof renderUsersTable==='function')renderUsersTable();},50);}
            else if(currentUser.role==='reseller'){showPage('page-reseller');renderResellerPanel();}
          }else if(r.action==='all-users'&&currentUser.role==='admin'){
            showPage('page-users');setTimeout(function(){if(typeof renderUsersTable==='function')renderUsersTable();},50);
          }else if(r.action==='all-orders'&&currentUser.role==='admin'){
            showPage('page-admin');
            // עבור לטאב הזמנות אם קיים
            var ordersTab=document.querySelector('[onclick*="sec-orders"]');
            if(ordersTab)ordersTab.click();
          }
        },100);
      });
    });
  }

  // מאזין לקלט
  input.addEventListener('input',function(){renderResults(this.value);});
  // Esc לסגירה
  overlay.addEventListener('keydown',function(e){
    if(e.key==='Escape'){e.stopPropagation();close();}
    if(e.key==='Enter'){
      var first=resultsWrap.querySelector('.cpgs-result');
      if(first)first.click();
    }
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay)close();});

  document.body.appendChild(overlay);
  setTimeout(function(){input.focus();renderResults('');},50);
}

// קיצור מקלדת גלובלי - Cmd/Ctrl+K
document.addEventListener('keydown',function(e){
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){
    e.preventDefault();
    if(currentUser)openGlobalSearch();
  }
});

// ============================================================
// ============ 🔔 מערכת התראות (notifySystem) ============
// ============================================================
// API:
//   notify.send(eventType, data) - שולח התראה
//   notify.markRead(notifId) - סימון כנקרא
//   notify.markAllRead() - סימון הכל כנקרא
//   notify.clear() - מחיקת כולן
//   notify.getUnreadCount() - מספר ההתראות שלא נקראו
//
// אירועים נתמכים:
//   'order:new' - הזמנה חדשה (לאדמין/משווק)
//   'order:status' - שינוי סטטוס (לחנות)
//   'credit:topup' - טעינת קרדיט (לחנות)
//   'credit:low' - יתרה נמוכה (לחנות + אדמין)
//   'credit:debt' - חנות בחוב (לחנות)
//   'payment:received' - תשלום התקבל (לאדמין/משווק)
//   'unpaid:reminder' - תזכורת חוב פתוח (לחנות)
// ============================================================

window.notify=(function(){
  // === קבועים ===
  var EVENTS={
    'order:new':{icon:'🎮',type:'order',title:'הזמנה חדשה',sound:'order'},
    'order:status':{icon:'✓',type:'success',title:'עדכון הזמנה',sound:'success'},
    'credit:topup':{icon:'💰',type:'success',title:'קרדיט נטען',sound:'success'},
    'credit:low':{icon:'⚠️',type:'warning',title:'יתרה נמוכה',sound:'warning'},
    'credit:debt':{icon:'❗',type:'error',title:'חוב פתוח',sound:'warning'},
    'payment:received':{icon:'💵',type:'success',title:'תשלום התקבל',sound:'success'},
    'unpaid:reminder':{icon:'📅',type:'warning',title:'תזכורת תשלום',sound:'warning'}
  };
  var STORAGE_KEY='cp_notifications';
  var SETTINGS_KEY='cp_notif_settings';
  var MAX_STORED=50;

  // === מצב פנימי ===
  var notifications=[];
  var settings={
    enabled:true,
    sound:true,
    desktop:false, // רמה 2 - יוטעלל בעתיד
    eventToggles:{} // {eventType: true/false}
  };

  // === אתחול ===
  function init(){
    try{
      var saved=localStorage.getItem(STORAGE_KEY);
      if(saved)notifications=JSON.parse(saved)||[];
      var savedSettings=localStorage.getItem(SETTINGS_KEY);
      if(savedSettings){
        var s=JSON.parse(savedSettings);
        Object.assign(settings,s||{});
      }
    }catch(e){console.warn('notify: failed to load',e);}
    updateBadge();
  }

  function save(){
    try{
      // שמור רק את ה-MAX_STORED האחרונות
      var toSave=notifications.slice(0,MAX_STORED);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(toSave));
    }catch(e){console.warn('notify: failed to save',e);}
  }

  function saveSettings(){
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch(e){}
  }

  // === Web Audio - צליל סינתטי בלי צורך בקובץ ===
  var audioCtx=null;
  function ensureAudio(){
    if(audioCtx)return audioCtx;
    try{
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    }catch(e){return null;}
    return audioCtx;
  }
  function playSound(kind){
    if(!settings.sound)return;
    var ctx=ensureAudio();
    if(!ctx)return;
    // יצירת צליל קצר - תלוי בסוג
    var freqs;
    if(kind==='order'){freqs=[523,659,784];} // אקורד C major
    else if(kind==='success'){freqs=[659,784];} // E + G
    else if(kind==='warning'){freqs=[440,330];} // A → E (יורד)
    else freqs=[440];
    try{
      freqs.forEach(function(f,i){
        var osc=ctx.createOscillator();
        var gain=ctx.createGain();
        osc.frequency.value=f;
        osc.type='sine';
        osc.connect(gain);
        gain.connect(ctx.destination);
        var startTime=ctx.currentTime+(i*0.08);
        gain.gain.setValueAtTime(0,startTime);
        gain.gain.linearRampToValueAtTime(0.15,startTime+0.02);
        gain.gain.exponentialRampToValueAtTime(0.001,startTime+0.25);
        osc.start(startTime);
        osc.stop(startTime+0.3);
      });
    }catch(e){}
  }

  // === בדיקת רלוונטיות לפי תפקיד ===
  // האם ההתראה רלוונטית למשתמש הנוכחי?
  function isRelevantToCurrentUser(notif){
    if(!currentUser)return false;
    var d=notif.data||{};
    // אם יש target_role ספציפי
    if(d.target_role){
      if(Array.isArray(d.target_role))return d.target_role.indexOf(currentUser.role)>=0;
      return d.target_role===currentUser.role;
    }
    // אם יש target_user_id ספציפי
    if(d.target_user_id)return d.target_user_id===currentUser.id;
    // אם יש target_store_id - רק החנות הזו
    if(d.target_store_id&&currentUser.role==='store')return d.target_store_id===currentUser.storeId;
    if(d.target_store_id&&currentUser.role==='reseller'){
      // משווק רואה אם זאת חנות שלו
      var s=stores.find(function(x){return x.id===d.target_store_id;});
      if(!s)return false;
      if(s.resellerId===currentUser.id)return true;
      var u=users.find(function(x){return x.storeId===s.id;});
      return u&&u.resellerOf===currentUser.id;
    }
    return true;
  }

  // === API ראשי - שליחת התראה ===
  function send(eventType,data){
    if(!settings.enabled)return;
    if(settings.eventToggles[eventType]===false)return;
    var event=EVENTS[eventType];
    if(!event){console.warn('notify: unknown event',eventType);return;}

    var notif={
      id:'n'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      eventType:eventType,
      icon:event.icon,
      type:event.type,
      title:event.title,
      message:data&&data.message||'',
      data:data||{},
      time:Date.now(),
      read:false
    };

    // בדיקת רלוונטיות
    if(!isRelevantToCurrentUser(notif))return;

    // הוספה לראש הרשימה
    notifications.unshift(notif);
    if(notifications.length>MAX_STORED*2)notifications=notifications.slice(0,MAX_STORED*2);
    save();

    // הצגה ויזואלית
    showToast(notif);
    playSound(event.sound);
    updateBadge();
    shakeBell();

    // אם הפאנל פתוח - עדכן אותו
    var panel=document.getElementById('cpn-panel');
    if(panel)renderPanel();

    return notif.id;
  }

  // === הצגת toast ===
  function showToast(notif){
    var stack=document.getElementById('cpn-toast-stack');
    if(!stack)return;
    var el=document.createElement('div');
    el.className='cpn-toast cpn-'+(notif.type||'info');
    el.dataset.notifId=notif.id;
    el.innerHTML=
      '<div class="cpn-toast-icon">'+notif.icon+'</div>'+
      '<div class="cpn-toast-body">'+
        '<div class="cpn-toast-title">'+escapeHtml(notif.title)+'</div>'+
        (notif.message?'<div class="cpn-toast-msg">'+escapeHtml(notif.message)+'</div>':'')+
      '</div>'+
      '<button class="cpn-toast-close" aria-label="סגור">×</button>';

    // לחיצה - מסמן כנקרא ופותח את הפאנל
    el.addEventListener('click',function(e){
      if(e.target.classList.contains('cpn-toast-close')){
        e.stopPropagation();
        closeToast(el);
        return;
      }
      markRead(notif.id);
      closeToast(el);
      // אם יש navigation למקום ספציפי
      var d=notif.data||{};
      if(d.action_store_id&&typeof openCustomerCard==='function'){
        try{openCustomerCard(d.action_store_id);}catch(err){}
      }
    });
    stack.appendChild(el);

    // הסרה אוטומטית אחרי 6 שניות
    var timer=setTimeout(function(){closeToast(el);},6000);
    el._timer=timer;

    // הגבלת מספר טוסטים גלויים בו-זמנית
    var toasts=stack.querySelectorAll('.cpn-toast');
    if(toasts.length>4){
      // סגור את הישנים ביותר
      for(var i=0;i<toasts.length-4;i++){
        closeToast(toasts[i]);
      }
    }
  }

  function closeToast(el){
    if(!el||el._closing)return;
    el._closing=true;
    if(el._timer)clearTimeout(el._timer);
    el.classList.add('cpn-closing');
    setTimeout(function(){try{el.remove();}catch(e){}},250);
  }

  // === ניהול קריאה ===
  function markRead(notifId){
    var n=notifications.find(function(x){return x.id===notifId;});
    if(n&&!n.read){
      n.read=true;
      save();
      updateBadge();
    }
  }

  function markAllRead(){
    notifications.forEach(function(n){n.read=true;});
    save();
    updateBadge();
    var panel=document.getElementById('cpn-panel');
    if(panel)renderPanel();
  }

  function clear(){
    notifications=[];
    save();
    updateBadge();
    var panel=document.getElementById('cpn-panel');
    if(panel)renderPanel();
  }

  function getUnreadCount(){
    return notifications.filter(function(n){return !n.read;}).length;
  }

  function getAll(){
    return notifications.slice();
  }

  // === עדכון תג הפעמון ===
  function updateBadge(){
    var btn=document.getElementById('nav-bell-btn');
    var badge=document.getElementById('nav-bell-badge');
    if(!btn||!badge)return;
    // הצג את הכפתור רק אם יש משתמש מחובר
    btn.style.display=currentUser?'inline-flex':'none';
    var count=getUnreadCount();
    if(count>0){
      badge.textContent=count>99?'99+':String(count);
      badge.style.display='flex';
      btn.classList.add('cpn-has-unread');
    }else{
      badge.style.display='none';
      btn.classList.remove('cpn-has-unread');
    }
  }

  function shakeBell(){
    var btn=document.getElementById('nav-bell-btn');
    if(!btn)return;
    btn.classList.remove('cpn-shake');
    void btn.offsetWidth; // טריגר reflow
    btn.classList.add('cpn-shake');
    setTimeout(function(){btn.classList.remove('cpn-shake');},700);
  }

  // === פאנל ההתראות ===
  function renderPanel(){
    var panel=document.getElementById('cpn-panel');
    if(!panel)return;
    var list=panel.querySelector('.cpn-panel-list');
    if(!list)return;
    if(notifications.length===0){
      list.innerHTML='<div class="cpn-empty"><div class="cpn-empty-icon">🔔</div>אין התראות עדיין</div>';
      return;
    }
    var html='';
    notifications.slice(0,MAX_STORED).forEach(function(n){
      var timeStr=formatRelativeTime(n.time);
      var clr=n.type==='error'?'#e24b4a':n.type==='warning'?'#ef9f27':n.type==='order'?'#c490ff':'#39e600';
      html+='<div class="cpn-item'+(n.read?'':' cpn-unread')+'" data-id="'+n.id+'">';
      html+='<div class="cpn-item-icon">'+n.icon+'</div>';
      html+='<div class="cpn-item-body">';
      html+='<div class="cpn-item-title">'+escapeHtml(n.title)+'</div>';
      if(n.message)html+='<div class="cpn-item-msg">'+escapeHtml(n.message)+'</div>';
      html+='<div class="cpn-item-time">'+timeStr+'</div>';
      html+='</div></div>';
    });
    list.innerHTML=html;

    // מאזיני לחיצה
    list.querySelectorAll('.cpn-item').forEach(function(el){
      el.addEventListener('click',function(){
        var id=this.dataset.id;
        var n=notifications.find(function(x){return x.id===id;});
        if(!n)return;
        markRead(id);
        renderPanel();
        // ניווט אם רלוונטי
        var d=n.data||{};
        if(d.action_store_id&&typeof openCustomerCard==='function'){
          try{
            openCustomerCard(d.action_store_id);
            closePanel();
          }catch(err){}
        }
      });
    });
  }

  function formatRelativeTime(t){
    var diff=Date.now()-t;
    var sec=Math.floor(diff/1000);
    if(sec<60)return 'הרגע';
    var min=Math.floor(sec/60);
    if(min<60)return 'לפני '+min+' דק׳';
    var hr=Math.floor(min/60);
    if(hr<24)return 'לפני '+hr+' שע׳';
    var days=Math.floor(hr/24);
    if(days<7)return 'לפני '+days+' ימים';
    return new Date(t).toLocaleDateString('he-IL');
  }

  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function closePanel(){
    var panel=document.getElementById('cpn-panel');
    if(panel)try{panel.remove();}catch(e){}
  }

  // === הגדרות ===
  function getSettings(){return Object.assign({},settings);}
  function setSettings(newSettings){
    Object.assign(settings,newSettings||{});
    saveSettings();
  }

  // === Public API ===
  init();
  return {
    send:send,
    markRead:markRead,
    markAllRead:markAllRead,
    clear:clear,
    getUnreadCount:getUnreadCount,
    getAll:getAll,
    renderPanel:renderPanel,
    closePanel:closePanel,
    updateBadge:updateBadge,
    getSettings:getSettings,
    setSettings:setSettings
  };
})();

// === פתיחה/סגירה של פאנל ההתראות ===
function toggleNotifPanel(e){
  if(e)e.stopPropagation();
  var existing=document.getElementById('cpn-panel');
  if(existing){
    notify.closePanel();
    return;
  }
  var panel=document.createElement('div');
  panel.id='cpn-panel';
  panel.className='cpn-panel';
  panel.innerHTML=
    '<div class="cpn-panel-header">'+
      '<div class="cpn-panel-title">🔔 התראות</div>'+
      '<div class="cpn-panel-actions">'+
        '<button onclick="notify.markAllRead()">סמן הכל כנקרא</button>'+
        '<button onclick="if(confirm(\'למחוק את כל ההתראות?\'))notify.clear()">נקה</button>'+
        '<button onclick="notify.closePanel()" title="סגור">×</button>'+
      '</div>'+
    '</div>'+
    '<div class="cpn-panel-list"></div>';
  document.body.appendChild(panel);
  notify.renderPanel();

  // סגירה בלחיצה מחוץ
  setTimeout(function(){
    document.addEventListener('click',panelOutsideClick);
  },10);
}

function panelOutsideClick(e){
  var panel=document.getElementById('cpn-panel');
  var bell=document.getElementById('nav-bell-btn');
  if(!panel)return;
  if(panel.contains(e.target))return;
  if(bell&&bell.contains(e.target))return;
  notify.closePanel();
  document.removeEventListener('click',panelOutsideClick);
}

// ============================================================
// === רמה 2 (תשתית עתידית) - Web Push Notifications ===
// ============================================================
// כדי להפעיל בעתיד, צריך:
//   1. ליצור VAPID keys ב-Firebase Console > Project Settings > Cloud Messaging
//   2. להחליף את VAPID_PUBLIC_KEY למטה
//   3. לפרוס Cloud Function ב-Firebase שתשלח notifications לטוקנים
//   4. לקרוא ל-subscribeToPushNotifications() אחרי login של אדמין/חנות
//
// הקוד למטה מוכן - רק חסרים המפתחות והפונקציה בענן.
// ============================================================

var VAPID_PUBLIC_KEY='REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY'; // החלף בפועל

function isPushSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function getNotificationPermission(){
  if(!isPushSupported())return 'unsupported';
  return Notification.permission; // 'default','granted','denied'
}

async function requestNotificationPermission(){
  if(!isPushSupported()){
    cpAlert('הדפדפן לא תומך בהתראות פוש',{type:'error'});
    return false;
  }
  var perm=await Notification.requestPermission();
  return perm==='granted';
}

// פונקציה זו תפעל ברגע שיוגדרו VAPID keys ו-Cloud Function
async function subscribeToPushNotifications(){
  if(!isPushSupported())return null;
  if(VAPID_PUBLIC_KEY.indexOf('REPLACE')>=0){
    console.log('Push notifications: VAPID key not configured yet');
    return null;
  }
  try{
    var perm=await Notification.requestPermission();
    if(perm!=='granted')return null;
    var registration=await navigator.serviceWorker.ready;
    var subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    // שמור את ה-subscription ב-Firebase תחת המשתמש הנוכחי
    if(currentUser&&typeof db!=='undefined'){
      try{
        await db.collection('push_subscriptions').doc(currentUser.id).set({
          userId:currentUser.id,
          username:currentUser.username,
          role:currentUser.role,
          subscription:JSON.parse(JSON.stringify(subscription)),
          updatedAt:Date.now()
        });
      }catch(e){console.warn('Failed to save subscription:',e);}
    }
    return subscription;
  }catch(e){
    console.error('Push subscription failed:',e);
    return null;
  }
}

function urlBase64ToUint8Array(base64String){
  var padding='='.repeat((4-base64String.length%4)%4);
  var base64=(base64String+padding).replace(/\-/g,'+').replace(/_/g,'/');
  var rawData=window.atob(base64);
  var outputArray=new Uint8Array(rawData.length);
  for(var i=0;i<rawData.length;++i)outputArray[i]=rawData.charCodeAt(i);
  return outputArray;
}

// פונקציה לעדכון badge — נקראת מ-doLogin/doLogout
function refreshNotifyOnUserChange(){
  if(typeof notify!=='undefined')notify.updateBadge();
}

// ============================================================
// ============ 🔒 Long-press למובייל - חשיפת מחיר קניה ============
// ============================================================
// במובייל (טאצ'): לחיצה ארוכה (500ms) על .cost-trigger מציגה את התווית
// אחרי 3 שניות התווית נעלמת אוטומטית
// במחשב (mouseover): כבר עובד דרך CSS :hover
(function(){
  var pressTimer=null;
  var pressStartX=0,pressStartY=0;
  var revealedEl=null;
  var revealTimeout=null;

  function clearAllRevealed(){
    if(revealedEl){
      revealedEl.classList.remove('cost-revealed');
      revealedEl=null;
    }
    if(revealTimeout){
      clearTimeout(revealTimeout);
      revealTimeout=null;
    }
  }

  function reveal(el){
    clearAllRevealed();
    el.classList.add('cost-revealed');
    revealedEl=el;
    // נעלם אוטומטית אחרי 3 שניות
    revealTimeout=setTimeout(function(){
      clearAllRevealed();
    },3000);
  }

  // touchstart - התחל טיימר ל-long press
  document.addEventListener('touchstart',function(e){
    var trigger=e.target.closest('.cost-trigger');
    if(!trigger)return;
    if(e.touches&&e.touches[0]){
      pressStartX=e.touches[0].clientX;
      pressStartY=e.touches[0].clientY;
    }
    // מנע פתיחה של מודאל ההזמנה (במקרה שהtrigger בתוך כרטיס מוצר)
    e.stopPropagation();
    pressTimer=setTimeout(function(){
      reveal(trigger);
      pressTimer=null;
      // רטט קצר אם נתמך - לפידבק שהcontent נחשף
      if(navigator.vibrate)try{navigator.vibrate(15);}catch(err){}
    },500); // 0.5 שניה
  },{passive:true});

  // touchmove - אם הזיז את האצבע, ביטול הtimer
  document.addEventListener('touchmove',function(e){
    if(!pressTimer)return;
    if(e.touches&&e.touches[0]){
      var dx=Math.abs(e.touches[0].clientX-pressStartX);
      var dy=Math.abs(e.touches[0].clientY-pressStartY);
      if(dx>10||dy>10){
        clearTimeout(pressTimer);
        pressTimer=null;
      }
    }
  },{passive:true});

  // touchend - אם הtimer עדיין רץ (לחיצה רגילה), בטל
  document.addEventListener('touchend',function(e){
    if(pressTimer){
      clearTimeout(pressTimer);
      pressTimer=null;
    }
  },{passive:true});

  // לחיצה במקום אחר על המסך - מסתיר את הtooltip שנפתח ב-long press
  document.addEventListener('touchstart',function(e){
    if(!revealedEl)return;
    if(e.target.closest('.cost-trigger')===revealedEl)return;
    clearAllRevealed();
  },{passive:true,capture:true});

  // מנע תפריט מערכת ב-long press על trigger (בעיקר אנדרואיד)
  document.addEventListener('contextmenu',function(e){
    if(e.target.closest('.cost-trigger')){
      e.preventDefault();
      return false;
    }
  });
})();

function renderAll(){
  try{renderStores();}catch(e){console.error('renderStores failed:',e.message||e);}
  try{updateFilters();}catch(e){console.error('updateFilters failed:',e.message||e);}
  try{updatePrevSel();}catch(e){console.error('updatePrevSel failed:',e.message||e);}
  try{updateStats();}catch(e){console.error('updateStats failed:',e.message||e);}
  try{renderPStoreTabs();}catch(e){console.error('renderPStoreTabs failed:',e.message||e);}
  try{renderUsers();}catch(e){console.error('renderUsers failed:',e.message||e);}
  try{updateUserStoreLink();}catch(e){console.error('updateUserStoreLink failed:',e.message||e);}
}

// טעינה ראשונית
function init(){
  console.log('%c🚀 CashPhone v2.9 - צבעים בהירים יותר','background:#39e600;color:#000;padding:4px 12px;font-size:14px;font-weight:bold;border-radius:4px;');

  // === אבחון localStorage ===
  var storageOK=false;
  var storageError='';
  try{
    localStorage.setItem('__test__','1');
    var v=localStorage.getItem('__test__');
    localStorage.removeItem('__test__');
    if(v==='1'){storageOK=true;}
    else{storageError='קריאה אחרי כתיבה החזירה: '+v;}
  }catch(e){
    storageError=e.message||String(e);
  }

  // בדיקת מה קיים כבר ב-localStorage
  var existingStores=null,existingUsers=null,existingTs=null;
  try{
    existingStores=localStorage.getItem('cp_stores');
    existingUsers=localStorage.getItem('cp_users');
    existingTs=localStorage.getItem('cp_ts');
  }catch(e){}

  console.log('🔬 localStorage diagnostic:',{
    works:storageOK,
    error:storageError,
    existingStores:existingStores?JSON.parse(existingStores).length+' חנויות':'(אין)',
    existingUsers:existingUsers?JSON.parse(existingUsers).length+' משתמשים':'(אין)',
    lastSave:existingTs?new Date(parseInt(existingTs)).toLocaleString('he-IL'):'(אף פעם)'
  });

  // אם localStorage לא עובד — הצג התראה גדולה ובולטת
  if(!storageOK){
    setTimeout(function(){
      var banner=document.createElement('div');
      banner.style.cssText='position:fixed;top:0;left:0;right:0;background:#ff3030;color:#fff;padding:12px 16px;text-align:center;font-weight:700;z-index:99999;font-size:14px;direction:rtl;font-family:inherit;box-shadow:0 2px 10px rgba(0,0,0,0.5);';
      banner.innerHTML='⚠️ <b>localStorage לא עובד!</b> נתונים לא יישמרו.<br><span style="font-size:12px;font-weight:400;">סיבה: '+storageError+'</span><br><span style="font-size:11px;font-weight:400;">בדוק שאתה לא במצב גלישה פרטית, ושאין חוסם שעוצר אחסון.</span>';
      document.body.appendChild(banner);
    },500);
  }

  try{ loadData(); }catch(e){ console.error('loadData error:',e); }

  // 🔗 מיגרציה: סנכרון orders ↔ loads בלי loads מקושרים
  try{
    var migratedCount=migrateOrdersToLoads();
    if(migratedCount>0){
      console.log('🔗 מיגרציה: נוצרו '+migratedCount+' loads חדשים מ-orders ישנות');
    }
  }catch(e){console.warn('Order→Load migration failed:',e);}

  setTimeout(syncFromFirebase,2000);
  // הפעלת live sync — מקשיב לשינויים בזמן אמת מכל המכשירים
  setTimeout(startLiveSync,3000);
  try{ renderAll(); }catch(e){ console.error('renderAll error:',e); }
  try{ fetchDollarRate(); }catch(e){}
  try{ scheduleMidnightUpdate(); }catch(e){}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  const nav=document.getElementById('main-nav');
  if(nav)nav.style.display='none';
  const ls=document.getElementById('login-screen');
  if(ls){ls.style.display='flex';ls.style.zIndex='9998';}
  // התחברות אוטומטית אם יש סשן שמור
  try{
    const sess=localStorage.getItem('cp_session');
    if(sess){
      const s=JSON.parse(sess);
      // בדיקת תוקף - האם עברו יותר מ-30 דקות מהפעילות האחרונה?
      const lastActivity=parseInt(localStorage.getItem('cp_last_activity')||'0');
      const idleTime=Date.now()-lastActivity;
      if(lastActivity&&idleTime>IDLE_TIMEOUT){
        // הסשן פג תוקף - לנקות
        localStorage.removeItem('cp_session');
        localStorage.removeItem('cp_last_activity');
        const errEl=document.getElementById('login-err');
        if(errEl){
          errEl.classList.add('on');
          errEl.style.background='#2a1a00';
          errEl.style.borderColor='#ef9f27';
          errEl.style.color='#ef9f27';
          errEl.textContent='⏱️ הסשן פג תוקף. יש להתחבר שוב';
        }
      }else if(s&&s.username&&s.password){
        // אדמין - תמיד אפשר
        if(s.username==='admin'&&s.password==='admin123'){
          const adminUser=users.find(x=>x.username==='admin')||{id:'admin',username:'admin',password:'admin123',role:'admin',storeId:null};
          currentUser=adminUser;
          resetIdleTimer();
          document.getElementById('login-screen').style.display='none';
          document.getElementById('main-nav').style.display='flex';
          document.getElementById('chip-name').textContent='admin 👑';
          buildNav();
          showPage('page-admin');
          setTimeout(renderDashboard,100);
        }else{
          // משתמש רגיל - חיפוש ברשימה
          const found=users.find(x=>x.username.toLowerCase()===s.username.toLowerCase()&&x.password===s.password);
          if(found){
            doLogin(found);
          }else{
            // אם לא נמצא - אולי הרשימה עדיין לא נטענה מ-Firebase, ננסה שוב אחרי הסנכרון
            setTimeout(function(){
              const f2=users.find(x=>x.username.toLowerCase()===s.username.toLowerCase()&&x.password===s.password);
              if(f2)doLogin(f2);
            },2500);
          }
        }
      }
    }
  }catch(e){console.warn('Auto-login error:',e);}
}

// 🌐 החל את השפה השמורה בעת טעינה ראשונית
try{
  document.documentElement.setAttribute('lang',currentLang());
  document.documentElement.setAttribute('dir','rtl');
  applyTranslations();
}catch(e){}

init();

// Mobile improvements
function isMobile(){return window.innerWidth<=600;}

// After login, show bottom nav for store users on mobile
const _origBuildNav=buildNav;
buildNav=function(){
  _origBuildNav();
  const bottomNav=document.getElementById('bottom-nav');
  if(currentUser&&currentUser.role==='store'&&isMobile()){
    if(bottomNav)bottomNav.style.display='flex';
    document.getElementById('main-nav').style.display='none';
    document.querySelectorAll('.page').forEach(p=>p.classList.add('has-bottom-nav'));
  } else {
    if(bottomNav)bottomNav.style.display='none';
    if(currentUser)document.getElementById('main-nav').style.display='flex';
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('has-bottom-nav'));
  }
};

/* ============== מערכת טעינות (LOADS) ============== */
const LOADS_KEY='cp_loads_v1';
let loads=[];
try{var _l=localStorage.getItem(LOADS_KEY);if(_l)loads=JSON.parse(_l)||[];}catch(e){loads=[];}
if(!loads.length){
  loads=[{id:Date.now(),invoiceDate:'16/01/2026',invoiceTime:'11:14 בבוקר',executionDate:'16/01/2026',executionTime:'12:37 בצהריים',playerId:'51716065930',playerName:'F16 מרהוף',type:'טעינה מלאה',storeCost:18.38,myPrice:22.0,hasFile:false,fileName:''}];
  saveLoads();
}
function saveLoads(){
  // ב-localStorage לא שומרים DataURLs כי הם תופסים הרבה מקום
  try{
    const slim=loads.map(function(o){
      const c=Object.assign({},o);
      if(c.fileLocal&&c.fileUrl&&c.fileUrl.length>1000)c.fileUrl=''; // לא לשמור DataURL גדול
      return c;
    });
    localStorage.setItem(LOADS_KEY,JSON.stringify(slim));
  }catch(e){}
  // סנכרון ל-Firebase Firestore (רק metadata, לא הקבצים עצמם)
  if(window.fbOK&&window.db){
    showLoadsSyncStatus('syncing');
    try{
      const cloudLoads=loads.map(function(o){
        const c=Object.assign({},o);
        // אם הקובץ מקומי (DataURL) - לא לשלוח לענן
        if(c.fileLocal){c.fileUrl='';}
        return c;
      });
      window.db.collection('cashphone').doc('main').set({
        loads:cloudLoads,
        ts:Date.now()
      },{merge:true}).then(function(){
        try{localStorage.setItem('cp_ts',Date.now().toString());}catch(e){}
        showLoadsSyncStatus('synced');
      }).catch(function(e){
        console.warn('Firebase loads save error:',e);
        showLoadsSyncStatus('error');
      });
    }catch(e){showLoadsSyncStatus('error');}
  }else{
    showLoadsSyncStatus('local');
  }
}
function showLoadsSyncStatus(state){
  const el=document.getElementById('loads-sync-status');
  if(!el)return;
  if(state==='syncing'){el.innerHTML='<span style="color:#ef9f27;">⟳ מסנכרן...</span>';}
  else if(state==='synced'){el.innerHTML='<span style="color:var(--green);">☁ מסונכרן</span>';}
  else if(state==='error'){el.innerHTML='<span style="color:var(--danger);">⚠ שגיאת סנכרון</span>';}
  else if(state==='local'){el.innerHTML='<span style="color:#888;">💾 מקומי בלבד</span>';}
}
function fmtMoney(n){return '₪'+Number(n).toFixed(2);}
function lpad(n){return n<10?'0'+n:''+n;}
function loadNowParts(){
  const d=new Date();
  const date=lpad(d.getDate())+'/'+lpad(d.getMonth()+1)+'/'+d.getFullYear();
  const h=d.getHours();
  const period=h<12?'בבוקר':h<17?'בצהריים':h<20?'בערב':'בלילה';
  return {date:date,time:lpad(h)+':'+lpad(d.getMinutes())+' '+period};
}

// ============================================================
// ============ 🔗 סנכרון orders ↔ loads ============
// ============================================================
// כל הזמנה מחנות = טעינה שאני (האדמין) צריך לבצע בפועל אצל הספק.
// כלומר orders ו-loads הם שתי תצוגות של אותה ישות.
// פונקציות אלו דואגות שיהיו מסונכרנים תמיד.

// יצירת load אוטומטי מ-order. מחזיר את ה-load שנוצר.
function createLoadFromOrder(order){
  if(!order)return null;
  if(!loads)loads=[];

  // בדיקה - אם כבר יש load מקושר, אל תיצור שוב
  if(order.loadId&&loads.find(function(l){return l.id===order.loadId;})){
    return loads.find(function(l){return l.id===order.loadId;});
  }

  // חישוב מחיר הקניה שלי (העלות לי = pkg.p ההמרה, או basePrice של ההזמנה)
  // היום אנחנו לא יודעים בדיוק - basePrice של ההזמנה הוא מחיר בפועל בש"ח של pkg.p,
  // ועלות בפועל לחנות = ההכנסות שלי = order.price
  // עלות לי בפועל (לפני שיוכי הספק) = basePrice
  var myCost=order.basePrice||0;
  var storeCost=order.price||0; // מה החנות משלמת לי

  var np=loadNowParts();
  // אם להזמנה יש זמן, ננסה לחלץ ממנה את התאריך/השעה
  if(order.time){
    // order.time הוא string בפורמט HH:MM או דומה
    // נשתמש בזמן הנוכחי כי order.id הוא timestamp
    if(order.id){
      try{
        var d=new Date(order.id);
        if(!isNaN(d.getTime())){
          np.date=lpad(d.getDate())+'/'+lpad(d.getMonth()+1)+'/'+d.getFullYear();
          var h=d.getHours();
          var period=h<12?'בבוקר':h<17?'בצהריים':h<20?'בערב':'בלילה';
          np.time=lpad(h)+':'+lpad(d.getMinutes())+' '+period;
        }
      }catch(e){}
    }
  }

  var load={
    id:'l'+(order.id||Date.now())+'_'+Math.random().toString(36).slice(2,6),
    invoiceDate:np.date,invoiceTime:np.time,
    executionDate:np.date,executionTime:np.time,
    storeId:order.storeId,storeName:order.storeName||'',
    playerName:order.user||'',playerId:'',
    type:(order.prod||'')+(order.pkg?' — '+order.pkg:''),
    storeCost:storeCost, // מה החנות משלמת לי
    myPrice:myCost,      // העלות שלי בפועל (קניה מהספק)
    mode:'add',
    status:order.status==='done'?'done':'pending',
    hasFile:false,fileName:'',
    fromOrderId:order.id, // קישור חזרה להזמנה
    autoCreated:true
  };
  loads.unshift(load);

  // קישור דו-כיווני
  order.loadId=load.id;

  return load;
}

// סנכרון בדיעבד - יוצר loads עבור כל ה-orders שאין להם
// מחזיר מספר הרשומות שנוצרו
function migrateOrdersToLoads(){
  if(!Array.isArray(orders))return 0;
  if(!Array.isArray(loads))loads=[];

  var created=0;
  orders.forEach(function(order){
    if(!order||!order.storeId)return;
    // יש כבר load מקושר?
    if(order.loadId&&loads.find(function(l){return l.id===order.loadId;}))return;
    // יש load שכבר מקושר חזרה (fromOrderId)?
    var existingLoad=loads.find(function(l){return l.fromOrderId===order.id;});
    if(existingLoad){
      order.loadId=existingLoad.id;
      return;
    }
    // אין - תיצור
    createLoadFromOrder(order);
    created++;
  });
  if(created>0){
    try{saveLoads();}catch(e){}
    try{saveData();}catch(e){}
  }
  return created;
}

// עדכון סטטוס של load כשמשנים סטטוס של order
function syncLoadStatusFromOrder(order){
  if(!order||!order.loadId)return;
  var load=loads.find(function(l){return l.id===order.loadId;});
  if(!load)return;
  if(order.status==='done')load.status='done';
  else if(order.status==='cancelled'){
    // ביטול הזמנה = load של refund
    load.mode='refund';
    load.status='done';
    load.type='ביטול: '+(load.type||'');
  }
  else load.status='pending';
  try{saveLoads();}catch(e){}
}

// מחיקת load כשמוחקים order
function deleteLoadFromOrder(order){
  if(!order||!order.loadId)return;
  if(!Array.isArray(loads))return;
  var idx=loads.findIndex(function(l){return l.id===order.loadId;});
  if(idx>=0){
    loads.splice(idx,1);
    try{saveLoads();}catch(e){}
  }
}

function setLoadView(btn,view){
  document.querySelectorAll('.loadview-btn').forEach(b=>{
    b.classList.remove('on');
    b.style.background='none';b.style.color='#888';b.style.fontWeight='600';
  });
  btn.classList.add('on');
  btn.style.background='linear-gradient(135deg,var(--green),var(--green2))';
  btn.style.color='#000';btn.style.fontWeight='700';
  document.body.classList.remove('loadview-store','loadview-mine');
  document.body.classList.add('loadview-'+view);
  renderLoadsSummary();
}
function renderLoadsSummary(){
  const view=document.body.classList.contains('loadview-mine')?'mine':'store';
  // הפרדה בין טעינות למשיכות
  const adds=loads.filter(o=>o.mode!=='refund');
  const refunds=loads.filter(o=>o.mode==='refund');
  const totalCostAdd=adds.reduce((s,o)=>s+Math.abs(Number(o.storeCost)),0);
  const totalPaidAdd=adds.reduce((s,o)=>s+Math.abs(Number(o.myPrice)),0);
  const totalCostRefund=refunds.reduce((s,o)=>s+Math.abs(Number(o.storeCost)),0);
  const totalPaidRefund=refunds.reduce((s,o)=>s+Math.abs(Number(o.myPrice)),0);
  const netCost=totalCostAdd-totalCostRefund;
  const netPaid=totalPaidAdd-totalPaidRefund;
  const netProfit=netPaid-netCost;
  const el=document.getElementById('loads-summary');
  if(!el)return;
  if(view==='store'){
    el.innerHTML=
      '<div class="stat"><div class="stat-l">סה״כ טעינות</div><div class="stat-v" style="color:#5bb3ef;">'+adds.length+'</div></div>'+
      '<div class="stat"><div class="stat-l">סה״כ עלות לחנות</div><div class="stat-v" style="color:#ef9f27;">'+fmtMoney(totalCostAdd)+'</div></div>'+
      '<div class="stat"><div class="stat-l">ביטולים</div><div class="stat-v" style="color:#ff6b7a;">−'+fmtMoney(totalCostRefund)+'</div></div>'+
      '<div class="stat" style="border-color:rgba(57,230,0,0.3);"><div class="stat-l">יתרה לחנות (נטו)</div><div class="stat-v" style="color:'+(netCost>=0?'var(--green)':'#ff6b7a')+';">'+fmtMoney(netCost)+'</div></div>';
  }else{
    el.innerHTML=
      '<div class="stat"><div class="stat-l">טעינות / ביטולים</div><div class="stat-v" style="color:#5bb3ef;font-size:16px;">'+adds.length+' / <span style="color:#ff6b7a;">'+refunds.length+'</span></div></div>'+
      '<div class="stat"><div class="stat-l">עלות לחנות (נטו)</div><div class="stat-v" style="color:#ef9f27;font-size:16px;">'+fmtMoney(netCost)+'</div></div>'+
      '<div class="stat"><div class="stat-l">סה״כ ששילמתי (נטו)</div><div class="stat-v" style="color:#5bb3ef;font-size:16px;">'+fmtMoney(netPaid)+'</div></div>'+
      '<div class="stat" style="border-color:rgba(57,230,0,0.3);"><div class="stat-l">הרווח שלי (נטו)</div><div class="stat-v" style="color:'+(netProfit>=0?'var(--green)':'#ff6b7a')+';font-size:18px;">'+fmtMoney(netProfit)+'</div></div>';
  }
}
function renderLoads(){
  const tbody=document.getElementById('loads-tbody');
  if(!tbody)return;
  // הצגת/הסתרת כפתורי האדמין לפי תפקיד המשתמש
  const isAdmin=currentUser&&currentUser.role==='admin';
  document.querySelectorAll('.admin-only-btn').forEach(function(btn){
    btn.style.display=isAdmin?'flex':'none';
  });
  const search=(document.getElementById('loads-search').value||'').toLowerCase().trim();
  const statusFilter=document.getElementById('loads-filter-status').value;
  const filtered=loads.filter(o=>{
    if(statusFilter==='add'&&o.mode==='refund')return false;
    if(statusFilter==='refund'&&o.mode!=='refund')return false;
    if(statusFilter==='pending'&&o.hasFile)return false;
    if(statusFilter==='done'&&!o.hasFile)return false;
    if(!search)return true;
    return (o.playerName||'').toLowerCase().includes(search)||
           (o.playerId||'').includes(search)||
           (o.type||'').toLowerCase().includes(search);
  });
  if(!filtered.length){
    const emptyMsg=isAdmin
      ?'אין רשומות להצגה. לחץ "הוסף טעינה" או "הוסף ביטול" כדי להתחיל.'
      :'אין רשומות להצגה כרגע.';
    tbody.innerHTML='<tr><td colspan="13" style="padding:50px 20px;text-align:center;color:#666;font-size:13px;">'+emptyMsg+'</td></tr>';
  }else{
    tbody.innerHTML=filtered.map(o=>{
      const idx=loads.indexOf(o);
      const isRefund=o.mode==='refund';
      const profit=o.myPrice-o.storeCost;
      const status=isRefund
        ?'<span style="display:inline-block;padding:3px 12px;background:#3a0a0f;color:#ff6b7a;border-radius:10px;font-size:11px;font-weight:600;">מבוטל</span>'
        :(o.hasFile
          ?'<span class="load-status-done">הושלם</span>'
          :'<span class="load-status-pending">ממתין לאישור</span>');
      const isImg=o.fileName&&/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(o.fileName);
      const cloudIcon=o.fileLocal?'💾':'☁';
      let upload;
      if(o.hasFile){
        if(isImg&&o.fileUrl){
          upload='<div class="load-uploaded">'+
            '<img src="'+o.fileUrl+'" class="load-thumb" data-lurl="'+o.fileUrl+'" data-lname="'+o.fileName+'" alt="" title="לחץ להגדלה"/>'+
            '<a class="fname" href="'+o.fileUrl+'" target="_blank" rel="noopener" title="'+o.fileName+'">'+cloudIcon+' '+o.fileName+'</a>'+
            '<button class="load-remove-file" data-lidx="'+idx+'" title="הסר קובץ">×</button>'+
          '</div>';
        }else{
          const ext=(o.fileName||'').split('.').pop().toLowerCase();
          let icon='📄';
          if(ext==='pdf')icon='📕';
          else if(ext==='doc'||ext==='docx')icon='📘';
          upload='<div class="load-uploaded">'+
            '<span style="font-size:18px;">'+icon+'</span>'+
            '<a class="fname" href="'+(o.fileUrl||'#')+'" target="_blank" rel="noopener" title="'+o.fileName+'">'+cloudIcon+' '+o.fileName+'</a>'+
            '<button class="load-remove-file" data-lidx="'+idx+'" title="הסר קובץ">×</button>'+
          '</div>';
        }
      }else{
        upload='<label class="load-upload-btn"><span>📎</span><span>העלאת קובץ</span><input type="file" class="load-file-input" data-lidx="'+idx+'" accept="image/*,.pdf,.doc,.docx" style="display:none;"/></label>';
      }
      // צבעי שורה לפי סוג
      const rowStyle=isRefund?'background:rgba(230,57,70,0.06);':'';
      const costClr=isRefund?'#ff6b7a':'#ef9f27';
      const paidClr=isRefund?'#ff6b7a':'#5bb3ef';
      const profitClr=isRefund?'#ff6b7a':'var(--green)';
      const sign=isRefund?'−':'';
      const absCost=Math.abs(o.storeCost);
      const absPaid=Math.abs(o.myPrice);
      const absProfit=Math.abs(profit);
      // כפתור מחיקה רק לאדמין
      const delBtn=isAdmin?'<button class="dbtn" data-ldel="'+idx+'">🗑️</button>':'<span style="color:#444;">—</span>';
      return '<tr class="load-row" style="'+rowStyle+'">'+
        '<td style="font-size:11px;line-height:1.5;">'+o.invoiceDate+'<br>'+o.invoiceTime+'</td>'+
        '<td style="font-size:11px;line-height:1.5;">'+o.executionDate+'<br>'+o.executionTime+'</td>'+
        '<td style="font-size:11px;color:#39e600;font-weight:600;">'+(o.storeName||'—')+'</td>'+
        '<td>'+o.playerId+'</td>'+
        '<td>'+o.playerName+'</td>'+
        '<td>'+(isRefund?'<span style="color:#ff6b7a;font-weight:600;">'+o.type+'</span>':o.type)+'</td>'+
        '<td class="lcol-store-only" style="color:'+costClr+';font-weight:700;">'+sign+fmtMoney(absCost)+'</td>'+
        '<td class="lcol-mine" style="color:'+costClr+';font-weight:700;">'+sign+fmtMoney(absCost)+'</td>'+
        '<td class="lcol-mine" style="color:'+paidClr+';font-weight:700;">'+sign+fmtMoney(absPaid)+'</td>'+
        '<td class="lcol-mine" style="color:'+profitClr+';font-weight:700;">'+sign+fmtMoney(absProfit)+'</td>'+
        '<td>'+upload+'</td>'+
        '<td>'+status+'</td>'+
        '<td>'+delBtn+'</td>'+
      '</tr>';
    }).join('');
  }
  document.getElementById('loads-count').textContent='מציג: '+filtered.length+' מתוך '+loads.length+' רשומות';
  renderLoadsSummary();
}
// העלאה ומחיקה - מאזין יחיד
document.addEventListener('change',function(e){
  if(!e.target.classList||!e.target.classList.contains('load-file-input'))return;
  const f=e.target.files[0];if(!f)return;
  const idx=parseInt(e.target.dataset.lidx);
  // בדיקת גודל קובץ - מקסימום 10MB
  if(f.size>10*1024*1024){
    cpAlert('הקובץ גדול מדי. הגודל המרבי הוא 10MB',{type:'error'});
    e.target.value='';
    return;
  }
  uploadLoadFile(idx,f);
});
function uploadLoadFile(idx,file){
  const load=loads[idx];
  if(!load)return;
  showLoadsSyncStatus('syncing');
  // Cloudinary - העלאה ישירה מהדפדפן
  const CLOUDINARY_CLOUD='doivcdwph';
  const CLOUDINARY_PRESET='cashphone_loads';
  const formData=new FormData();
  formData.append('file',file);
  formData.append('upload_preset',CLOUDINARY_PRESET);
  // הוספת תגית עם מזהה הטעינה
  formData.append('tags','load_'+load.id);
  const xhr=new XMLHttpRequest();
  // קביעה אם זו תמונה או קובץ אחר (PDF/Word)
  const isImage=/^image\//.test(file.type);
  const endpoint=isImage?'image':'raw';
  xhr.open('POST','https://api.cloudinary.com/v1_1/'+CLOUDINARY_CLOUD+'/'+endpoint+'/upload',true);
  xhr.upload.onprogress=function(e){
    if(e.lengthComputable){
      const pct=Math.round((e.loaded/e.total)*100);
      const el=document.getElementById('loads-sync-status');
      if(el)el.innerHTML='<span style="color:#ef9f27;">⬆ מעלה '+pct+'%</span>';
    }
  };
  xhr.onload=function(){
    if(xhr.status>=200&&xhr.status<300){
      try{
        const res=JSON.parse(xhr.responseText);
        loads[idx].hasFile=true;
        loads[idx].fileName=file.name;
        loads[idx].fileUrl=res.secure_url;
        loads[idx].filePath=res.public_id;
        loads[idx].fileType=res.resource_type||endpoint;
        loads[idx].fileLocal=false;
        saveLoads();renderLoads();
      }catch(e){
        console.error('Cloudinary parse error:',e);
        cpAlert('שגיאה בעיבוד התשובה מהשרת',{type:'error'});
        showLoadsSyncStatus('error');
      }
    }else{
      console.error('Cloudinary upload failed:',xhr.status,xhr.responseText);
      let msg='שגיאה בהעלאה';
      try{
        const err=JSON.parse(xhr.responseText);
        if(err.error&&err.error.message)msg+=': '+err.error.message;
      }catch(e){}
      cpAlert(msg,{type:'error'});
      showLoadsSyncStatus('error');
    }
  };
  xhr.onerror=function(){
    console.error('Cloudinary network error');
    cpAlert('שגיאת רשת בהעלאה לענן',{type:'error'});
    showLoadsSyncStatus('error');
  };
  xhr.send(formData);
}
document.addEventListener('click',async function(e){
  if(e.target.classList&&e.target.classList.contains('load-remove-file')){
    const idx=parseInt(e.target.dataset.lidx);
    if(!await cpConfirm('להסיר את הקובץ מהרשומה?',{type:'warning',title:'הסרת קובץ'}))return;
    // הסרת ההפניה - הקובץ עצמו נשאר ב-Cloudinary אבל לא נגיש מהאתר
    loads[idx].hasFile=false;
    loads[idx].fileName='';
    loads[idx].fileUrl='';
    loads[idx].filePath='';
    loads[idx].fileType='';
    loads[idx].fileLocal=false;
    saveLoads();renderLoads();
  }
  if(e.target.dataset&&e.target.dataset.ldel!==undefined){
    const idx=parseInt(e.target.dataset.ldel);
    const rec=loads[idx];
    const isRefund=rec&&rec.mode==='refund';
    const msg=isRefund
      ?'למחוק את רשומת הביטול הזו?\nהיתרה שזוכתה לחנות תוחזר.'
      :'למחוק את הטעינה הזו?\nהיתרה תוחזר לחנות.';
    if(await cpConfirm(msg,{type:'danger',title:isRefund?'מחיקת ביטול':'מחיקת טעינה',okText:'מחק'})){
      // החזרת/הפחתת יתרת החנות בהתאם
      if(rec&&rec.storeId){
        const st=(stores||[]).find(x=>x.id===rec.storeId);
        if(st){
          const absCost=Math.abs(Number(rec.storeCost||0));
          if(isRefund){
            // היה ביטול שזיכה — עכשיו הופך — מורידים בחזרה
            st.credit=Number(st.credit||0)-absCost;
            if(!Array.isArray(st.log))st.log=[];
            st.log.unshift({t:'מחיקת ביטול: '+(rec.playerName||''),amt:absCost,plus:false,time:now()});
          }else{
            // היה טעינה שהורידה — עכשיו מוחזר
            st.credit=Number(st.credit||0)+absCost;
            if(!Array.isArray(st.log))st.log=[];
            st.log.unshift({t:'מחיקת טעינה: '+(rec.playerName||''),amt:absCost,plus:true,time:now()});
          }
        }
      }
      loads.splice(idx,1);
      saveLoads();
      saveData();
      renderLoads();
      if(typeof renderStoresTable==='function')try{renderStoresTable();}catch(e){}
      if(typeof renderStoreFront==='function')try{renderStoreFront();}catch(e){}
    }
  }
});
// מודאל
function openLoadModal(mode){
  // חסימת גישה - רק אדמין יכול להוסיף/לבטל
  if(!currentUser||currentUser.role!=='admin'){
    cpAlert('אין לך הרשאה לבצע פעולה זו',{type:'error',title:'גישה חסומה'});
    return;
  }
  const m=document.getElementById('load-modal');if(!m)return;
  window._loadMode=mode||'add';
  m.style.display='flex';
  // מילוי תפריט החנויות
  const sSel=document.getElementById('lf-store');
  if(sSel){
    const list=Array.isArray(stores)?stores:[];
    sSel.innerHTML='<option value="">— בחר חנות —</option>'+
      list.map(function(s){
        const c=Number(s.credit||0);
        const cTxt=c>=0?'₪'+c.toLocaleString():'<span style="color:#e24b4a;">חוב ₪'+Math.abs(c).toLocaleString()+'</span>';
        return '<option value="'+s.id+'" data-credit="'+c+'">'+s.name+' (יתרה: ₪'+c.toLocaleString()+')</option>';
      }).join('');
    sSel.value='';
  }
  document.getElementById('lf-store-balance').innerHTML='';
  // עדכון הכותרת והעיצוב לפי הסוג
  const titleEl=document.getElementById('load-modal-title');
  const saveBtn=document.getElementById('load-modal-save');
  const subtitleEl=document.getElementById('load-modal-subtitle');
  if(window._loadMode==='refund'){
    if(titleEl)titleEl.innerHTML='➖ ביטול / זיכוי חנות';
    if(titleEl)titleEl.style.color='#ff6b7a';
    if(saveBtn){saveBtn.textContent='בצע ביטול וזיכוי';saveBtn.style.background='linear-gradient(135deg,#e63946,#c1121f)';saveBtn.style.color='#fff';}
    if(subtitleEl)subtitleEl.innerHTML='💡 הסכום יוחזר לחנות שבחרת ויעלה את היתרה שלה';
  }else{
    if(titleEl)titleEl.innerHTML='➕ הוספת טעינה חדשה';
    if(titleEl)titleEl.style.color='#fff';
    if(saveBtn){saveBtn.textContent='שמור טעינה';saveBtn.style.background='';saveBtn.style.color='';}
    if(subtitleEl)subtitleEl.innerHTML='💡 העלות לחנות תופחת מהיתרה של החנות שבחרת';
  }
  document.getElementById('lf-playerName').value='';
  document.getElementById('lf-playerId').value='';
  document.getElementById('lf-type').value='טעינה מלאה';
  document.getElementById('lf-storeCost').value='';
  document.getElementById('lf-myPrice').value='';
  updateLoadProfit();
  setTimeout(()=>document.getElementById('lf-playerName').focus(),100);
}
function closeLoadModal(){
  const m=document.getElementById('load-modal');if(m)m.style.display='none';
}
function updateLoadProfit(){
  const c=parseFloat(document.getElementById('lf-storeCost').value)||0;
  const p=parseFloat(document.getElementById('lf-myPrice').value)||0;
  const mode=window._loadMode||'add';
  // הצגת יתרת החנות הנבחרת + תחזית
  const sSel=document.getElementById('lf-store');
  const balDiv=document.getElementById('lf-store-balance');
  if(sSel&&balDiv){
    const sid=sSel.value;
    if(sid){
      const st=(stores||[]).find(x=>x.id===sid);
      if(st){
        const cur=Number(st.credit||0);
        const after=mode==='refund'?(cur+Math.abs(c)):(cur-Math.abs(c));
        const curTxt='₪'+cur.toLocaleString();
        const afterTxt=after>=0?'₪'+after.toLocaleString():'<span style="color:#e24b4a;">חוב ₪'+Math.abs(after).toLocaleString()+'</span>';
        const arrow=mode==='refund'?'+':'−';
        const arrowClr=mode==='refund'?'#39e600':'#ef9f27';
        balDiv.innerHTML='יתרה נוכחית: <b>'+curTxt+'</b> &nbsp;<span style="color:'+arrowClr+';">'+arrow+'₪'+Math.abs(c).toLocaleString()+'</span>&nbsp; → אחרי הפעולה: <b>'+afterTxt+'</b>';
      }
    }else{
      balDiv.innerHTML='';
    }
  }
  if(mode==='refund'){
    document.getElementById('lf-profit').innerHTML='סכום לביטול: <strong style="color:#ff6b7a;font-size:15px;">−'+fmtMoney(p)+'</strong> | החזר/זיכוי לחנות: <strong style="color:#39e600;font-size:14px;">+'+fmtMoney(c)+'</strong>';
    document.getElementById('lf-profit').style.background='rgba(230,57,70,0.08)';
    document.getElementById('lf-profit').style.borderColor='rgba(230,57,70,0.3)';
  }else{
    document.getElementById('lf-profit').innerHTML='הרווח שלי: <strong style="color:var(--green);font-size:15px;">'+fmtMoney(p-c)+'</strong>';
    document.getElementById('lf-profit').style.background='rgba(57,230,0,0.08)';
    document.getElementById('lf-profit').style.borderColor='rgba(57,230,0,0.2)';
  }
}
function saveLoad(){
  // חסימת גישה - רק אדמין יכול להוסיף/לבטל
  if(!currentUser||currentUser.role!=='admin'){
    cpAlert('אין לך הרשאה לבצע פעולה זו',{type:'error',title:'גישה חסומה'});
    return;
  }
  const storeId=document.getElementById('lf-store').value;
  const name=document.getElementById('lf-playerName').value.trim();
  const pid=document.getElementById('lf-playerId').value.trim();
  const type=document.getElementById('lf-type').value;
  let cost=parseFloat(document.getElementById('lf-storeCost').value);
  let paid=parseFloat(document.getElementById('lf-myPrice').value);
  if(!storeId){cpAlert('יש לבחור חנות',{type:'warning'});return;}
  if(!name||!pid||isNaN(cost)||isNaN(paid)){cpAlert('יש למלא את כל השדות הנדרשים',{type:'warning'});return;}
  const st=(stores||[]).find(x=>x.id===storeId);
  if(!st){cpAlert('החנות לא נמצאה',{type:'error'});return;}
  const mode=window._loadMode||'add';
  // אם זו משיכה - הסכומים שליליים
  if(mode==='refund'){
    cost=-Math.abs(cost);
    paid=-Math.abs(paid);
  }else{
    cost=Math.abs(cost);
    paid=Math.abs(paid);
  }
  // עדכון יתרת החנות + יומן החנות
  const absCost=Math.abs(cost);
  if(mode==='refund'){
    // ביטול = זיכוי לחנות
    st.credit=Number(st.credit||0)+absCost;
    if(!Array.isArray(st.log))st.log=[];
    st.log.unshift({t:'זיכוי מביטול: '+name+' ('+pid+')',amt:absCost,plus:true,time:now()});
  }else{
    // טעינה = הפחתה מהחנות
    st.credit=Number(st.credit||0)-absCost;
    if(!Array.isArray(st.log))st.log=[];
    st.log.unshift({t:'טעינה: '+name+' ('+pid+')',amt:absCost,plus:false,time:now()});
  }
  const np=loadNowParts();
  loads.unshift({
    id:Date.now(),
    invoiceDate:np.date,invoiceTime:np.time,
    executionDate:np.date,executionTime:np.time,
    storeId:storeId,storeName:st.name,
    playerName:name,playerId:pid,
    type:mode==='refund'?('ביטול: '+type):type,
    storeCost:cost,myPrice:paid,
    mode:mode,
    hasFile:false,fileName:''
  });
  saveLoads();
  saveData();
  renderLoads();
  // רענון תצוגות אחרות אם פתוחות
  if(typeof renderStoresTable==='function')try{renderStoresTable();}catch(e){}
  if(typeof renderStoreFront==='function')try{renderStoreFront();}catch(e){}
  if(typeof updateStats==='function')try{updateStats();}catch(e){}
  if(typeof renderDashboard==='function')try{renderDashboard();}catch(e){}
  closeLoadModal();
  if(typeof toast==='function'){
    toast('t-admin',mode==='refund'?'✅ הזיכוי בוצע — יתרת החנות עודכנה':'✅ הטעינה נשמרה — יתרת החנות עודכנה');
  }
}
// סגירת מודאל בלחיצה על הרקע
document.addEventListener('click',function(e){
  if(e.target&&e.target.id==='load-modal')closeLoadModal();
});

// לחיצה על thumbnail פותחת לייטבוקס
document.addEventListener('click',function(e){
  if(e.target&&e.target.classList&&e.target.classList.contains('load-thumb')){
    e.stopPropagation();
    const url=e.target.dataset.lurl;
    const name=e.target.dataset.lname;
    openLightbox(url,name);
  }
});
function openLightbox(url,name){
  const lb=document.getElementById('load-lightbox');
  if(!lb)return;
  document.getElementById('lb-img').src=url;
  document.getElementById('lb-caption').textContent=name||'';
  document.getElementById('lb-download').href=url;
  document.getElementById('lb-download').setAttribute('download',name||'image');
  document.getElementById('lb-open').href=url;
  lb.style.display='flex';
}
function closeLightbox(e){
  if(e&&e.target&&e.target.tagName==='IMG'&&e.target.id==='lb-img')return;
  const lb=document.getElementById('load-lightbox');
  if(lb)lb.style.display='none';
}
// סגירה ב-Escape
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    const lb=document.getElementById('load-lightbox');
    if(lb&&lb.style.display==='flex')lb.style.display='none';
    const m=document.getElementById('load-modal');
    if(m&&m.style.display==='flex')closeLoadModal();
  }
});

// ============ ייצוא לאקסל (CSV) ============
function exportLoads(){
  if(!loads.length){cpAlert('אין רשומות לייצוא',{type:'info'});return;}
  const headers=['סוג רשומה','תאריך חשבונית','שעת חשבונית','תאריך ביצוע','שעת ביצוע','חנות','מזהה שחקן','שם השחקן','סוג טעינה','עלות לחנות (₪)','מחיר ששילמתי (₪)','הרווח שלי (₪)','סטטוס','שם קובץ אישור','קישור לקובץ'];
  const rows=loads.map(function(o){
    const isRefund=o.mode==='refund';
    const profit=Number(o.myPrice)-Number(o.storeCost);
    return [
      isRefund?'מבוטל':'טעינה',
      o.invoiceDate||'',
      o.invoiceTime||'',
      o.executionDate||'',
      o.executionTime||'',
      o.storeName||'',
      o.playerId||'',
      o.playerName||'',
      o.type||'',
      Number(o.storeCost).toFixed(2),
      Number(o.myPrice).toFixed(2),
      profit.toFixed(2),
      isRefund?'מבוטל':(o.hasFile?'הושלם':'ממתין לאישור'),
      o.fileName||'',
      o.fileUrl&&!o.fileLocal?o.fileUrl:''
    ];
  });
  // שורת סיכום נטו
  const adds=loads.filter(o=>o.mode!=='refund');
  const refunds=loads.filter(o=>o.mode==='refund');
  const totalCostAdd=adds.reduce((s,o)=>s+Math.abs(Number(o.storeCost)),0);
  const totalPaidAdd=adds.reduce((s,o)=>s+Math.abs(Number(o.myPrice)),0);
  const totalCostRefund=refunds.reduce((s,o)=>s+Math.abs(Number(o.storeCost)),0);
  const totalPaidRefund=refunds.reduce((s,o)=>s+Math.abs(Number(o.myPrice)),0);
  const netCost=totalCostAdd-totalCostRefund;
  const netPaid=totalPaidAdd-totalPaidRefund;
  const netProfit=netPaid-netCost;
  rows.push(['','','','','','','','','','','','','','','']);
  rows.push(['סיכום טעינות','','','','','','','','',totalCostAdd.toFixed(2),totalPaidAdd.toFixed(2),(totalPaidAdd-totalCostAdd).toFixed(2),'','','']);
  rows.push(['סיכום ביטולים','','','','','','','','',(-totalCostRefund).toFixed(2),(-totalPaidRefund).toFixed(2),(-(totalPaidRefund-totalCostRefund)).toFixed(2),'','','']);
  rows.push(['סה"כ נטו','','','','','','','','',netCost.toFixed(2),netPaid.toFixed(2),netProfit.toFixed(2),'','','']);

  function esc(v){
    v=String(v==null?'':v);
    if(/[",\n]/.test(v))return '"'+v.replace(/"/g,'""')+'"';
    return v;
  }
  const csv='\uFEFF'+[headers].concat(rows).map(function(r){return r.map(esc).join(',');}).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const d=new Date();
  const fname='טעינות_'+d.getFullYear()+'-'+lpad(d.getMonth()+1)+'-'+lpad(d.getDate())+'.csv';
  const a=document.createElement('a');
  a.href=url;a.download=fname;
  document.body.appendChild(a);a.click();
  setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},100);
}
// אתחול ראשוני - בעת מעבר לטאב הזמנות
document.body.classList.add('loadview-store');
function syncLoadsFromFirebase(){
  if(!window.fbOK||!window.db)return;
  showLoadsSyncStatus('syncing');
  window.db.collection('cashphone').doc('main').get().then(function(doc){
    if(doc.exists&&doc.data()&&doc.data().loads){
      loads=doc.data().loads||[];
      try{localStorage.setItem(LOADS_KEY,JSON.stringify(loads));}catch(e){}
      if(typeof renderLoads==='function')renderLoads();
    }
    showLoadsSyncStatus('synced');
  }).catch(function(){showLoadsSyncStatus('error');});
}
// טעינה ראשונית כשהטאב נפתח
const _origATab=window.aTab;
if(typeof _origATab==='function'){
  window.aTab=function(btn,sec){
    _origATab(btn,sec);
    if(sec==='sec-orders'){
      renderLoads();
      syncLoadsFromFirebase();
    }
  };
}else{
  setTimeout(()=>{try{renderLoads();syncLoadsFromFirebase();}catch(e){}},500);
}

