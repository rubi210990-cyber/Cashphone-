
// CashPhone v2.19

// ============================================================
// 🔐 הגדרות אבטחה — סיסמת ברירת מחדל (מוחלפת ע"י Firestore)
// ============================================================
const ADMIN_PASS_DEFAULT = 'cashphone2026!'; // ← ברירת מחדל בלבד
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// סיסמה אקטיבית — מתעדכנת מ-Firestore
Object.defineProperty(window, 'ADMIN_PASS', {
  get: function(){ return window._runtimeAdminPass || ADMIN_PASS_DEFAULT; },
  configurable: true
});

// Rate Limiting — מונע brute force
const _loginAttempts = {};
function _checkRateLimit(username) {
  const key = 'rl_' + username;
  const now = Date.now();
  if (!_loginAttempts[key]) _loginAttempts[key] = { count: 0, firstAttempt: now, locked: false };
  const r = _loginAttempts[key];
  // אם עברו 15 דקות — אפס
  if (now - r.firstAttempt > LOCKOUT_MINUTES * 60 * 1000) {
    _loginAttempts[key] = { count: 0, firstAttempt: now, locked: false };
    return { allowed: true };
  }
  if (r.locked) {
    const remaining = Math.ceil((LOCKOUT_MINUTES * 60 * 1000 - (now - r.firstAttempt)) / 60000);
    return { allowed: false, remaining };
  }
  return { allowed: true };
}
function _recordFailedAttempt(username) {
  const key = 'rl_' + username;
  if (!_loginAttempts[key]) _loginAttempts[key] = { count: 0, firstAttempt: Date.now(), locked: false };
  _loginAttempts[key].count++;
  if (_loginAttempts[key].count >= MAX_LOGIN_ATTEMPTS) {
    _loginAttempts[key].locked = true;
  }
}
function _resetAttempts(username) {
  delete _loginAttempts['rl_' + username];
}
// ============================================================

// === Block #1 ===
window.fbOK=false;
window.db=null;
function initFirebase(){
  if(typeof firebase==='undefined'){
    console.warn('Firebase library not loaded yet');
    return false;
  }
  try{
    if(!firebase.apps||firebase.apps.length===0){
      firebase.initializeApp({
        apiKey:"AIzaSyAmNoezMbw6o3fbb-r-rXYxyw8x1YUSnPU",
        authDomain:"cashphone-467f1.firebaseapp.com",
        projectId:"cashphone-467f1",
        storageBucket:"cashphone-467f1.firebasestorage.app",
        messagingSenderId:"466813177755",
        appId:"1:466813177755:web:d04dde33428423b0145b3e"
      });
    }
    window.db=firebase.firestore();
    window.fbOK=true;
    console.log('✅ Firebase ready');
    // טעינת סיסמת אדמין מ-Firestore (אם שונתה)
    setTimeout(function(){
      try{
        window.db.collection('cashphone').doc('main').get().then(function(doc){
          if(doc.exists && doc.data().adminPass){
            window._runtimeAdminPass = doc.data().adminPass;
            console.log('🔑 סיסמת אדמין נטענה מ-Firestore');
          }
        });
      }catch(e){}
    }, 1000);
    return true;
  }catch(e){
    console.warn('Firebase init failed:',e);
    window.db=null;
    window.fbOK=false;
    return false;
  }
}
// ניסיון ראשון מיידי
initFirebase();
// אם נכשל, ננסה שוב כמה פעמים (אולי הסקריפטים עדיין נטענים)
if(!window.fbOK){
  let retries=0;
  const retryInterval=setInterval(function(){
    retries++;
    if(initFirebase()||retries>=10){
      clearInterval(retryInterval);
      // אם עדיין נכשל אחרי 10 ניסיונות, נעדכן את האדמין
      if(!window.fbOK){
        console.error('⛔ Firebase לא זמין - הנתונים נשמרים רק במכשיר הזה');
        // נציג הודעה אחרי שהדף נטען
        setTimeout(function(){
          if(typeof currentUser!=='undefined'&&currentUser&&currentUser.role==='admin'){
            const warn=document.createElement('div');
            warn.id='fb-offline-warn';
            warn.innerHTML='<div style="position:fixed;top:10px;left:10px;right:10px;max-width:500px;margin:0 auto;background:#3a1a1a;border:1px solid #e24b4a;border-radius:10px;padding:10px 14px;z-index:9998;color:#fff;font-size:12px;direction:rtl;text-align:center;">⚠️ <b>אין חיבור לענן</b> — הנתונים שלך נשמרים רק במכשיר הזה. סגור והפעל מחדש את הדפדפן או רענן (Ctrl+Shift+R).<button onclick="this.parentElement.parentElement.remove()" style="background:#e24b4a;color:#fff;border:none;border-radius:6px;padding:4px 10px;margin-right:10px;cursor:pointer;font-family:inherit;font-size:12px;">סגור</button></div>';
            document.body.appendChild(warn);
          }
        },3000);
      }
    }
  },500);
}

// === Block #2 ===
// ============================================================
// ============ 💬 מערכת דיאלוגים אחידה (cpDialog) ============
// ============================================================
// מחליפה את alert/confirm/prompt של הדפדפן במודאלים יפים.
// כל הפונקציות מחזירות Promise — להשתמש עם await.
//
// דוגמאות:
//   await cpAlert('הפעולה הצליחה');
//   await cpAlert('שגיאה!', {type:'error'});
//   if(await cpConfirm('למחוק?', {type:'danger'})) doDelete();
//   const name = await cpPrompt('שם חדש:', {default:'אבי'});
//   if(name===null) return; // ביטול
// ============================================================
(function(){
  const ICONS={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️',question:'❓',danger:'🗑️'};
  const TITLES={success:'הצלחה',error:'שגיאה',warning:'שימו לב',info:'הודעה',question:'אישור',danger:'אישור מחיקה'};

  function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  // משתמש בstack כדי לתמוך בכמה דיאלוגים בו-זמנית (נדיר אבל קורה)
  const _stack=[];

  function _close(overlay,resolve,value){
    if(!overlay||overlay._closed)return;
    overlay._closed=true;
    overlay.classList.add('cpd-closing');
    const idx=_stack.indexOf(overlay);
    if(idx>=0)_stack.splice(idx,1);
    setTimeout(()=>{
      try{overlay.remove();}catch(e){}
      // אם זה הדיאלוג האחרון, החזר scroll ל-body
      if(_stack.length===0)document.body.style.overflow='';
      resolve(value);
    },120);
  }

  function _build(opts){
    const type=opts.type||'info';
    const icon=opts.icon!==undefined?opts.icon:ICONS[type]||ICONS.info;
    const title=opts.title!==undefined?opts.title:TITLES[type]||'הודעה';

    const overlay=document.createElement('div');
    overlay.className='cpd-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');

    const box=document.createElement('div');
    box.className='cpd-box cpd-'+type;
    overlay.appendChild(box);

    // Header
    const header=document.createElement('div');
    header.className='cpd-header';
    if(icon){
      const iconEl=document.createElement('div');
      iconEl.className='cpd-icon';
      iconEl.textContent=icon;
      header.appendChild(iconEl);
    }
    const titleEl=document.createElement('div');
    titleEl.className='cpd-title';
    titleEl.textContent=title;
    header.appendChild(titleEl);
    if(opts.showClose!==false){
      const closeBtn=document.createElement('button');
      closeBtn.className='cpd-close';
      closeBtn.innerHTML='×';
      closeBtn.setAttribute('aria-label','סגור');
      closeBtn.type='button';
      closeBtn._isCloseBtn=true;
      header.appendChild(closeBtn);
    }
    box.appendChild(header);

    // Body
    const body=document.createElement('div');
    body.className='cpd-body';
    if(opts.message){
      // תומך גם ב-HTML וגם בטקסט פשוט
      if(opts.html)body.innerHTML=opts.message;
      else body.textContent=opts.message;
    }else{
      body.classList.add('cpd-empty');
    }
    box.appendChild(body);

    return {overlay,box,body,header};
  }

  function _attachAndShow(overlay){
    document.body.appendChild(overlay);
    document.body.style.overflow='hidden';
    _stack.push(overlay);
  }

  // ============ cpAlert ============
  // הצגת הודעה עם כפתור OK יחיד
  window.cpAlert=function(message,opts){
    opts=opts||{};
    return new Promise(resolve=>{
      const built=_build({
        type:opts.type||'info',
        title:opts.title,
        icon:opts.icon,
        message:message,
        html:opts.html,
        showClose:opts.showClose
      });
      const {overlay,box}=built;

      const actions=document.createElement('div');
      actions.className='cpd-actions';
      const okBtn=document.createElement('button');
      okBtn.type='button';
      okBtn.className='cpd-btn cpd-btn-primary';
      okBtn.textContent=opts.okText||'אישור';
      actions.appendChild(okBtn);
      box.appendChild(actions);

      const close=()=>_close(overlay,resolve,true);
      okBtn.addEventListener('click',close);
      const closeBtn=overlay.querySelector('.cpd-close');
      if(closeBtn)closeBtn.addEventListener('click',close);
      overlay.addEventListener('click',e=>{if(e.target===overlay&&opts.dismissOnBackdrop!==false)close();});
      overlay.addEventListener('keydown',e=>{
        if(e.key==='Escape'){e.stopPropagation();close();}
        if(e.key==='Enter'&&document.activeElement!==closeBtn){e.preventDefault();close();}
      });

      _attachAndShow(overlay);
      setTimeout(()=>okBtn.focus(),50);
    });
  };

  // ============ cpConfirm ============
  // שאלת כן/לא — מחזיר true / false
  window.cpConfirm=function(message,opts){
    opts=opts||{};
    return new Promise(resolve=>{
      const type=opts.type||'question';
      const built=_build({
        type:type,
        title:opts.title,
        icon:opts.icon,
        message:message,
        html:opts.html,
        showClose:opts.showClose
      });
      const {overlay,box}=built;

      const actions=document.createElement('div');
      actions.className='cpd-actions';

      const cancelBtn=document.createElement('button');
      cancelBtn.type='button';
      cancelBtn.className='cpd-btn cpd-btn-secondary';
      cancelBtn.textContent=opts.cancelText||'ביטול';

      const okBtn=document.createElement('button');
      okBtn.type='button';
      okBtn.className='cpd-btn '+(type==='danger'?'cpd-btn-danger':type==='warning'?'cpd-btn-warning':'cpd-btn-primary');
      okBtn.textContent=opts.okText||(type==='danger'?'מחק':'אישור');

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(actions);

      const closeWith=v=>_close(overlay,resolve,v);
      okBtn.addEventListener('click',()=>closeWith(true));
      cancelBtn.addEventListener('click',()=>closeWith(false));
      const closeBtn=overlay.querySelector('.cpd-close');
      if(closeBtn)closeBtn.addEventListener('click',()=>closeWith(false));
      overlay.addEventListener('click',e=>{if(e.target===overlay&&opts.dismissOnBackdrop!==false)closeWith(false);});
      overlay.addEventListener('keydown',e=>{
        if(e.key==='Escape'){e.stopPropagation();closeWith(false);}
        if(e.key==='Enter'){e.preventDefault();closeWith(true);}
      });

      _attachAndShow(overlay);
      setTimeout(()=>{
        // ב-danger מתחילים על cancel כברירת מחדל לבטיחות
        if(type==='danger')cancelBtn.focus();
        else okBtn.focus();
      },50);
    });
  };

  // ============ cpPrompt ============
  // קלט טקסט/מספר — מחזיר string או null אם בוטל
  // opts.type: 'text' | 'number' | 'textarea'
  // opts.validate: function(value) -> string error message or null/empty if valid
  window.cpPrompt=function(message,opts){
    opts=opts||{};
    return new Promise(resolve=>{
      const built=_build({
        type:opts.dialogType||'info',
        title:opts.title,
        icon:opts.icon!==undefined?opts.icon:'✏️',
        message:message,
        html:opts.html,
        showClose:opts.showClose
      });
      const {overlay,box,body}=built;
      body.classList.remove('cpd-empty');

      // הוסף שדה קלט אחרי ההודעה
      const inputType=opts.inputType||'text';
      const input=document.createElement(inputType==='textarea'?'textarea':'input');
      input.className='cpd-input'+(inputType==='textarea'?' cpd-textarea':'');
      if(inputType!=='textarea')input.type=inputType==='number'?'number':'text';
      if(opts.placeholder)input.placeholder=opts.placeholder;
      if(opts.default!==undefined&&opts.default!==null)input.value=opts.default;
      if(opts.maxLength)input.maxLength=opts.maxLength;
      if(inputType==='number'){
        if(opts.min!==undefined)input.min=opts.min;
        if(opts.max!==undefined)input.max=opts.max;
        if(opts.step!==undefined)input.step=opts.step;
        input.setAttribute('inputmode','decimal');
      }
      body.appendChild(input);

      const errEl=document.createElement('div');
      errEl.className='cpd-input-error';
      body.appendChild(errEl);

      const actions=document.createElement('div');
      actions.className='cpd-actions';
      const cancelBtn=document.createElement('button');
      cancelBtn.type='button';
      cancelBtn.className='cpd-btn cpd-btn-secondary';
      cancelBtn.textContent=opts.cancelText||'ביטול';
      const okBtn=document.createElement('button');
      okBtn.type='button';
      okBtn.className='cpd-btn cpd-btn-primary';
      okBtn.textContent=opts.okText||'אישור';
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(actions);

      const submit=()=>{
        const val=input.value;
        if(opts.validate){
          const err=opts.validate(val);
          if(err){
            errEl.textContent=err;
            errEl.classList.add('on');
            input.focus();
            return;
          }
        }
        if(opts.required&&!String(val).trim()){
          errEl.textContent=opts.requiredMsg||'שדה חובה';
          errEl.classList.add('on');
          input.focus();
          return;
        }
        _close(overlay,resolve,val);
      };
      const cancel=()=>_close(overlay,resolve,null);

      okBtn.addEventListener('click',submit);
      cancelBtn.addEventListener('click',cancel);
      const closeBtn=overlay.querySelector('.cpd-close');
      if(closeBtn)closeBtn.addEventListener('click',cancel);
      overlay.addEventListener('click',e=>{if(e.target===overlay&&opts.dismissOnBackdrop!==false)cancel();});
      input.addEventListener('input',()=>{if(errEl.classList.contains('on'))errEl.classList.remove('on');});
      overlay.addEventListener('keydown',e=>{
        if(e.key==='Escape'){e.stopPropagation();cancel();}
        if(e.key==='Enter'&&inputType!=='textarea'){e.preventDefault();submit();}
      });

      _attachAndShow(overlay);
      setTimeout(()=>{
        input.focus();
        if(input.select)try{input.select();}catch(e){}
      },50);
    });
  };

  // ============ cpToast ============
  // טוסט עליון צף — לא חוסם, נעלם אוטומטית
  // שונה מ-toast() הקיים שדורש id של אלמנט בעמוד
  window.cpToast=function(message,opts){
    opts=opts||{};
    const type=opts.type||'success';
    const duration=opts.duration||2500;
    const colors={
      success:{bg:'linear-gradient(135deg,#39e600,#2ab800)',color:'#000'},
      error:{bg:'linear-gradient(135deg,#e24b4a,#b83332)',color:'#fff'},
      warning:{bg:'linear-gradient(135deg,#ef9f27,#d18215)',color:'#000'},
      info:{bg:'linear-gradient(135deg,#4a9eff,#2d7dd2)',color:'#fff'}
    };
    const c=colors[type]||colors.success;
    const t=document.createElement('div');
    t.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-20px);background:'+c.bg+';color:'+c.color+';padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,0.3);z-index:10001;font-family:inherit;direction:rtl;max-width:90vw;text-align:center;opacity:0;transition:all .25s ease;pointer-events:none;';
    t.textContent=message;
    document.body.appendChild(t);
    requestAnimationFrame(()=>{
      t.style.opacity='1';
      t.style.transform='translateX(-50%) translateY(0)';
    });
    setTimeout(()=>{
      t.style.opacity='0';
      t.style.transform='translateX(-50%) translateY(-20px)';
      setTimeout(()=>{try{t.remove();}catch(e){}},250);
    },duration);
  };
})();

// ============ DATA ============
const CATS={games:'משחקים',mobile:'משחקי מובייל',console:'כרטיסי טעינה',wallet:'ארנקים דיגיטליים',gift:'גיפט קארד'};

// ============================================================
// ============ 🌐 מערכת תרגום (i18n) ============
// ============================================================
// תרגום למסכי לקוח בלבד (חנות).
// אדמין/משווק נשארים בעברית.
//
// שימוש:
//   t('login.welcome')     - מחזיר טקסט בשפה הנוכחית
//   setLang('ar')          - מעבר לערבית
//   setLang('he')          - חזרה לעברית
//   currentLang()          - מחזיר 'he' או 'ar'
// ============================================================

var i18n={
  he:{
    // נאב
    'nav.store':'🛒 חנות',
    'nav.orders':'📋 הזמנות',
    'nav.credit':'💳 קרדיט',
    'nav.margin':'💰 רווחים',
    'nav.logout':'יציאה',
    // עמוד חנות
    'store.categories.all':'הכל',
    'store.categories.games':'משחקים',
    'store.categories.mobile':'משחקי מובייל',
    'store.categories.console':'כרטיסי טעינה',
    'store.categories.wallet':'ארנקים דיגיטליים',
    'store.categories.gift':'גיפט קארד',
    'store.from_price':'מ-',
    'store.no_credit':'אין קרדיט',
    'store.out_of_stock':'אזל זמנית',
    'store.out':'אזל',
    'store.search':'חיפוש מוצר...',
    'store.no_credit_msg':'אין לך מספיק קרדיט להזמין מוצרים. פנה לאדמין לטעינת קרדיט.',
    // מודאל הזמנה
    'modal.pick_amount':'— בחר כמות',
    'modal.player_id':'הכנס ID שחקן',
    'modal.note_placeholder':'פלטפורמה, מדינה...',
    'modal.note_label':'הערה (אופציונלי)',
    'modal.cost':'עלות (תשלום לי)',
    'modal.balance_after':'יתרה אחרי',
    'modal.verify_btn':'בדוק ✓',
    'modal.confirm_btn':'אשר הזמנה',
    'modal.terms_title':'⚠️ תקנון — חובה לקרוא',
    'modal.terms_1':'לאחר ביצוע הטעינה — לא ניתן לבטל את העסקה',
    'modal.terms_2':'הלקוח אחראי על הכנסת ID נכון',
    'modal.terms_3':'הטעינה מתבצעת לחשבון המשחק בלבד',
    'modal.terms_4':'CASHPHONE לא אחראית לחשבונות שגויים',
    'modal.terms_check':'קראתי ואני מסכים לתקנון',
    'modal.cost_tooltip_buy':'קניה: ₪',
    'modal.cost_tooltip_profit':' · רווח: ₪',
    // הזמנה התקבלה
    'success.title':'ההזמנה התקבלה!',
    // הזמנות שלי
    'orders.title':'ההזמנות שלי',
    'orders.search':'חיפוש לפי שחקן/מוצר...',
    'orders.status.new':'⏱ ממתין',
    'orders.status.done':'✓ בוצע',
    'orders.empty':'אין הזמנות עדיין',
    'orders.columns.product':'מוצר',
    'orders.columns.player':'שחקן',
    'orders.columns.price':'מחיר',
    'orders.columns.status':'סטטוס',
    'orders.columns.time':'זמן',
    // קרדיט שלי
    'credit.title':'הקרדיט שלי',
    'credit.balance':'יתרה נוכחית',
    'credit.limit':'מסגרת',
    'credit.unpaid':'חוב פתוח',
    'credit.history':'תנועות אחרונות',
    'credit.empty':'אין תנועות עדיין',
    // רווחים
    'margin.title':'💰 קביעת רווח אוטומטי',
    'margin.intro':'בחר רווח קבוע (₪) או באחוזים (%) — והמערכת תחשב את כל המחירים שלך אוטומטית',
    'margin.scope':'📦 על מה להחיל?',
    'margin.scope.all':'🌍 כל המוצרים',
    'margin.scope.prod':'🎯 מוצר ספציפי',
    'margin.pick_product':'בחר מוצר',
    'margin.type':'💵 סוג חישוב',
    'margin.type.pct':'📊 אחוזים %',
    'margin.type.fixed':'💵 רווח קבוע ₪',
    'margin.value_pct':'📈 אחוז רווח (%)',
    'margin.value_fixed':'💵 רווח קבוע (₪)',
    'margin.shortcuts':'⚡ קיצורי דרך',
    'margin.preview':'👁️ תצוגה מקדימה',
    'margin.reset_btn':'🔄 אפס למחירי בסיס',
    'margin.apply_btn':'✓ החל',
    'margin.current_title':'📋 המחירים שלך עכשיו',
    // הודעות / כפתורים כלליים
    'common.ok':'אישור',
    'common.cancel':'ביטול',
    'common.save':'שמור',
    'common.delete':'מחק',
    'common.edit':'ערוך',
    'common.close':'סגור',
    'common.yes':'כן',
    'common.no':'לא',
    'common.confirm':'אישור',
    'common.error':'שגיאה',
    'common.success':'הצלחה',
    'common.warning':'שימו לב',
    'common.info':'הודעה',
    'common.loading':'טוען...',
    'common.balance':'יתרה',
    'common.credit':'קרדיט',
    'common.price':'מחיר',
    'common.amount':'סכום',
    'common.required':'שדה חובה',
    'common.optional':'(אופציונלי)',
    // הזמנה שגויה
    'order.id_missing':'הכנס ID שחקן קודם',
    'order.terms_required':'יש לאשר את התקנון לפני ההזמנה',
    'order.no_balance':'אין לך מספיק קרדיט',
    // התראות
    'notif.title':'התראות',
    'notif.empty':'אין התראות עדיין',
    'notif.mark_all_read':'סמן הכל כנקרא',
    'notif.clear':'נקה',
  },
  ar:{
    // نافبار
    'nav.store':'🛒 المتجر',
    'nav.orders':'📋 الطلبات',
    'nav.credit':'💳 الرصيد',
    'nav.margin':'💰 الأرباح',
    'nav.logout':'تسجيل خروج',
    // صفحة المتجر
    'store.categories.all':'الكل',
    'store.categories.games':'ألعاب',
    'store.categories.mobile':'ألعاب الجوال',
    'store.categories.console':'بطاقات شحن',
    'store.categories.wallet':'محافظ رقمية',
    'store.categories.gift':'بطاقات هدايا',
    'store.from_price':'من ',
    'store.no_credit':'لا يوجد رصيد',
    'store.out_of_stock':'نفد مؤقتًا',
    'store.out':'نفد',
    'store.search':'بحث عن منتج...',
    'store.no_credit_msg':'ليس لديك رصيد كافٍ لطلب المنتجات. تواصل مع المسؤول لشحن الرصيد.',
    // مودال الطلب
    'modal.pick_amount':' — اختر الكمية',
    'modal.player_id':'أدخل ID اللاعب',
    'modal.note_placeholder':'المنصة، الدولة...',
    'modal.note_label':'ملاحظة (اختياري)',
    'modal.cost':'التكلفة (الدفع لي)',
    'modal.balance_after':'الرصيد بعد العملية',
    'modal.verify_btn':'تحقق ✓',
    'modal.confirm_btn':'تأكيد الطلب',
    'modal.terms_title':'⚠️ الشروط — يجب القراءة',
    'modal.terms_1':'بعد إتمام الشحن — لا يمكن إلغاء العملية',
    'modal.terms_2':'العميل مسؤول عن إدخال ID صحيح',
    'modal.terms_3':'الشحن يتم لحساب اللعبة فقط',
    'modal.terms_4':'CASHPHONE غير مسؤولة عن الحسابات الخاطئة',
    'modal.terms_check':'قرأت وأوافق على الشروط',
    'modal.cost_tooltip_buy':'الشراء: ₪',
    'modal.cost_tooltip_profit':' · الربح: ₪',
    // الطلب تم
    'success.title':'تم استلام الطلب!',
    // طلباتي
    'orders.title':'طلباتي',
    'orders.search':'بحث حسب اللاعب/المنتج...',
    'orders.status.new':'⏱ بالانتظار',
    'orders.status.done':'✓ تم',
    'orders.empty':'لا توجد طلبات بعد',
    'orders.columns.product':'المنتج',
    'orders.columns.player':'اللاعب',
    'orders.columns.price':'السعر',
    'orders.columns.status':'الحالة',
    'orders.columns.time':'الوقت',
    // الرصيد
    'credit.title':'رصيدي',
    'credit.balance':'الرصيد الحالي',
    'credit.limit':'الحد الأقصى',
    'credit.unpaid':'الديون المفتوحة',
    'credit.history':'العمليات الأخيرة',
    'credit.empty':'لا توجد عمليات بعد',
    // الأرباح
    'margin.title':'💰 تحديد الأرباح تلقائيًا',
    'margin.intro':'اختر ربحًا ثابتًا (₪) أو بالنسبة المئوية (%) — والنظام سيحسب جميع أسعارك تلقائيًا',
    'margin.scope':'📦 على ماذا تطبق؟',
    'margin.scope.all':'🌍 جميع المنتجات',
    'margin.scope.prod':'🎯 منتج محدد',
    'margin.pick_product':'اختر منتجًا',
    'margin.type':'💵 نوع الحساب',
    'margin.type.pct':'📊 نسبة مئوية %',
    'margin.type.fixed':'💵 ربح ثابت ₪',
    'margin.value_pct':'📈 نسبة الربح (%)',
    'margin.value_fixed':'💵 ربح ثابت (₪)',
    'margin.shortcuts':'⚡ اختصارات',
    'margin.preview':'👁️ معاينة',
    'margin.reset_btn':'🔄 إعادة للأسعار الأساسية',
    'margin.apply_btn':'✓ تطبيق',
    'margin.current_title':'📋 أسعارك الحالية',
    // عام
    'common.ok':'موافق',
    'common.cancel':'إلغاء',
    'common.save':'حفظ',
    'common.delete':'حذف',
    'common.edit':'تعديل',
    'common.close':'إغلاق',
    'common.yes':'نعم',
    'common.no':'لا',
    'common.confirm':'تأكيد',
    'common.error':'خطأ',
    'common.success':'نجاح',
    'common.warning':'تنبيه',
    'common.info':'معلومة',
    'common.loading':'جاري التحميل...',
    'common.balance':'الرصيد',
    'common.credit':'الرصيد',
    'common.price':'السعر',
    'common.amount':'المبلغ',
    'common.required':'حقل إلزامي',
    'common.optional':'(اختياري)',
    // أخطاء الطلب
    'order.id_missing':'أدخل ID اللاعب أولاً',
    'order.terms_required':'يجب الموافقة على الشروط قبل الطلب',
    'order.no_balance':'ليس لديك رصيد كافٍ',
    // تنبيهات
    'notif.title':'التنبيهات',
    'notif.empty':'لا توجد تنبيهات بعد',
    'notif.mark_all_read':'وضع علامة مقروء للكل',
    'notif.clear':'مسح',
  }
};

// קבלת השפה הנוכחית (ברירת מחדל: עברית)
function currentLang(){
  try{return localStorage.getItem('cp_lang')||'he';}catch(e){return 'he';}
}

// פונקציית תרגום ראשית
function t(key){
  var lang=currentLang();
  var dict=i18n[lang]||i18n.he;
  return dict[key]||i18n.he[key]||key;
}

// החלפת שפה - שומר ב-localStorage ומרענן את העמוד
function setLang(lang){
  if(lang!=='he'&&lang!=='ar')return;
  try{localStorage.setItem('cp_lang',lang);}catch(e){}
  // עדכון מאפייני HTML
  document.documentElement.setAttribute('lang',lang);
  document.documentElement.setAttribute('dir','rtl'); // שתי השפות RTL
  // החל את התרגום על האלמנטים שמסומנים ב-data-i18n
  applyTranslations();
  // עדכון כפתור החלפת השפה (להציג את השפה השנייה)
  updateLangButton();
  // רענון תצוגות חיות
  if(typeof renderStoreFront==='function'){
    var storePage=document.getElementById('page-store');
    if(storePage&&storePage.classList.contains('on'))try{renderStoreFront();}catch(e){}
  }
  if(typeof renderMyOrders==='function'){
    var ordersPage=document.getElementById('page-my-orders');
    if(ordersPage&&ordersPage.classList.contains('on'))try{renderMyOrders();}catch(e){}
  }
  if(typeof renderMyCredit==='function'){
    var creditPage=document.getElementById('page-my-credit');
    if(creditPage&&creditPage.classList.contains('on'))try{renderMyCredit();}catch(e){}
  }
  if(typeof renderMarginPage==='function'){
    var marginPage=document.getElementById('page-margin');
    if(marginPage&&marginPage.classList.contains('on'))try{renderMarginPage();}catch(e){}
  }
  // עדכון tabs בנאב
  if(typeof buildNav==='function')try{buildNav();}catch(e){}
}

// Toggle בין השפות
function toggleLanguage(){
  setLang(currentLang()==='he'?'ar':'he');
}

// עדכון הטקסט בכפתור השפה (להציג את השפה שאליה אפשר לעבור)
function updateLangButton(){
  var btn=document.getElementById('nav-lang-btn');
  var txt=document.getElementById('nav-lang-text');
  if(!btn||!txt)return;
  if(currentLang()==='he'){
    txt.textContent='عربي';
  }else{
    txt.textContent='עברית';
  }
}

// החלת תרגומים על אלמנטים סטטיים בעמוד (data-i18n="key")
function applyTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(function(el){
    var key=el.getAttribute('data-i18n');
    if(key)el.textContent=t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){
    var key=el.getAttribute('data-i18n-placeholder');
    if(key)el.setAttribute('placeholder',t(key));
  });
}
const TIERS={vip:{l:'VIP',b:'b-vip',pct:-15},good:{l:'טוב',b:'b-ok',pct:-7},normal:{l:'רגיל',b:'b-normal',pct:0},high:{l:'גבוה',b:'b-high',pct:10},max:{l:'מקס',b:'b-high',pct:20},custom:{l:'מותאם',b:'b-normal',pct:0}};

// ========== שער דולר ==========
let dollarRate = 2.98; // שער נוכחי — מתעדכן אוטומטית
let dollarLastUpdate = null;

async function fetchDollarRate(){
  try{
    // נסה API ראשון
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    if(data && data.rates && data.rates.ILS){
      dollarRate = parseFloat(data.rates.ILS.toFixed(2));
      dollarLastUpdate = new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
      updateDollarDisplay();
      return;
    }
  }catch(e){}
  try{
    // נסה API שני
    const res2 = await fetch('https://open.er-api.com/v6/latest/USD');
    const data2 = await res2.json();
    if(data2 && data2.rates && data2.rates.ILS){
      dollarRate = parseFloat(data2.rates.ILS.toFixed(2));
      dollarLastUpdate = new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
      updateDollarDisplay();
      return;
    }
  }catch(e){}
  try{
    // נסה API שלישי
    const res3 = await fetch('https://api.frankfurter.app/latest?from=USD&to=ILS');
    const data3 = await res3.json();
    if(data3 && data3.rates && data3.rates.ILS){
      dollarRate = parseFloat(data3.rates.ILS.toFixed(2));
      dollarLastUpdate = new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
      updateDollarDisplay();
    }
  }catch(e){
    console.log('כל ה-APIs נכשלו — שומר על שער קיים');
  }
}

// עדכן מחירי כל החנויות לפי שער הדולר הנוכחי
function updateAllStorePrices(){
  stores.forEach(s=>{
    const newPrices = makePrices(s.tier||'normal');
    // שמור מחירים שהוגדרו ידנית (שונים מברירת המחדל הישנה)
    s.prices = newPrices;
  });
  saveData();
  renderStoreFront();
  toast('t-admin','✅ מחירי כל החנויות עודכנו לפי שער ₪'+dollarRate);
}

// עדכון אוטומטי בחצות כל לילה
function scheduleMidnightUpdate(){
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24,0,0,0); // חצות הלילה הבא
  const msUntilMidnight = midnight - now;
  setTimeout(async ()=>{
    console.log('עדכון חצות אוטומטי...');
    await fetchDollarRate();
    updateAllStorePrices();
    // קבע עדכון לחצות הבא (כל 24 שעות)
    setInterval(async ()=>{
      await fetchDollarRate();
      updateAllStorePrices();
    }, 24*60*60*1000);
  }, msUntilMidnight);
  console.log(`עדכון אוטומטי מתוכנן בעוד ${Math.round(msUntilMidnight/1000/60)} דקות`);
}

function updateDollarDisplay(){
  const el = document.getElementById('dollar-rate-display');
  if(el) el.textContent = `$1 = ₪${dollarRate} ${dollarLastUpdate?'(עודכן '+dollarLastUpdate+')':''}`;
  const el2 = document.getElementById('dollar-rate-display2');
  if(el2) el2.textContent = `$1 = ₪${dollarRate}`;
  // אם עורך המחירים פתוח, רענן את הטבלה כדי לעדכן את עמודת ₪
  const ptable=document.getElementById('price-table');
  if(ptable&&ptable.innerHTML&&typeof renderPTable==='function'){
    try{renderPTable();}catch(e){}
  }
}

// כל המוצרים ב-$ — כפל בשער הדולר
function getBasePrice(prod, pkg){
  if(prod.usd){
    return Math.round(pkg.p * dollarRate);
  }
  return pkg.p;
}

// ============ עלות בדולרים (המחיר ששילמת לספק) ============
// מבנה: { "1_20": 4.5, "3_4.99": 4.99, ... } — מפתח: prodId_pkgKey, ערך: עלות בדולר
const HCTOPUP_COSTS = {
  "9_4": 1.11,
  "9_21": 5.59,
  "9_42": 11.2,
  "9_104": 28.01,
  "9_208": 56.02,
  "9_417": 112.04,
  "2_64": 8.67,
  "2_129": 21.66,
  "2_199": 34.66,
  "2_460": 123.6,
  "1_42": 11.31,
  "1_105": 28.27,
  "1_210": 56.53,
  "10_4": 1.17,
  "10_17": 5.85,
  "10_35": 11.7,
  "10_69": 23.4,
  "3_4.99": 5.7,
  "3_9.99": 11.67,
  "3_19.99": 17.37,
  "3_34.99": 28.78,
};

const DOLLAR_COSTS_KEY='cp_dollar_costs';
let dollarCosts={...HCTOPUP_COSTS};
try{
  const raw=localStorage.getItem(DOLLAR_COSTS_KEY);
  if(raw){const saved=JSON.parse(raw)||{};dollarCosts={...HCTOPUP_COSTS,...saved};}
}catch(e){dollarCosts={...HCTOPUP_COSTS};}

function saveDollarCosts(){
  try{localStorage.setItem(DOLLAR_COSTS_KEY,JSON.stringify(dollarCosts));}catch(e){}
  // סנכרון ל-Firebase אם קיים
  if(window.fbOK&&window.db){
    try{window.db.collection('cashphone').doc('main').set({dollarCosts:dollarCosts},{merge:true});}catch(e){}
  }
}

// קבלת עלות בדולר למוצר/חבילה — אם אין הזנה, מחשב מהמחיר הבסיסי
function getDollarCost(prod, pkg){
  const key=prod.id+'_'+pkg.p;
  if(dollarCosts[key]!=null)return dollarCosts[key];
  // ברירת מחדל: אם המוצר ב-$, החזר את pkg.p; אחרת חלק בשער הנוכחי
  if(prod.usd)return pkg.p;
  return Math.round((pkg.p/dollarRate)*100)/100;
}

// עדכון עלות בדולרים — ושמירה
function setDollarCost(prodId, pkgP, usdVal){
  const key=prodId+'_'+pkgP;
  const n=parseFloat(usdVal);
  if(isNaN(n)||n<=0){delete dollarCosts[key];}
  else{dollarCosts[key]=Math.round(n*100)/100;}
  saveDollarCosts();
}

// טעינת dollarCosts מ-Firebase כשהאתר נטען
function syncDollarCostsFromFB(){
  if(!window.fbOK||!window.db)return;
  window.db.collection('cashphone').doc('main').get().then(function(doc){
    if(doc.exists&&doc.data()&&doc.data().dollarCosts){
      dollarCosts=doc.data().dollarCosts||{};
      try{localStorage.setItem(DOLLAR_COSTS_KEY,JSON.stringify(dollarCosts));}catch(e){}
      if(typeof renderPTable==='function'&&document.getElementById('price-table'))renderPTable();
    }
  }).catch(function(){});
}
setTimeout(syncDollarCostsFromFB,1500);
const PRODS=[
  // כל המחירים ב-$ — מחושבים אוטומטית לשקלים לפי שער הדולר
  {id:1,cat:'games',name:'Roblox',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/roblox.png',emoji:'',color:'#ce0e2d',cur:'Robux',ul:'שם משתמש Roblox',usd:false,pkgs:[
    {a:'רובלוקס $10 דולר',p:42,region:'global'},
    {a:'רובלוקס $25 דולר',p:105,region:'global'},
    {a:'רובלוקס $50 דולר',p:210,region:'global'},
    {a:'🇹🇷 רובלוקס 800 Robux TR',p:18,region:'tr',note:'גלובלי לחלוטין — חוסך כ-40%'},
    {a:'🇹🇷 רובלוקס 1700 Robux TR',p:36,region:'tr',note:'גלובלי לחלוטין — חוסך כ-40%'},
    {a:'🇹🇷 רובלוקס 4500 Robux TR',p:88,region:'tr',note:'גלובלי לחלוטין — חוסך כ-45%'},
    {a:'🇹🇷 רובלוקס 10000 Robux TR',p:188,region:'tr',note:'גלובלי לחלוטין — חוסך כ-50%'},
    {a:'🇦🇷 רובלוקס 800 Robux AR',p:14,region:'ar',note:'גלובלי לחלוטין — החיסכון הגדול ביותר'},
    {a:'🇦🇷 רובלוקס 1700 Robux AR',p:28,region:'ar',note:'גלובלי לחלוטין — החיסכון הגדול ביותר'},
    {a:'🇦🇷 רובלוקס 4500 Robux AR',p:72,region:'ar',note:'גלובלי לחלוטין — החיסכון הגדול ביותר'}
  ]},
  {id:2,cat:'games',name:'Fortnite',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/fortnite.png',emoji:'',color:'#1a1a2e',cur:'V-Bucks',ul:'Epic Games ID',usd:false,pkgs:[
    {a:'1000 V-Bucks',p:64,region:'global'},
    {a:'2800 V-Bucks',p:129,region:'global'},
    {a:'5000 V-Bucks',p:199,region:'global'},
    {a:'13500 V-Bucks',p:460,region:'global'}
  ]},
  {id:3,cat:'games',name:'Valorant',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/valorant.png',emoji:'',color:'#ff4655',cur:'VP',ul:'Riot ID',usd:true,pkgs:[{a:'475 VP',p:4.99},{a:'950 VP',p:9.99},{a:'1900 VP',p:19.99},{a:'3650 VP',p:34.99}]},
  {id:4,cat:'games',name:'League of Legends',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/lol.png',emoji:'',color:'#c89b3c',cur:'RP',ul:'Riot ID',usd:true,pkgs:[{a:'650 RP',p:5},{a:'1380 RP',p:10},{a:'2800 RP',p:20},{a:'5000 RP',p:35}]},
  {id:5,cat:'games',name:'FC 25',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/fc25.png',emoji:'',color:'#0a3d62',cur:'FC Points',ul:'EA ID',usd:true,pkgs:[{a:'250 FC Points',p:4.99},{a:'500 FC Points',p:9.99},{a:'1050 FC Points',p:19.99},{a:'2200 FC Points',p:39.99}]},
  {id:6,cat:'games',name:'Minecraft',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/minecraft.png',emoji:'',color:'#5d7c15',cur:'Minecoins',ul:'Microsoft Email',usd:true,pkgs:[{a:'320 Minecoins',p:1.99},{a:'1720 Minecoins',p:9.99},{a:'4320 Minecoins',p:24.99}]},
  {id:7,cat:'games',name:'Apex Legends',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/apex.png',emoji:'',color:'#cd3333',cur:'Apex Coins',ul:'EA ID',usd:true,pkgs:[{a:'1000 AC',p:9.99},{a:'2150 AC',p:19.99},{a:'4350 AC',p:39.99},{a:'6700 AC',p:59.99}]},
  {id:8,cat:'games',name:'Genshin Impact',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/genshin.png',emoji:'',color:'#2d3561',cur:'Genesis',ul:'UID',usd:true,pkgs:[{a:'60 Crystals',p:0.99},{a:'300 Crystals',p:4.99},{a:'980 Crystals',p:14.99},{a:'1980 Crystals',p:29.99}]},
  {id:9,cat:'games',name:'PUBG',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/pubg.png',emoji:'',color:'#c8860a',cur:'UC',ul:'Player ID',usd:false,pkgs:[
    {a:'PUBG Mobile UC 60',p:4,region:'global'},
    {a:'PUBG Mobile UC 120',p:7,region:'global'},
    {a:'PUBG Mobile UC 240',p:15,region:'global'},
    {a:'PUBG Mobile 325 UC',p:21,region:'global'},
    {a:'PUBG Mobile UC 385',p:23,region:'global'},
    {a:'PUBG Mobile UC 660',p:42,region:'global'},
    {a:'PUBG Mobile UC 720',p:38,region:'global'},
    {a:'PUBG Mobile UC 770',p:40,region:'global'},
    {a:'PUBG Mobile UC 985',p:52,region:'global'},
    {a:'PUBG Mobile UC 1320',p:64,region:'global'},
    {a:'PUBG Mobile UC 1800',p:104,region:'global'},
    {a:'PUBG Mobile UC 2125',p:98,region:'global'},
    {a:'PUBG Mobile UC 3850',p:208,region:'global'},
    {a:'PUBG Mobile UC 4175',p:173,region:'global'},
    {a:'PUBG Mobile UC 5650',p:237,region:'global'},
    {a:'PUBG Mobile UC 8100',p:417,region:'global'},
    {a:'PUBG Mobile UC 8760',p:343,region:'global'},
    {a:'PUBG Mobile UC 9900',p:402,region:'global'},
    {a:'PUBG Mobile UC 13750',p:544,region:'global'},
    {a:'PUBG Mobile UC 16200',p:640,region:'global'},
    {a:'PUBG Mobile UC 24300',p:944,region:'global'},
    {a:'PUBG Mobile UC 32400',p:1268,region:'global'},
    {a:'PUBG Mobile UC 40500',p:1584,region:'global'},
    {a:'PUBG Mobile UC 56700',p:2112,region:'global'},
    {a:'PUBG Mobile UC 72900',p:2720,region:'global'},
    {a:'🇹🇷 PUBG UC 660 TR',p:18,region:'tr',warn:'דורש חשבון משויך לאזור טורקיה — Tencent עלולים לחסום'},
    {a:'🇹🇷 PUBG UC 1800 TR',p:42,region:'tr',warn:'דורש חשבון משויך לאזור טורקיה — Tencent עלולים לחסום'},
    {a:'🇹🇷 PUBG UC 3850 TR',p:88,region:'tr',warn:'דורש חשבון משויך לאזור טורקיה — Tencent עלולים לחסום'},
    {a:'🇹🇷 PUBG UC 8100 TR',p:170,region:'tr',warn:'דורש חשבון משויך לאזור טורקיה — Tencent עלולים לחסום'}
  ]},
  {id:10,cat:'games',name:'Call of Duty',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/cod.png',emoji:'',color:'#222',cur:'COD Points',ul:'Activision ID',usd:true,pkgs:[{a:'200 CP',p:1.99},{a:'500 CP',p:4.99},{a:'1100 CP',p:9.99},{a:'2400 CP',p:19.99}]},
  {id:11,hidden:true,cat:'console',name:'PlayStation (PSN)',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/psn.png',emoji:'',color:'#003087',cur:'PSN',ul:'PSN Email',usd:false,pkgs:[{a:'PSN ארה״ב $10',p:34},{a:'PSN ארה״ב $25',p:90},{a:'PSN $50',p:176},{a:'PSN ארה״ב $60',p:202},{a:'PSN ארה״ב $100',p:346}]},
  {id:12,hidden:true,cat:'console',name:'Xbox',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Xbox.png',emoji:'',color:'#107c10',cur:'Xbox',ul:'Microsoft Email',usd:true,pkgs:[{a:'$10 Xbox',p:10},{a:'$25 Xbox',p:25},{a:'$50 Xbox',p:50},{a:'$100 Xbox',p:100}]},
  {id:13,hidden:true,cat:'console',name:'Nintendo eShop',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/nintendo.png',emoji:'',color:'#e4000f',cur:'Nintendo',ul:'Nintendo Account',usd:true,pkgs:[{a:'$10 eShop',p:10},{a:'$20 eShop',p:20},{a:'$35 eShop',p:35},{a:'$50 eShop',p:50}]},
  {id:14,hidden:true,cat:'wallet',name:'Steam',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/steam.png',emoji:'',color:'#1b2838',cur:'Steam',ul:'Steam Email',usd:true,pkgs:[{a:'$5 Steam',p:5},{a:'$10 Steam',p:10},{a:'$20 Steam',p:20},{a:'$50 Steam',p:50}]},
  {id:15,hidden:true,cat:'wallet',name:'Google Play',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Googleplay.png',emoji:'',color:'#01875f',cur:'Google Play',ul:'Gmail',usd:false,pkgs:[{a:'גוגל פליי $5 ארה״ב',p:20},{a:'גוגל פליי $10 ארה״ב',p:37},{a:'גוגל פליי $15 ארה״ב',p:55},{a:'גוגל פליי $25 ארה״ב',p:88},{a:'גוגל פליי $50 ארה״ב',p:176},{a:'גוגל פליי $100 ארה״ב',p:352}]},
  {id:16,hidden:true,cat:'wallet',name:'Apple / iTunes',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/apple.png',emoji:'',color:'#555',cur:'Apple',ul:'Apple ID',usd:false,pkgs:[{a:'iTunes $2 US',p:9},{a:'iTunes $3 US',p:13},{a:'iTunes $4 US',p:16},{a:'iTunes $5 US',p:20},{a:'iTunes $6 US',p:21},{a:'iTunes $10 US',p:36},{a:'iTunes $15 US',p:55},{a:'iTunes $20 US',p:71},{a:'iTunes $25 US',p:90},{a:'iTunes $50 US',p:176},{a:'iTunes $70 US',p:240},{a:'iTunes $100 US',p:340},{a:'iTunes $200 US',p:688},{a:'iTunes $300 US',p:1024},{a:'iTunes $400 US',p:1344},{a:'iTunes $500 US',p:1680}]},
  {id:17,hidden:true,cat:'wallet',name:'Razer Gold',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/razergold.png',emoji:'💚',color:'#44d62c',cur:'Razer Gold',ul:'Razer ID',usd:false,pkgs:[{a:'Razer Gold $5',p:20},{a:'Razer Gold $10',p:36},{a:'Razer Gold $20',p:72},{a:'Razer Gold $50',p:176},{a:'Razer Gold $100',p:349},{a:'Razer Gold $200',p:685},{a:'Razer Gold $250',p:842},{a:'Razer Gold $500',p:1664}]},
  {id:18,hidden:true,cat:'gift',name:'Amazon',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Amzon.png',emoji:'',color:'#ff9900',cur:'Amazon',ul:'Amazon Email',usd:true,pkgs:[{a:'$10 Amazon',p:10},{a:'$25 Amazon',p:25},{a:'$50 Amazon',p:50},{a:'$100 Amazon',p:100}]},
  {id:20,cat:'mobile',name:'Free Fire',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/freefire.png',emoji:'',color:'#e53935',cur:'Diamonds',ul:'Free Fire Player ID',usd:false,pkgs:[
    {a:'Free Fire 100+10 Diamond',p:4,region:'global'},
    {a:'Free Fire 210+21 Diamond',p:9,region:'global'},
    {a:'Free Fire 341 Diamond',p:13,region:'global'},
    {a:'Free Fire 530+53 Diamond',p:22,region:'global'},
    {a:'Free Fire 810 Diamond',p:28,region:'global'},
    {a:'Free Fire 1080+108 Diamond',p:44,region:'global'},
    {a:'Free Fire 1718 Diamond',p:53,region:'global'},
    {a:'Free Fire 2200+220 Diamond',p:87,region:'global'},
    {a:'Free Fire 3650 Diamond',p:106,region:'global'},
    {a:'Free Fire 7260 Diamond',p:218,region:'global'},
    {a:'🇧🇷 Free Fire 530 Diamond BR',p:11,region:'br',warn:'דורש חשבון Free Fire רשום בברזיל'},
    {a:'🇧🇷 Free Fire 1080 Diamond BR',p:21,region:'br',warn:'דורש חשבון Free Fire רשום בברזיל'},
    {a:'🇧🇷 Free Fire 2200 Diamond BR',p:42,region:'br',warn:'דורש חשבון Free Fire רשום בברזיל'},
    {a:'🇧🇷 Free Fire 5060 Diamond BR',p:88,region:'br',warn:'דורש חשבון Free Fire רשום בברזיל'}
  ]},
  {id:19,hidden:true,cat:'gift',name:'GameStop',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/GameStop.png',emoji:'🕹️',color:'#e31837',cur:'GameStop',ul:'Email',usd:true,pkgs:[{a:'$10 GS',p:10},{a:'$25 GS',p:25},{a:'$50 GS',p:50}]},
  {id:21,cat:'mobile',name:'Mobile Legends',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/MobileLegends.jpeg',emoji:'💎',color:'#1e88e5',cur:'Diamonds',ul:'ML User ID',usd:false,pkgs:[{a:'Mobile Legends 253 Diamonds + 25 Bonus',p:18},{a:'Mobile Legends 505 Diamonds + 66 Bonus',p:32},{a:'Mobile Legends 1010 Diamonds + 182 Bonus',p:68},{a:'Mobile Legends 1515 Diamonds + 273 Bonus',p:103},{a:'Mobile Legends 2525 Diamonds + 480 Bonus',p:160}]},
  {id:22,cat:'mobile',name:'TikTok',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Tiktok.svg.png',emoji:'🎵',color:'#000000',cur:'Coins',ul:'TikTok Username',usd:false,pkgs:[
    {a:'טיקטוק 70 מטבעות',p:4,region:'global'},
    {a:'טיקטוק 140 מטבעות',p:8,region:'global'},
    {a:'טיקטוק 210 מטבעות',p:11,region:'global'},
    {a:'טיקטוק 350 מטבעות',p:17,region:'global'},
    {a:'טיקטוק 500 מטבעות',p:26,region:'global'},
    {a:'טיקטוק 700 מטבעות',p:32,region:'global'},
    {a:'טיקטוק 1000 מטבעות',p:52,region:'global'},
    {a:'טיקטוק 1400 מטבעות',p:64,region:'global'},
    {a:'טיקטוק 2100 מטבעות',p:93,region:'global'},
    {a:'טיקטוק 3500 מטבעות',p:157,region:'global'},
    {a:'טיקטוק 5000 מטבעות',p:256,region:'global'},
    {a:'טיקטוק 7000 מטבעות',p:320,region:'global'},
    {a:'טיקטוק 10000 מטבעות',p:407,region:'global'},
    {a:'טיקטוק 12000 מטבעות',p:512,region:'global'},
    {a:'טיקטוק 17500 מטבעות',p:688,region:'global'},
    {a:'טיקטוק 35000 מטבעות',p:1360,region:'global'},
    {a:'טיקטוק 100000 מטבעות',p:3872,region:'global'},
    {a:'🇹🇷 טיקטוק 350 מטבעות TR',p:8,region:'tr',warn:'יש לטעון דרך VPN/IP טורקי'},
    {a:'🇹🇷 טיקטוק 1000 מטבעות TR',p:22,region:'tr',warn:'יש לטעון דרך VPN/IP טורקי'},
    {a:'🇹🇷 טיקטוק 2100 מטבעות TR',p:42,region:'tr',warn:'יש לטעון דרך VPN/IP טורקי'},
    {a:'🇹🇷 טיקטוק 5000 מטבעות TR',p:99,region:'tr',warn:'יש לטעון דרך VPN/IP טורקי'},
    {a:'🇹🇷 טיקטוק 17500 מטבעות TR',p:328,region:'tr',warn:'יש לטעון דרך VPN/IP טורקי'}
  ]},
  {id:23,cat:'mobile',name:'Bigo Live',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/BigoLive.png',emoji:'🌟',color:'#1e90ff',cur:'Diamonds',ul:'Bigo ID',usd:false,pkgs:[
    {a:'Bigo Live 120 יהלומי בונוס',p:10,region:'global'},
    {a:'Bigo Live 200 יהלומי בונוס',p:19,region:'global'},
    {a:'Bigo Live 400 יהלומי בונוס',p:34,region:'global'},
    {a:'Bigo Live 1009 יהלומי בונוס',p:77,region:'global'},
    {a:'Bigo Live 2000 יהלומי בונוס',p:161,region:'global'},
    {a:'Bigo Live 2406 יהלומי בונוס',p:170,region:'global'},
    {a:'Bigo Live 2524 יהלומי בונוס',p:176,region:'global'},
    {a:'Bigo Live 4000 יהלומי בונוס',p:314,region:'global'},
    {a:'Bigo Live 8000 יהלומי בונוס',p:619,region:'global'},
    {a:'Bigo Live 10096 יהלומי בונוס',p:720,region:'global'},
    {a:'Bigo Live 12000 יהלומי בונוס',p:928,region:'global'},
    {a:'Bigo Live 20000 יהלומי בונוס',p:1546,region:'global'},
    {a:'Bigo Live 40000 יהלומי בונוס',p:3092,region:'global'},
    {a:'🇹🇷 Bigo 400 יהלומים TR',p:18,region:'tr',note:'נטען דרך ה-ID — חוסך כ-45%'},
    {a:'🇹🇷 Bigo 1009 יהלומים TR',p:42,region:'tr',note:'נטען דרך ה-ID — חוסך כ-45%'},
    {a:'🇹🇷 Bigo 2000 יהלומים TR',p:88,region:'tr',note:'נטען דרך ה-ID — חוסך כ-45%'},
    {a:'🇹🇷 Bigo 4000 יהלומים TR',p:170,region:'tr',note:'נטען דרך ה-ID — חוסך כ-45%'},
    {a:'🇹🇷 Bigo 8000 יהלומים TR',p:340,region:'tr',note:'נטען דרך ה-ID — חוסך כ-45%'}
  ]},
  {id:24,hidden:true,cat:'gift',name:'Netflix',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Netflix.jpg',emoji:'🎬',color:'#e50914',cur:'Netflix',ul:'Netflix Email',usd:false,pkgs:[{a:'Netflix 4K חודש 1 - 5 מסכים',p:52},{a:'Netflix 4K חודש 3 - 5 מסכים',p:157},{a:'Netflix 4K חודש 12 - 1 מסך',p:279},{a:'Netflix 4K חודש 6 - 5 מסכים',p:304},{a:'Netflix 4K חודש 12 - 5 מסכים',p:608},{a:'Netflix Gift Card $15',p:80},{a:'Netflix Gift Card $30',p:122},{a:'Netflix Gift Card $60',p:218}]},
  {id:25,hidden:true,cat:'mobile',name:'Likee',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Likee.jpg',emoji:'💜',color:'#fe2c55',cur:'Diamonds',ul:'Likee ID',usd:false,pkgs:[{a:'Likee 42 Diamonds',p:4},{a:'Likee 84 Diamonds',p:8},{a:'Likee 210 Diamonds',p:18},{a:'Likee 420 Diamonds',p:34},{a:'Likee 2100 Diamonds',p:160},{a:'Likee 3150 Diamonds',p:240},{a:'Likee 4200 Diamonds',p:320},{a:'Likee 10700 Diamonds',p:832},{a:'Likee 21000 Diamonds',p:1600}]},
];

function makePrices(tier,custPct,custIls){
  const o={};
  PRODS.forEach(p=>p.pkgs.forEach(pkg=>{
    const k=`${p.id}_${pkg.p}`;
    let v=getBasePrice(p,pkg); // שמור על שער דולר
    if(tier==='custom'){
      if(custPct)v=Math.round(v*(1+custPct/100));
      else if(custIls)v=Math.max(1,Math.round(v+custIls));
    } else {
      const t=TIERS[tier]||TIERS.normal;
      v=Math.round(v*(1+t.pct/100));
    }
    o[k]=Math.max(1,v);
  }));
  return o;
}
function cp(o){return JSON.parse(JSON.stringify(o));}
function now(){return new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});}

// ============ STATE ============
// ============ FIREBASE STORAGE ============
// ============ STORAGE (Firebase + localStorage fallback) ============
function saveLocal(){
  try{
    localStorage.setItem('cp_stores',JSON.stringify(stores));
    localStorage.setItem('cp_orders',JSON.stringify(orders));
    localStorage.setItem('cp_users',JSON.stringify(users));
    if(typeof loads!=='undefined')localStorage.setItem('cp_loads_v1',JSON.stringify(loads));
    localStorage.setItem('cp_ts',Date.now().toString());

    // אימות מיד שהנתונים אכן נכתבו (זיהוי מצבי private mode)
    var verify=localStorage.getItem('cp_users');
    if(!verify){
      throw new Error('הנתונים לא נכתבו - localStorage חסום');
    }
    var parsed=JSON.parse(verify);
    console.log('💾 saveLocal SUCCESS — '+stores.length+' חנויות, '+users.length+' משתמשים נשמרו ('+(JSON.stringify(stores).length+JSON.stringify(users).length)+' תווים)');
    return true;
  }catch(e){
    console.error('❌ saveLocal FAILED:',e);
    // הצג התראה ויזואלית במקום alert
    var existing=document.getElementById('save-error-banner');
    if(existing)existing.remove();
    var banner=document.createElement('div');
    banner.id='save-error-banner';
    banner.style.cssText='position:fixed;top:0;left:0;right:0;background:#ff3030;color:#fff;padding:14px 16px;text-align:center;font-weight:700;z-index:99999;font-size:14px;direction:rtl;font-family:inherit;';
    banner.innerHTML='❌ <b>השמירה נכשלה!</b> '+(e.message||e)+'<br><span style="font-size:12px;font-weight:400;">סגור גלישה פרטית, או בדוק חוסמי פרסומות</span>';
    document.body.appendChild(banner);
    setTimeout(function(){if(banner.parentNode)banner.remove();},8000);
    return false;
  }
}

function saveData(){
  saveLocal();
  // עדכן את ה-timestamp המקומי מיד
  var ts=Date.now();
  try{localStorage.setItem('cp_ts',ts.toString());}catch(e){}
  // השהית sync זמנית — אנחנו עומדים לכתוב, אל תקבל את הכתיבה שלנו כהפתעה
  SYNC_PAUSED_UNTIL=ts+3000;
  if(!window.fbOK||!window.db){
    console.warn('⚠️ Firebase לא זמין - שמירה מקומית בלבד');
    if(typeof initFirebase==='function'){
      try{initFirebase();}catch(e){}
    }
    return;
  }
  try{
    window.db.collection('cashphone').doc('main').set({
      stores:stores,
      orders:orders,
      users:users,
      loads:(typeof loads!=='undefined')?loads:[],
      ts:ts,
      lastWriter:DEVICE_ID  // חתימה: מי כתב את זה
    }).then(function(){
      // עדכון פנימי: זה ה-ts שלנו, אז כשנקבל אותו מ-onSnapshot - נתעלם
      SYNC_LAST_REMOTE_TS=ts;
      console.log('✅ נשמר לענן ('+stores.length+' חנויות) · ts='+ts);
    }).catch(function(e){
      console.warn('Firebase save error:',e);
    });
  }catch(e){console.warn('saveData error:',e);}
}

function loadData(){
  // טעינה מ-localStorage תמיד ראשון (מהיר - להצגה מיידית)
  console.log('📂 loadData: starting. Initial stores.length=',stores.length,'users.length=',users.length);
  try{
    var s=localStorage.getItem('cp_stores');
    var o=localStorage.getItem('cp_orders');
    var u=localStorage.getItem('cp_users');
    console.log('📂 localStorage cp_stores length:',s?JSON.parse(s).length:'null');
    console.log('📂 localStorage cp_users length:',u?JSON.parse(u).length:'null');
    if(s&&JSON.parse(s).length>0)stores=JSON.parse(s);
    if(o)orders=JSON.parse(o)||[];
    if(u&&JSON.parse(u).length>0)users=JSON.parse(u);
  }catch(e){console.error('📂 loadData parse error:',e);}
  if(!users.find(function(u){return u.username==='admin';}))
    users.unshift({id:'admin',username:'admin',password:ADMIN_PASS,role:'admin',storeId:null});
  // טעינת לוג ביקורת
  try{loadAuditLog();}catch(e){}
  // מיגרציה: העברת customerInfo מחנויות למשתמשים מקושרים
  migrateCustomerInfo();
  console.log('📂 loadData: done. Final stores.length=',stores.length,'users.length=',users.length);
}

// העברת customerInfo מחנויות למשתמשים שמשויכים אליהן
function migrateCustomerInfo(){
  let migrated=0;
  stores.forEach(function(s){
    if(!s.customerInfo)return;
    // האם יש פרטים אמיתיים (לא רק אובייקט ריק)?
    var hasRealInfo=Object.values(s.customerInfo).some(function(v){return v&&String(v).trim();});
    if(!hasRealInfo){
      delete s.customerInfo;
      return;
    }
    // יש משתמש מקושר?
    var u=users.find(function(x){return x.storeId===s.id;});
    if(u&&!u.customerInfo){
      u.customerInfo=s.customerInfo;
      delete s.customerInfo;
      migrated++;
    }else if(u&&u.customerInfo){
      // המשתמש כבר עם פרטים - נשאיר את שלו, נמחק מהחנות
      delete s.customerInfo;
    }
  });
  if(migrated>0){
    console.log('✅ הועברו פרטי לקוח של '+migrated+' חנויות למשתמשים שלהן');
    try{saveLocal();}catch(e){}
  }
}

// טעינה מ-Firebase ברקע — מסנכרן נתונים
// משתמשים ב-timestamps לאיזון בין מקומי וענן
function syncFromFirebase(){
  if(!window.fbOK||!window.db){
    setTimeout(syncFromFirebase,1000);
    return;
  }
  // === הוחלט: Firebase משמש רק כגיבוי שמירה, לא לסנכרון אוטומטי ===
  // הסיבה: סנכרון אוטומטי גרם לדריסת נתונים מקומיים שהמשתמש שמר.
  // localStorage הוא המקור האמיתי של הנתונים.
  // נטען מ-Firebase רק אם localStorage ריק לחלוטין (מכשיר חדש או משתמש חדש).
  var hasLocalData=stores.length>1||users.length>1;
  if(hasLocalData){
    console.log('✅ נתונים מקומיים קיימים — Firebase ישמש רק כגיבוי שמירה');
    return;
  }
  // אין נתונים מקומיים — נטען פעם אחת מהענן
  console.log('⬇️ אין נתונים מקומיים — מנסה לטעון גיבוי מהענן');
  window.db.collection('cashphone').doc('main').get().then(function(doc){
    if(!doc.exists){
      console.warn('Firestore: אין מסמך main - יווצר בשמירה הבאה');
      return;
    }
    var data=doc.data();
    if(!data)return;
    // טעינה ראשונית בלבד — עדיין אין נתונים מקומיים
    if(stores.length>1||users.length>1){
      // בזמן שהקריאה רצה, המשתמש כבר הוסיף נתונים — לא נדרוס
      console.log('⏸️ נתונים מקומיים נוצרו בזמן הקריאה — לא טוענים מענן');
      return;
    }
    var changed=false;
    if(Array.isArray(data.stores)&&data.stores.length>0){
      stores=data.stores;
      changed=true;
    }
    if(Array.isArray(data.orders)){
      orders=data.orders;
      changed=true;
    }
    if(Array.isArray(data.users)&&data.users.length>0){
      users=data.users;
      changed=true;
    }
    if(Array.isArray(data.loads)&&typeof loads!=='undefined'){
      loads=data.loads;
      try{localStorage.setItem('cp_loads_v1',JSON.stringify(loads));}catch(e){}
      if(typeof renderLoads==='function')try{renderLoads();}catch(e){}
      changed=true;
    }
    if(!users.find(function(u){return u.username==='admin';})){
      users.unshift({id:'admin',username:'admin',password:ADMIN_PASS,role:'admin',storeId:null});
      changed=true;
    }
    if(changed){
      try{migrateCustomerInfo();}catch(e){console.warn('migrate:',e);}
      // 🔗 מיגרציה: סנכרון orders ↔ loads
      try{migrateOrdersToLoads();}catch(e){console.warn('order→load migration:',e);}
      saveLocal();
      try{renderAll();}catch(e){console.error('renderAll failed:',e.message||e,'stack:',e.stack||'no stack');}
      console.log('✅ נטען גיבוי מ-Firebase ('+stores.length+' חנויות, '+users.length+' משתמשים)');
    }
  }).catch(function(e){
    console.warn('Firebase sync error:',e);
  });
}

// ============================================================
// ============ 🌐 LIVE SYNC — סנכרון בזמן אמת ============
// ============================================================

// שומר רגעים שבהם יש לרענן UI (כדי לא לרענן את הכל בכל update)
function applyRemoteSnapshot(data){
  // בדיקה האם זה ה-update שלנו
  if(data.lastWriter===DEVICE_ID){
    // אנחנו כתבנו את זה — מעדכנים רק את ה-ts הפנימי
    SYNC_LAST_REMOTE_TS=data.ts||0;
    return;
  }
  // האם המשתמש פעיל בכתיבה כרגע (modal פתוח, prompt וכו')
  if(Date.now()<SYNC_PAUSED_UNTIL){
    console.log('⏸️ Live sync: מושהה כרגע (כתיבה פעילה)');
    setTimeout(function(){applyRemoteSnapshot(data);},1500);
    return;
  }
  // האם זה update שכבר קיבלנו?
  if(data.ts&&data.ts<=SYNC_LAST_REMOTE_TS){
    return;
  }
  // עדכון מ-מכשיר אחר — נטמיע
  console.log('📥 Live sync: עדכון ממכשיר '+(data.lastWriter||'unknown')+' (ts='+data.ts+')');

  var changedStores=false,changedOrders=false,changedUsers=false,changedLoads=false;

  // עדכון orders — תמיד נטמיע (זה הסיבה למערכת)
  if(Array.isArray(data.orders)){
    var oldOrdersJSON=JSON.stringify(orders);
    var newOrdersJSON=JSON.stringify(data.orders);
    if(oldOrdersJSON!==newOrdersJSON){
      orders=data.orders;
      changedOrders=true;
    }
  }
  // עדכון stores — תמיד נטמיע (כל שינוי קרדיט/הזמנה/חוב)
  if(Array.isArray(data.stores)&&data.stores.length>0){
    var oldStoresJSON=JSON.stringify(stores);
    var newStoresJSON=JSON.stringify(data.stores);
    if(oldStoresJSON!==newStoresJSON){
      stores=data.stores;
      changedStores=true;
    }
  }
  // עדכון users — תמיד נטמיע
  if(Array.isArray(data.users)&&data.users.length>0){
    var oldUsersJSON=JSON.stringify(users);
    var newUsersJSON=JSON.stringify(data.users);
    if(oldUsersJSON!==newUsersJSON){
      users=data.users;
      // חובה לוודא שאדמין קיים
      if(!users.find(function(u){return u.username==='admin';})){
        users.unshift({id:'admin',username:'admin',password:ADMIN_PASS,role:'admin',storeId:null});
      }
      changedUsers=true;
    }
  }
  // עדכון loads
  if(Array.isArray(data.loads)&&typeof loads!=='undefined'){
    var oldLoadsJSON=JSON.stringify(loads);
    var newLoadsJSON=JSON.stringify(data.loads);
    if(oldLoadsJSON!==newLoadsJSON){
      loads=data.loads;
      try{localStorage.setItem('cp_loads_v1',JSON.stringify(loads));}catch(e){}
      changedLoads=true;
    }
  }

  if(!changedStores&&!changedOrders&&!changedUsers&&!changedLoads){
    SYNC_LAST_REMOTE_TS=data.ts||0;
    return;
  }

  // 🔗 מיגרציה: אם orders התעדכנו, ודא ש-loads מסונכרנים
  if(changedOrders){
    try{migrateOrdersToLoads();}catch(e){}
  }

  // שמירה מקומית
  try{saveLocal();}catch(e){}
  SYNC_LAST_REMOTE_TS=data.ts||0;

  // רענון תצוגות פעילות (חכם — רק את הדפים שפתוחים כרגע)
  refreshActivePages(changedStores,changedOrders,changedUsers,changedLoads);

  // התראה ויזואלית קצרה
  showSyncIndicator();
}

// רענון תצוגות חכם — רק את הדפים הפתוחים בפועל
function refreshActivePages(cStores,cOrders,cUsers,cLoads){
  try{
    // אם דף האדמין פתוח
    var adminPage=document.getElementById('page-admin');
    if(adminPage&&adminPage.classList.contains('on')){
      // אילו טאב פעיל?
      var activeTab=document.querySelector('.atab.on');
      var activeTabId=activeTab?activeTab.getAttribute('onclick'):'';
      if(activeTabId.indexOf('sec-dash')>=0&&typeof renderDashboard==='function')renderDashboard();
      if(activeTabId.indexOf('sec-orders')>=0&&typeof renderOrders==='function')renderOrders();
      if(activeTabId.indexOf('sec-debts')>=0&&typeof renderDebtsTab==='function')renderDebtsTab();
      if(activeTabId.indexOf('sec-log')>=0&&typeof renderLog==='function')renderLog();
      if(activeTabId.indexOf('sec-stats')>=0){
        if(typeof updateStats==='function')updateStats();
        if(typeof renderDebts==='function')renderDebts();
        if(typeof renderStoresTable==='function')renderStoresTable();
      }
      if(activeTabId.indexOf('sec-monthly')>=0&&typeof renderMonthlyReport==='function')renderMonthlyReport();
      // רענון KPIs כלליים בכל מקרה
      if(typeof updateStats==='function')updateStats();
    }
    // דף משתמשים
    var usersPage=document.getElementById('page-users');
    if(usersPage&&usersPage.classList.contains('on')&&cUsers&&typeof renderUsers==='function')renderUsers();
    // דף חנות (storefront)
    var storePage=document.getElementById('page-store');
    if(storePage&&storePage.classList.contains('on')&&typeof renderStoreFront==='function')renderStoreFront();
    // דפי חנות חדשים
    var myOrdersPage=document.getElementById('page-my-orders');
    if(myOrdersPage&&myOrdersPage.classList.contains('on')&&typeof renderMyOrders==='function')renderMyOrders();
    var myCreditPage=document.getElementById('page-my-credit');
    if(myCreditPage&&myCreditPage.classList.contains('on')&&typeof renderMyCredit==='function')renderMyCredit();
    // דף מחירים
    var pricesPage=document.getElementById('page-prices');
    if(pricesPage&&pricesPage.classList.contains('on')&&typeof renderPriceEditor==='function'){
      // רק אם אין pendingP (משתמש לא באמצע עריכת מחירים)
      if(!pendingP)renderPriceEditor();
    }
  }catch(e){console.warn('refreshActivePages error:',e);}
}

// אינדיקטור ויזואלי קטן (פולס ירוק עליון) שקיבלנו עדכון
function showSyncIndicator(){
  var existing=document.getElementById('sync-indicator');
  if(existing){existing.remove();}
  var ind=document.createElement('div');
  ind.id='sync-indicator';
  ind.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);background:#39e600;color:#000;padding:4px 14px;border-radius:14px;font-size:11px;font-weight:700;z-index:9997;box-shadow:0 2px 12px rgba(57,230,0,0.4);font-family:inherit;direction:rtl;';
  ind.textContent='🔄 עודכן';
  document.body.appendChild(ind);
  setTimeout(function(){if(ind.parentNode)ind.remove();},1500);
}

// הפעלת הLISTENER
function startLiveSync(){
  if(!window.fbOK||!window.db){
    console.warn('⏳ Live sync: Firebase לא מוכן עדיין, מנסה שוב בעוד 2 שניות');
    setTimeout(startLiveSync,2000);
    return;
  }
  if(SYNC_LISTENER){
    console.log('⚠️ Live sync: כבר פעיל');
    return;
  }
  console.log('🌐 Live sync: מתחיל... (DEVICE_ID='+DEVICE_ID+')');
  try{
    SYNC_LISTENER=window.db.collection('cashphone').doc('main')
      .onSnapshot(function(doc){
        if(!doc.exists)return;
        var data=doc.data();
        if(!data)return;
        applyRemoteSnapshot(data);
      },function(err){
        console.error('Live sync error:',err);
        // ניסיון להפעיל שוב אחרי 5 שניות
        SYNC_LISTENER=null;
        setTimeout(startLiveSync,5000);
      });
    console.log('✅ Live sync: פעיל');
  }catch(e){
    console.error('startLiveSync error:',e);
    setTimeout(startLiveSync,5000);
  }
}

// השהית sync זמנית (מודלים, prompts וכו')
function pauseSyncFor(ms){
  SYNC_PAUSED_UNTIL=Math.max(SYNC_PAUSED_UNTIL,Date.now()+ms);
}

// טען נתונים מ-Firebase בהפעלה
let stores=[{id:'default',name:'ברירת מחדל',tier:'normal',credit:0,maxCredit:0,prices:makePrices('normal'),log:[]}];
let orders=[];
let users=[{id:'admin',username:'admin',password:ADMIN_PASS,role:'admin',storeId:null}];
let currentUser=null;
let prevId='default';
let priceStoreId='default';
let pendingP=null;
let bm='pct';
let selProd=null,selPkgData=null;
let activeCat='all';

// ============================================================
// ============ 🛡️ מודול אבטחה: גיבוי + לוג שינויים ============
// ============================================================

// ============ 📜 AUDIT LOG (לוג שינויים) ============
let auditLog=[]; // נטען מ-localStorage ב-loadData

// ============ 🌐 LIVE SYNC - מזהה מכשיר ============
// כל מכשיר מקבל מזהה ייחודי כדי שנדע מי כתב כל שינוי.
// כשמקבלים update מ-Firebase: אם זה אנחנו - מתעלמים. אם מכשיר אחר - מטמיעים.
var DEVICE_ID=(function(){
  try{
    var existing=localStorage.getItem('cp_device_id');
    if(existing)return existing;
    var newId='dev-'+Date.now()+'-'+Math.random().toString(36).substr(2,9);
    localStorage.setItem('cp_device_id',newId);
    return newId;
  }catch(e){return 'dev-fallback-'+Math.random();}
})();
var SYNC_LISTENER=null;       // ה-unsubscribe של onSnapshot
var SYNC_LAST_REMOTE_TS=0;    // ה-ts האחרון שקיבלנו מהענן
var SYNC_PAUSED_UNTIL=0;      // אם המשתמש כותב כרגע (ב-prompt/modal) - השהיה זמנית
console.log('🆔 Device ID:',DEVICE_ID);

function loadAuditLog(){
  try{
    var a=localStorage.getItem('cp_audit_log');
    if(a)auditLog=JSON.parse(a)||[];
  }catch(e){auditLog=[];}
}

function saveAuditLog(){
  try{
    // נשמרות רק 1000 רשומות אחרונות (למנוע נפיחות)
    if(auditLog.length>1000)auditLog=auditLog.slice(0,1000);
    localStorage.setItem('cp_audit_log',JSON.stringify(auditLog));
  }catch(e){console.warn('audit save failed:',e);}
  // שמירה גם ל-Firebase כגיבוי
  if(window.fbOK&&window.db){
    try{
      window.db.collection('cashphone').doc('main').set({auditLog:auditLog},{merge:true});
    }catch(e){}
  }
}

// פונקציה ראשית: רישום פעולה ביומן
function logAudit(type,description,details){
  var entry={
    id:Date.now()+'-'+Math.random().toString(36).substr(2,5),
    ts:Date.now(),
    timeStr:new Date().toLocaleString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}),
    user:currentUser?currentUser.username:'(לא מחובר)',
    role:currentUser?currentUser.role:'-',
    type:type,
    description:description,
    details:details||null
  };
  auditLog.unshift(entry);
  saveAuditLog();
  console.log('📜 AUDIT:',type,'-',description);
}

// ============ 📥 גיבוי ידני + תזכורת יומית ============

function getBackupSettings(){
  try{
    var s=localStorage.getItem('cp_backup_settings');
    if(s)return JSON.parse(s);
  }catch(e){}
  return{autoReminder:true};
}

function saveBackupSettings(s){
  try{localStorage.setItem('cp_backup_settings',JSON.stringify(s));}catch(e){}
}

function createBackupObject(){
  return{
    version:'2.9',
    createdAt:new Date().toISOString(),
    createdBy:currentUser?currentUser.username:'unknown',
    data:{
      stores:stores,
      orders:orders,
      users:users,
      loads:(typeof loads!=='undefined')?loads:[],
      auditLog:auditLog,
      dollarRate:(typeof dollarRate!=='undefined')?dollarRate:null,
      dollarCosts:(typeof dollarCosts!=='undefined')?dollarCosts:null
    }
  };
}

function downloadBackup(autoTriggered){
  try{
    var backup=createBackupObject();
    var json=JSON.stringify(backup,null,2);
    var blob=new Blob([json],{type:'application/json;charset=utf-8;'});
    var url=URL.createObjectURL(blob);
    var d=new Date();
    var fname='cashphone-backup-'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+'.json';
    var a=document.createElement('a');
    a.href=url;a.download=fname;a.click();
    URL.revokeObjectURL(url);
    try{localStorage.setItem('cp_last_backup',Date.now().toString());}catch(e){}
    if(!autoTriggered){
      logAudit('backup-manual','גיבוי ידני בוצע',{file:fname});
      if(typeof toast==='function')toast('t-admin','✅ הגיבוי הורד: '+fname);
    }else{
      logAudit('backup-auto','גיבוי יומי בוצע',{file:fname});
    }
    return true;
  }catch(e){
    console.error('גיבוי נכשל:',e);
    if(typeof toast==='function')toast('t-admin','❌ הגיבוי נכשל: '+(e.message||e));
    return false;
  }
}

// בדיקה האם להציע גיבוי (כל 24 שעות)
function checkBackupReminder(){
  if(!currentUser||currentUser.role!=='admin')return;
  var settings=getBackupSettings();
  if(!settings.autoReminder)return;
  try{
    var last=parseInt(localStorage.getItem('cp_last_backup')||'0');
    var elapsed=Date.now()-last;
    var DAY=24*60*60*1000;
    if(elapsed>=DAY){
      setTimeout(showBackupPrompt,3000);
    }
  }catch(e){console.warn('checkBackupReminder error:',e);}
}

function showBackupPrompt(){
  if(document.getElementById('backup-prompt'))return;
  var div=document.createElement('div');
  div.id='backup-prompt';
  div.style.cssText='position:fixed;top:80px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#283a28,#222831);border:1px solid #39e600;border-radius:12px;padding:14px 18px;z-index:9998;color:#fff;font-size:13px;direction:rtl;text-align:right;max-width:420px;width:calc(100% - 32px);box-shadow:0 8px 24px rgba(0,0,0,0.5);font-family:inherit;';
  div.innerHTML='<div style="font-size:14px;font-weight:700;color:#39e600;margin-bottom:6px;">📥 זמן לגיבוי יומי</div>'+
    '<div style="color:#bbb;margin-bottom:10px;font-size:12px;">עברו 24 שעות מהגיבוי האחרון. רוצה להוריד גיבוי עכשיו?</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-start;">'+
    '<button onclick="downloadBackup(true);document.getElementById(\'backup-prompt\').remove();" style="background:linear-gradient(135deg,#39e600,#2ab800);color:#000;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">📥 הורד עכשיו</button>'+
    '<button onclick="document.getElementById(\'backup-prompt\').remove();localStorage.setItem(\'cp_last_backup\',Date.now().toString());" style="background:#475467;color:#fff;border:1px solid #5a6478;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">דחה ל-24 שעות</button>'+
    '</div>';
  document.body.appendChild(div);
}

function restoreBackup(){
  var input=document.createElement('input');
  input.type='file';
  input.accept='application/json,.json';
  input.onchange=function(e){
    var file=e.target.files[0];
    if(!file)return;
    var reader=new FileReader();
    reader.onload=async function(ev){
      try{
        var backup=JSON.parse(ev.target.result);
        if(!backup.data||!backup.version){
          await cpAlert('קובץ הגיבוי אינו תקין או פגום',{type:'error'});
          return;
        }
        var msg='שחזור גיבוי יחליף את כל הנתונים הנוכחיים!\n\n';
        msg+='גיבוי מתאריך: '+(backup.createdAt?new Date(backup.createdAt).toLocaleString('he-IL'):'לא ידוע')+'\n';
        msg+='נוצר ע"י: '+(backup.createdBy||'לא ידוע')+'\n';
        msg+='גרסה: '+backup.version+'\n';
        msg+='חנויות בגיבוי: '+(backup.data.stores?backup.data.stores.length:0)+'\n';
        msg+='משתמשים: '+(backup.data.users?backup.data.users.length:0)+'\n';
        msg+='הזמנות: '+(backup.data.orders?backup.data.orders.length:0)+'\n\n';
        msg+='להמשיך?';
        if(!await cpConfirm(msg,{type:'warning',title:'אישור שחזור',okText:'שחזר'}))return;
        var d=backup.data;
        if(Array.isArray(d.stores))stores=d.stores;
        if(Array.isArray(d.orders))orders=d.orders;
        if(Array.isArray(d.users))users=d.users;
        if(Array.isArray(d.loads)&&typeof loads!=='undefined')loads=d.loads;
        if(Array.isArray(d.auditLog))auditLog=d.auditLog;
        if(d.dollarRate&&typeof dollarRate!=='undefined')dollarRate=d.dollarRate;
        if(d.dollarCosts&&typeof dollarCosts!=='undefined')dollarCosts=d.dollarCosts;
        if(!users.find(function(u){return u.username==='admin';})){
          users.unshift({id:'admin',username:'admin',password:ADMIN_PASS,role:'admin',storeId:null});
        }
        saveData();
        try{saveAuditLog();}catch(e){}
        logAudit('backup-restore','שחזור מגיבוי',{from:backup.createdAt,version:backup.version});
        await cpAlert('הגיבוי שוחזר בהצלחה! הדף ייטען מחדש',{type:'success'});
        location.reload();
      }catch(err){
        await cpAlert('שגיאה בקריאת קובץ הגיבוי: '+(err.message||err),{type:'error'});
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ============ AUTH ============
function quickLogin(){
  document.getElementById('li-user').value='admin';
  document.getElementById('li-pass').value='';
  doLogin();
}

function doLogin(autoLoginUser){
  let u,p,found;
  if(autoLoginUser){
    // כניסה אוטומטית עם משתמש שמור
    found=autoLoginUser;
  }else{
    u=document.getElementById('li-user').value.trim().toLowerCase();
    p=document.getElementById('li-pass').value;

    // 🔐 Rate Limiting — אדמין לא ננעל לעולם, רק משתמשים רגילים
    if(u!=='admin'){
      const rl=_checkRateLimit(u);
      if(!rl.allowed){
        const errEl=document.getElementById('login-err');
        errEl.classList.add('on');
        errEl.style.color='#ef9f27';
        errEl.textContent='🔒 חשבון נעול ל-'+rl.remaining+' דקות עקב ניסיונות כושלים רבים';
        document.getElementById('li-pass').value='';
        return;
      }
    }
    // תמיד אפשר להיכנס כ-admin
    if(u==='admin'&&p===ADMIN_PASS){
      const adminUser=users.find(x=>x.username==='admin')||{id:'admin',username:'admin',password:ADMIN_PASS,role:'admin',storeId:null};
      currentUser=adminUser;
      try{localStorage.setItem('cp_session',JSON.stringify({username:'admin',password:ADMIN_PASS}));}catch(e){}
      resetIdleTimer();
      document.getElementById('login-screen').style.display='none';
      document.getElementById('main-nav').style.display='flex';
      document.getElementById('login-err').classList.remove('on');
      document.getElementById('chip-name').textContent='admin 👑';
      buildNav();
      showPage('page-admin');
      // התראה אם היו ניסיונות כושלים על האדמין
      const adminAttempts=(_loginAttempts['rl_admin']||{}).count||0;
      if(adminAttempts>=3){
        setTimeout(function(){
          cpAlert('⚠️ שים לב: היו '+adminAttempts+' ניסיונות כושלים לכניסה לחשבון האדמין לפני שהצלחת. מישהו ניסה לפרוץ?','warning');
        },1000);
      }
      _resetAttempts('admin');
      logAudit('login','כניסה למערכת',{role:'admin'});
      initSession('admin','admin');
      setTimeout(function(){renderDashboard();checkBackupReminder();},100);
      return;
    }
    found=users.find(x=>x.username.toLowerCase()===u&&x.password===p);
    if(!found){
      // לא מצא בנתונים מקומיים - ננסה לטעון מ-Firebase לפני שמכריזים על שגיאה
      // (חשוב במיוחד בגלישה פרטית או בדפדפן חדש)
      if(window.fbOK&&window.db){
        document.getElementById('login-err').classList.remove('on');
        document.getElementById('li-pass').setAttribute('disabled','true');
        document.getElementById('login-err').classList.add('on');
        document.getElementById('login-err').style.color='#ef9f27';
        document.getElementById('login-err').textContent='⏳ בודק ענן...';
        window.db.collection('cashphone').doc('main').get().then(function(doc){
          document.getElementById('li-pass').removeAttribute('disabled');
          if(doc.exists){
            var data=doc.data();
            if(data&&data.users&&data.users.length>0){
              users=data.users;
              try{localStorage.setItem('cp_users',JSON.stringify(users));}catch(e){}
              if(data.stores&&data.stores.length>0){stores=data.stores;try{localStorage.setItem('cp_stores',JSON.stringify(stores));}catch(e){}}
              if(data.orders){orders=data.orders||[];try{localStorage.setItem('cp_orders',JSON.stringify(orders));}catch(e){}}
              // עכשיו ננסה שוב להתחבר
              var f2=users.find(x=>x.username.toLowerCase()===u&&x.password===p);
              if(f2){
                // בדיקת הקפאת חנות
                if(f2.role==='store'&&f2.storeId){
                  var ls=stores.find(s=>s.id===f2.storeId);
                  if(ls&&ls.frozen){
                    document.getElementById('login-err').classList.add('on');
                    document.getElementById('login-err').style.color='';
                    document.getElementById('login-err').textContent='🧊 החנות מוקפאת — פנה למנהל המערכת';
                    document.getElementById('li-pass').value='';
                    return;
                  }
                }
                currentUser=f2;
                try{localStorage.setItem('cp_session',JSON.stringify({username:f2.username,password:f2.password}));}catch(e){}
                resetIdleTimer();
                document.getElementById('login-screen').style.display='none';
                document.getElementById('main-nav').style.display='flex';
                document.getElementById('login-err').classList.remove('on');
                document.getElementById('login-err').style.color='';
                document.getElementById('chip-name').textContent=f2.username+(f2.role==='admin'?' 👑':f2.role==='reseller'?' 💼':' 🏪');
                buildNav();
                showPage(f2.role==='store'?'page-store':'page-admin');
                setTimeout(renderDashboard,100);
                return;
              }
            }
          }
          // עדיין לא נמצא
          document.getElementById('login-err').classList.add('on');
          document.getElementById('login-err').style.color='';
          _recordFailedAttempt(u);
          document.getElementById('login-err').textContent='שם משתמש או סיסמה שגויים — נסיון '+((_loginAttempts['rl_'+u]||{}).count||1)+'/'+MAX_LOGIN_ATTEMPTS;
          document.getElementById('li-pass').value='';
        }).catch(function(err){
          console.warn('Firebase login fallback failed:',err);
          document.getElementById('li-pass').removeAttribute('disabled');
          document.getElementById('login-err').classList.add('on');
          document.getElementById('login-err').style.color='';
          _recordFailedAttempt(u);
          document.getElementById('login-err').textContent='שם משתמש או סיסמה שגויים — נסיון '+((_loginAttempts['rl_'+u]||{}).count||1)+'/'+MAX_LOGIN_ATTEMPTS;
          document.getElementById('li-pass').value='';
        });
        return;
      }
      document.getElementById('login-err').classList.add('on');
      _recordFailedAttempt(u);
      document.getElementById('login-err').textContent='שם משתמש או סיסמה שגויים — נסיון '+((_loginAttempts['rl_'+u]||{}).count||1)+'/'+MAX_LOGIN_ATTEMPTS;
      document.getElementById('li-pass').value='';
      return;
    }
  }
  // בדיקה אם החנות מוקפאת
  if(found.role==='store'&&found.storeId){
    const linkedStore=stores.find(s=>s.id===found.storeId);
    if(linkedStore&&linkedStore.frozen){
      document.getElementById('login-err').classList.add('on');
      document.getElementById('login-err').style.color='';
      document.getElementById('login-err').textContent='🧊 החנות מוקפאת — פנה למנהל המערכת';
      document.getElementById('li-pass').value='';
      return;
    }
  }
  currentUser=found;
  // שמירת ההתחברות כדי שלא יצטרך להיכנס שוב
  try{localStorage.setItem('cp_session',JSON.stringify({username:found.username,password:found.password}));}catch(e){}
  resetIdleTimer();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-nav').style.display='flex';
  document.getElementById('login-err').classList.remove('on');
  document.getElementById('chip-name').textContent=found.username+(found.role==='admin'?' 👑':found.role==='reseller'?' 🤝':' 🏪');
  buildNav();
  _resetAttempts(found.username);
  logAudit('login','כניסה למערכת',{role:found.role,username:found.username});
  initSession(found.username, found.role);
  if(found.role==='store'){
    // הסתר תפריט בחירת חנות לגמרי
    const sel=document.getElementById('prev-sel');
    if(sel)sel.style.display='none';
    // הנתונים כבר טעונים מ-localStorage — אין צורך לסנכרן שוב מ-Firebase
    const s=stores.find(s=>s.id===found.storeId);
    if(s){prevId=s.id;renderStoreFront();}
    showPage('page-store');
  } else if(found.role==='reseller'){
    // משווק — הנתונים כבר טעונים מ-localStorage
    showPage('page-reseller');
    setTimeout(renderResellerPanel,100);
  } else {
    showPage('page-admin');
    setTimeout(renderDashboard, 100);
  }
}

function doLogout(){
  if(currentUser){
    try{logAudit('logout','התנתקות');}catch(e){}
    endSession();
  }
  currentUser=null;
  // ניקוי ההתחברות השמורה
  try{localStorage.removeItem('cp_session');}catch(e){}
  try{localStorage.removeItem('cp_last_activity');}catch(e){}
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('main-nav').style.display='none';
  document.getElementById('li-user').value='';
  document.getElementById('li-pass').value='';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  // עצירת טיימר
  if(window._idleTimer){clearTimeout(window._idleTimer);window._idleTimer=null;}
  if(window._idleWarning){clearTimeout(window._idleWarning);window._idleWarning=null;}
  const w=document.getElementById('idle-warning');
  if(w)w.style.display='none';
  // עדכון badge התראות
  if(typeof refreshNotifyOnUserChange==='function')refreshNotifyOnUserChange();
}

// ============ טיימר חוסר פעילות (30 דקות) ============
const IDLE_TIMEOUT=30*60*1000; // 30 דקות
const IDLE_WARNING_BEFORE=60*1000; // התראה דקה לפני
function resetIdleTimer(){
  if(!currentUser)return;
  try{localStorage.setItem('cp_last_activity',Date.now().toString());}catch(e){}
  if(window._idleTimer){clearTimeout(window._idleTimer);}
  if(window._idleWarning){clearTimeout(window._idleWarning);}
  const w=document.getElementById('idle-warning');
  if(w)w.style.display='none';
  // התראה דקה לפני היציאה
  window._idleWarning=setTimeout(showIdleWarning,IDLE_TIMEOUT-IDLE_WARNING_BEFORE);
  // יציאה אחרי 30 דקות
  window._idleTimer=setTimeout(idleLogout,IDLE_TIMEOUT);
}
function showIdleWarning(){
  if(!currentUser)return;
  let w=document.getElementById('idle-warning');
  if(!w){
    w=document.createElement('div');
    w.id='idle-warning';
    w.innerHTML='<div style="background:#2a1a00;border:1px solid #ef9f27;color:#ef9f27;padding:14px 20px;border-radius:10px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);"><span style="font-size:20px;">⏱️</span><div style="flex:1;"><div style="font-weight:700;margin-bottom:2px;">תתנתק בקרוב</div><div style="font-size:12px;opacity:0.9;">לא הייתה פעילות זמן מה. לחץ "המשך" כדי להישאר מחובר</div></div><button onclick="resetIdleTimer()" style="background:#ef9f27;color:#000;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-family:inherit;">המשך</button></div>';
    w.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;max-width:90vw;width:420px;';
    document.body.appendChild(w);
  }
  w.style.display='block';
}
function idleLogout(){
  if(!currentUser)return;
  doLogout();
  // הודעה במסך הכניסה
  const errEl=document.getElementById('login-err');
  if(errEl){
    errEl.classList.add('on');
    errEl.style.background='#2a1a00';
    errEl.style.borderColor='#ef9f27';
    errEl.style.color='#ef9f27';
    errEl.textContent='⏱️ נותקת אוטומטית עקב חוסר פעילות (30 דקות)';
  }
}
// מאזין לפעולות משתמש - כל פעולה מאפסת את הטיימר
['click','keydown','touchstart','scroll','mousemove'].forEach(function(ev){
  document.addEventListener(ev,function(){
    if(currentUser)resetIdleTimer();
  },{passive:true});
});

function buildNav(){
  const isAdmin=currentUser&&currentUser.role==='admin';
  const isReseller=currentUser&&currentUser.role==='reseller';
  const isStore=currentUser&&currentUser.role==='store';
  const tabs=document.getElementById('nav-tabs');
  tabs.innerHTML='';
  // הצג כפתור חיפוש גלובלי לאדמין ולמשווק
  var searchBtn=document.getElementById('nav-search-btn');
  if(searchBtn)searchBtn.style.display=(isAdmin||isReseller)?'inline-flex':'none';
  // 🌐 הצג כפתור שפה רק לחנות (אדמין/משווק עובדים בעברית)
  var langBtn=document.getElementById('nav-lang-btn');
  if(langBtn){
    langBtn.style.display=isStore?'inline-flex':'none';
    if(isStore)updateLangButton();
  }
  // עדכון badge של התראות
  if(typeof notify!=='undefined')notify.updateBadge();
  if(isAdmin){
    [['page-admin','פאנל ניהול'],['page-store','חנות'],['page-prices','מחירים'],['page-users','משתמשים']].forEach(([id,lbl])=>{
      const b=document.createElement('button');
      b.className='ntab'+(id==='page-admin'?' on':'');
      b.textContent=lbl;
      b.onclick=()=>{showPage(id);document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('on'));b.classList.add('on');if(id==='page-store')renderStoreFront();if(id==='page-prices')renderPriceEditor();if(id==='page-users')renderUsers();};
      tabs.appendChild(b);
    });
  } else if(isReseller){
    [['page-reseller','💼 פאנל משווק'],['page-store','🛒 תצוגת חנות']].forEach(([id,lbl])=>{
      const b=document.createElement('button');
      b.className='ntab'+(id==='page-reseller'?' on':'');
      b.textContent=lbl;
      b.onclick=()=>{showPage(id);document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('on'));b.classList.add('on');if(id==='page-store')renderStoreFront();if(id==='page-reseller')renderResellerPanel();};
      tabs.appendChild(b);
    });
  } else {
    // חנות - 3 טאבים
    [['page-store',t('nav.store')],['page-my-orders',t('nav.orders')],['page-margin',t('nav.margin')],['page-my-credit',t('nav.credit')]].forEach(([id,lbl])=>{
      const b=document.createElement('button');
      b.className='ntab'+(id==='page-store'?' on':'');
      b.textContent=lbl;
      b.onclick=()=>{
        showPage(id);
        document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('on'));
        b.classList.add('on');
        if(id==='page-store')renderStoreFront();
        if(id==='page-my-orders')renderMyOrders();
        if(id==='page-my-credit')renderMyCredit();
        if(id==='page-margin')renderMarginPage();
      };
      tabs.appendChild(b);
    });
  }
}

function showPage(id){
  // משווק לא יכול להגיע לעמודי אדמין - הפנה אותו לעמוד שלו
  if(currentUser&&currentUser.role==='reseller'){
    var allowedForReseller=['page-reseller','page-store','page-info'];
    if(allowedForReseller.indexOf(id)===-1){
      id='page-reseller';
    }
  }
  // חנות לא יכולה להגיע לעמודי אדמין/משווק
  if(currentUser&&currentUser.role==='store'){
    var allowedForStore=['page-store','page-my-orders','page-my-credit','page-margin','page-info'];
    if(allowedForStore.indexOf(id)===-1){
      id='page-store';
    }
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  var target=document.getElementById(id);
  if(target)target.classList.add('on');
  // עדכון כפתור הזמנה מהירה
  if(typeof updateQuickOrderFab==='function')updateQuickOrderFab();
}

// ============ STORES ============
document.getElementById('n-tier').addEventListener('change',function(){
  document.getElementById('n-custom-wrap').style.display=this.value==='custom'?'grid':'none';
});

function getStore(id){return stores.find(s=>s.id===(id||prevId))||stores[0];}

function addStore(){
  const name=document.getElementById('n-name').value.trim();
  if(!name){document.getElementById('n-name').style.borderColor='#552020';document.getElementById('n-name').focus();return;}
  document.getElementById('n-name').style.borderColor='';
  const tier=document.getElementById('n-tier').value;
  const credit=parseInt(document.getElementById('n-credit').value)||0;
  const debtLimit=parseInt(document.getElementById('n-debt').value)||0;
  const custPct=parseFloat(document.getElementById('n-pct').value)||0;
  const custIls=parseFloat(document.getElementById('n-ils').value)||0;
  const id='s'+Date.now();
  const log=credit>0?[{t:'טעינה פתיחה',amt:credit,plus:true,time:now()}]:[];
  stores.push({id,name,tier,credit,maxCredit:credit,debtLimit,prices:makePrices(tier,custPct,custIls),log,frozen:false});
  ['n-name','n-credit','n-debt'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
  renderAll();
  // הטופס נמצא כעת בפאנל המשתמשים — תצוגת toast שם
  var toastTarget=document.getElementById('t-users')?'t-users':'t-admin';
  toast(toastTarget,'✅ חנות "'+name+'" נוצרה — לחץ על "➕ צור משתמש" בשורה כדי לשייך משתמש');
  saveData();
}

function closeProdMgr(){var el=document.getElementById("prod-mgr-overlay");if(el)el.remove();}

function manageProducts(id){
  var s=getStore(id);
  if(!s.disabledProds)s.disabledProds=[];
  closeProdMgr();
  var overlay=document.createElement("div");
  overlay.id="prod-mgr-overlay";
  overlay.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
  var html="<div style='background:#fff;border-radius:20px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;'>";
  html+="<div style='padding:20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f0f0f0;'>";
  html+="<div><b style='font-size:15px;'>🎮 מוצרים זמינים</b><div style='font-size:12px;color:#999;'>"+s.name+"</div></div>";
  html+="<button onclick='closeProdMgr()' style='background:#f0f0f0;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px;'>✕</button>";
  html+="</div><div style='padding:16px;'>";
  html+="<div style='display:flex;gap:8px;margin-bottom:14px;'>";
  html+='<button onclick="toggleAllProds(\''+id+'\',true)" style="flex:1;background:#39e600;color:#000;border:none;border-radius:8px;padding:7px;font-size:12px;font-weight:700;cursor:pointer;">✅ הפעל הכל</button>';
  html+='<button onclick="toggleAllProds(\''+id+'\',false)" style="flex:1;background:#e24b4a;color:#fff;border:none;border-radius:8px;padding:7px;font-size:12px;font-weight:700;cursor:pointer;">❌ בטל הכל</button>';
  html+="</div>";
  var cats=Object.entries(CATS);
  cats.forEach(function(c){
    var catKey=c[0],catName=c[1];
    var catProds=PRODS.filter(function(p){return p.cat===catKey;});
    if(!catProds.length)return;
    html+="<div style='margin-bottom:14px;'><div style='font-size:11px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:8px;'>"+catName+"</div>";
    catProds.forEach(function(p){
      var isEnabled=s.disabledProds.indexOf(p.id)===-1;
      var bg=isEnabled?"#39e600":"#ddd";
      html+="<div style='display:flex;align-items:center;justify-content:space-between;background:#f8f8f8;border-radius:10px;padding:10px 12px;margin-bottom:6px;'>";
      html+="<span style='font-size:13px;font-weight:600;'>"+p.name+"</span>";
      html+="<div onclick=\"toggleProd('"+id+"',"+p.id+","+(isEnabled?'false':'true')+",'"+id+"-"+p.id+"')\" id='tog-"+id+"-"+p.id+"' style='width:44px;height:24px;border-radius:24px;background:"+bg+";cursor:pointer;position:relative;transition:.2s;'>";
      html+="<div style='position:absolute;top:2px;"+(isEnabled?"right":"left")+":2px;width:20px;height:20px;background:#fff;border-radius:50%;'></div>";
      html+="</div></div>";
    });
    html+="</div>";
  });
  html+="</div></div>";
  overlay.innerHTML=html;
  document.body.appendChild(overlay);
}

function toggleProd(storeId,prodId,enable,togId){
  var s=getStore(storeId);
  if(!s.disabledProds)s.disabledProds=[];
  prodId=parseInt(prodId);
  if(enable){
    s.disabledProds=s.disabledProds.filter(function(id){return id!==prodId;});
  } else {
    if(s.disabledProds.indexOf(prodId)===-1)s.disabledProds.push(prodId);
  }
  // עדכן עיצוב
  var tog=document.getElementById('tog-'+storeId+'-'+prodId);
  if(tog){
    tog.style.background=enable?'#39e600':'#ddd';
    var knob=tog.querySelector('div');
    if(knob){
      knob.style.right=enable?'2px':'';
      knob.style.left=enable?'':'2px';
    }
    tog.setAttribute('onclick',"toggleProd('"+storeId+"',"+prodId+","+(enable?'false':'true')+",'"+storeId+"-"+prodId+"')");
  }
  saveData();
}

function toggleAllProds(storeId,enable){
  var s=getStore(storeId);
  if(enable){
    s.disabledProds=[];
  } else {
    s.disabledProds=PRODS.map(function(p){return p.id;});
  }
  saveData();
  closeProdMgr();
  manageProducts(storeId);
}

async function setDebtLimit(id){
  const s=getStore(id);
  const cur=s.debtLimit||0;
  const val=await cpPrompt(`כרגע: ₪${cur}\nהכנס סכום חוב מקסימלי (0 = ללא חוב):`,{
    title:`מסגרת חוב — ${s.name}`,
    icon:'💳',
    inputType:'number',
    min:0,
    default:cur,
    placeholder:'סכום בש"ח'
  });
  if(val===null)return;
  const num=parseInt(val)||0;
  s.debtLimit=Math.max(0,num);
  logAudit('debt-limit-change','שינוי מסגרת חוב',{storeId:s.id,storeName:s.name,from:cur,to:s.debtLimit});
  renderAll();saveData();
  var toastTarget=document.getElementById('t-users')?'t-users':'t-admin';
  toast(toastTarget,`מסגרת חוב עודכנה ל-₪${s.debtLimit} עבור "${s.name}"`);
}

function topup(id,amtOverride){
  const s=getStore(id);
  let amt;
  if(typeof amtOverride==='number'){
    amt=amtOverride;
  }else{
    const inp=document.getElementById('tp_'+id);
    amt=inp?parseInt(inp.value)||0:0;
    if(inp)inp.value='';
  }
  if(amt<=0)return;
  s.credit+=amt;s.maxCredit+=amt;
  // עדכון חוב פתוח (יתרה שטרם שולמה לאדמין)
  s.unpaidBalance=(s.unpaidBalance||0)+amt;
  s.unpaidUpdatedAt=Date.now();
  s.log.unshift({t:'טעינת קרדיט',amt:amt,plus:true,time:now()});
  logAudit('credit-topup','טעינת קרדיט',{storeId:s.id,storeName:s.name,amount:amt,newCredit:s.credit,newUnpaid:s.unpaidBalance});
  renderAll();
  // רענון תצוגת חנות אם פתוחה
  if(typeof renderMyCredit==='function'){
    var myCreditPage=document.getElementById('page-my-credit');
    if(myCreditPage&&myCreditPage.classList.contains('on'))renderMyCredit();
  }
  // 🔔 התראה לחנות
  if(typeof notify!=='undefined'){
    notify.send('credit:topup',{
      message:'נטענו ₪'+amt.toLocaleString()+' לחשבון שלך · יתרה כעת: ₪'+s.credit.toLocaleString(),
      target_store_id:s.id,
      action_store_id:s.id
    });
  }
  var toastTarget=document.getElementById('t-users')?'t-users':'t-admin';
  toast(toastTarget,'₪'+amt+' נטענו ל-"'+s.name+'" · 💳 חוב פתוח: ₪'+s.unpaidBalance.toLocaleString());
  saveData();
}

// הפחתת קרדיט מחנות (תיקון טעות / החזרה / זיכוי)
async function reduceCredit(id,amtOverride,reasonOverride){
  var s=stores.find(function(x){return x.id===id;});
  if(!s)return;
  var amt;
  if(typeof amtOverride==='number'){
    amt=amtOverride;
  } else {
    var input=await cpPrompt(
      'יתרה נוכחית: ₪'+s.credit.toLocaleString()+'\nחוב פתוח: ₪'+(s.unpaidBalance||0).toLocaleString()+'\n\nהקלד סכום להפחתה:',
      {title:'➖ הפחתת קרדיט — '+s.name,icon:'➖',inputType:'number',min:1,placeholder:'סכום בש"ח'}
    );
    if(input===null)return;
    input=String(input).trim();
    if(input==='')return;
    amt=parseInt(input)||0;
  }
  if(amt<=0){toast('t-users','סכום לא תקין');return;}

  // סיבה (אופציונלי)
  var reason=reasonOverride;
  if(reason===undefined){
    reason=await cpPrompt('למשל: "תיקון טעות", "החזר", "זיכוי"',{
      title:'סיבת ההפחתה (אופציונלי)',
      icon:'📝',
      placeholder:'אפשר להשאיר ריק'
    });
    if(reason===null)return; // ביטל
    reason=String(reason).trim();
  }

  // אזהרה אם זה גורם לחוב חורג ממסגרת
  var debtLimit=s.debtLimit||0;
  if(s.credit-amt<-debtLimit){
    var newDebt=Math.abs(s.credit-amt);
    var msg='ההפחתה תכניס את החנות לחוב של ₪'+newDebt.toLocaleString()+
      (debtLimit>0?' (מעל המסגרת ₪'+debtLimit+')':' (אין מסגרת אשראי מוגדרת)')+'\n\nלהמשיך?';
    if(!await cpConfirm(msg,{type:'warning',title:'חריגה ממסגרת'}))return;
  }

  s.credit-=amt;
  // הקטנת maxCredit באופן יחסי כדי שהמדד "אחוז ניצול" לא יסתבך
  s.maxCredit=Math.max(0,s.maxCredit-amt);
  // עדכון חוב פתוח: אם יש חוב פתוח, גם הוא יורד (כי הקטנו את הקרדיט שטענו)
  var oldUnpaid=s.unpaidBalance||0;
  if(oldUnpaid>0){
    s.unpaidBalance=Math.max(0,oldUnpaid-amt);
    s.unpaidUpdatedAt=Date.now();
  }
  if(!Array.isArray(s.log))s.log=[];
  var logTitle='הפחתת קרדיט'+(reason?' — '+reason:'');
  s.log.unshift({t:logTitle,amt:amt,plus:false,time:now(),isReduction:true});
  logAudit('credit-reduce','הפחתת קרדיט',{
    storeId:s.id,storeName:s.name,amount:amt,
    reason:reason||'(לא צוין)',newCredit:s.credit,
    unpaidBefore:oldUnpaid,unpaidAfter:s.unpaidBalance||0
  });
  saveData();
  // רענון תצוגות
  if(typeof renderAll==='function')renderAll();
  if(typeof renderUnpaidStores==='function')renderUnpaidStores();
  if(typeof renderDebtsTab==='function')renderDebtsTab();
  if(typeof renderMyCredit==='function'){
    var myCreditPage=document.getElementById('page-my-credit');
    if(myCreditPage&&myCreditPage.classList.contains('on'))renderMyCredit();
  }
  var toastTarget=document.getElementById('t-users')?'t-users':'t-admin';
  toast(toastTarget,'➖ ₪'+amt.toLocaleString()+' הופחתו מ-"'+s.name+'" · יתרה: ₪'+s.credit.toLocaleString());
}

// קביעה ידנית של סכום החוב הפתוח (תיקון/סנכרון/עדכון מהעבר)
async function setUnpaidBalance(storeId){
  var s=stores.find(function(x){return x.id===storeId;});
  if(!s)return;
  var current=s.unpaidBalance||0;
  // חישוב הצעה אוטומטית: כמה הוא חייב לי לפי הנתונים
  var totalLoaded=0,totalReduced=0,totalPayments=0;
  if(Array.isArray(s.log)){
    s.log.forEach(function(l){
      if(l.plus&&(l.t||'').indexOf('טעינ')>=0)totalLoaded+=(l.amt||0);
      if(!l.plus&&l.isReduction)totalReduced+=(l.amt||0);
      if(!l.plus&&l.isPayment)totalPayments+=(l.amt||0);
    });
  }
  var suggested=Math.max(0,totalLoaded-totalReduced-totalPayments);

  var msg='חוב נוכחי במערכת: ₪'+current.toLocaleString()+'\n';
  msg+='─────────────────────\n';
  msg+='📥 סה"כ נטען: ₪'+totalLoaded.toLocaleString()+'\n';
  msg+='➖ סה"כ הופחת: ₪'+totalReduced.toLocaleString()+'\n';
  msg+='💰 סה"כ שולם: ₪'+totalPayments.toLocaleString()+'\n';
  msg+='─────────────────────\n';
  msg+='💡 הצעה אוטומטית: ₪'+suggested.toLocaleString();

  var input=await cpPrompt(msg,{
    title:'💳 ערוך חוב פתוח — '+s.name,
    icon:'💳',
    inputType:'number',
    min:0,
    default:suggested,
    placeholder:'סכום חוב פתוח חדש'
  });
  if(input===null)return;
  input=String(input).trim();
  if(input==='')return;
  var newBalance=parseInt(input);
  if(isNaN(newBalance)||newBalance<0){toast('t-users','סכום לא תקין');return;}
  var oldBalance=s.unpaidBalance||0;
  s.unpaidBalance=newBalance;
  s.unpaidUpdatedAt=Date.now();
  logAudit('unpaid-edit','עדכון ידני של חוב פתוח',{
    storeId:s.id,storeName:s.name,
    from:oldBalance,to:newBalance
  });
  saveData();
  if(typeof renderUnpaidStores==='function')renderUnpaidStores();
  if(typeof renderDebtsTab==='function')renderDebtsTab();
  if(typeof renderMyCredit==='function'){
    var myCreditPage=document.getElementById('page-my-credit');
    if(myCreditPage&&myCreditPage.classList.contains('on'))renderMyCredit();
  }
  var toastTarget=document.getElementById('t-users')?'t-users':'t-admin';
  toast(toastTarget,'✅ חוב פתוח עודכן: ₪'+oldBalance.toLocaleString()+' → ₪'+newBalance.toLocaleString());
}

// רישום תשלום מהחנות (מוריד מהחוב הפתוח)
async function recordPayment(storeId,amtOverride){
  var s=stores.find(function(x){return x.id===storeId;});
  if(!s)return;
  var current=s.unpaidBalance||0;
  if(current<=0){toast('t-admin','אין חוב פתוח לחנות "'+s.name+'"');return;}
  var amt;
  if(typeof amtOverride==='number'){
    amt=amtOverride;
  } else {
    var input=await cpPrompt(
      'חוב פתוח כרגע: ₪'+current.toLocaleString()+'\n\nהקלד סכום, או השאר ריק לתשלום מלא:',
      {title:'💰 קבלת תשלום מ-'+s.name,icon:'💰',inputType:'number',min:0,default:current,placeholder:'סכום ששולם'}
    );
    if(input===null)return;
    input=String(input).trim();
    if(input==='')amt=current;
    else amt=parseInt(input)||0;
  }
  if(amt<=0){toast('t-admin','סכום לא תקין');return;}
  if(amt>current){
    var msg='הסכום (₪'+amt+') גדול מהחוב הפתוח (₪'+current+').\nלהמשיך? היתרה תהיה 0.';
    if(!await cpConfirm(msg,{type:'warning',title:'סכום חורג'}))return;
    amt=current;
  }
  s.unpaidBalance=current-amt;
  s.unpaidUpdatedAt=Date.now();
  // רישום ברמת היומן (לתיעוד) - לא משפיע על קרדיט
  if(!Array.isArray(s.log))s.log=[];
  s.log.unshift({t:'תשלום מהחנות',amt:amt,plus:false,time:now(),isPayment:true});
  logAudit('payment-received','קבלת תשלום מחנות',{storeId:s.id,storeName:s.name,amount:amt,remaining:s.unpaidBalance});
  saveData();
  // רענון תצוגות
  if(typeof renderUnpaidStores==='function')renderUnpaidStores();
  if(typeof renderDebtsTab==='function')renderDebtsTab();
  if(typeof renderMyCredit==='function'){
    var myCreditPage=document.getElementById('page-my-credit');
    if(myCreditPage&&myCreditPage.classList.contains('on'))renderMyCredit();
  }
  // 🔔 התראה לאדמין ולמשווק (אם החנות שלו)
  if(typeof notify!=='undefined'){
    notify.send('payment:received',{
      message:'התקבל תשלום של ₪'+amt.toLocaleString()+' מ-'+s.name+(s.unpaidBalance>0?' · נשאר חוב: ₪'+s.unpaidBalance.toLocaleString():' · החוב סגור!'),
      target_role:['admin','reseller'],
      target_store_id:s.id,
      action_store_id:s.id
    });
  }
  toast('t-admin','✅ ₪'+amt.toLocaleString()+' נרשמו · '+(s.unpaidBalance>0?'נשאר חוב: ₪'+s.unpaidBalance.toLocaleString():'החוב סגור!'));
}

async function delStore(id){
  var storeName=(stores.find(s=>s.id===id)||{}).name||id;
  if(!await cpConfirm('האם למחוק את חנות "'+storeName+'"?\nפעולה זו אינה ניתנת לביטול.',{type:'danger',title:'מחיקת חנות'}))return;
  stores=stores.filter(s=>s.id!==id);
  if(prevId===id)prevId='default';
  if(priceStoreId===id)priceStoreId='default';
  logAudit('store-delete','מחיקת חנות',{storeId:id,storeName:storeName});
  renderAll();saveData();
}

function creditStatus(s){
  const pct=s.maxCredit>0?s.credit/s.maxCredit:1;
  if(s.credit<=0)return{cls:'b-empty',txt:'אזל'};
  if(pct<0.2)return{cls:'b-low',txt:'נמוך'};
  return{cls:'b-ok',txt:'תקין'};
}

function renderStores(){
  var el=document.getElementById('stores-list');
  if(!el)return; // אזור החנויות הישן הוסר — מנוהל כעת דרך renderUsersTable
  el.innerHTML=stores.map(s=>{
    const cs=creditStatus(s);
    const tier=TIERS[s.tier]||TIERS.normal;
    const pct=s.maxCredit>0?Math.max(0,Math.round(s.credit/s.maxCredit*100)):0;
    const bc=s.credit<=0?'empty':pct<20?'low':'';
    return`<div class="srow">
      <div class="srow-top">
        <div>
          <div class="srow-name">${s.name}
            <span class="badge ${cs.cls}">${cs.txt}</span>
            <span class="badge ${tier.b}">${tier.l}</span>
          </div>
          <div class="srow-meta">₪${s.credit.toLocaleString()} מתוך ₪${s.maxCredit.toLocaleString()}</div>
          ${s.debtLimit>0?`<div class="srow-meta" style="color:#ef9f27;">⚠️ מסגרת חוב: ₪${s.debtLimit.toLocaleString()}</div>`:''}
          ${s.credit<0?`<div class="srow-meta" style="color:#e24b4a;font-weight:700;">🔴 חוב נוכחי: ₪${Math.abs(s.credit).toLocaleString()}</div>`:''}
          <div class="srow-meta" style="color:#39e600;margin-top:2px;">🔐 כניסה: ${(()=>{const u=users.find(u=>u.storeId===s.id);return u?u.username+' / '+u.password:'לא הוגדר';})()}</div>
          ${s.customerInfo&&s.customerInfo.contactName?`<div class="srow-meta" style="margin-top:4px;">👤 ${s.customerInfo.contactName}${s.customerInfo.phone?' | 📞 '+s.customerInfo.phone:''}${s.customerInfo.email?' | ✉️ '+s.customerInfo.email:''}</div>`:''}
          ${s.customerInfo&&s.customerInfo.idNum?`<div class="srow-meta">🪪 ת.ז/ח.פ: ${s.customerInfo.idNum}${s.customerInfo.city?' | 📍 '+s.customerInfo.city:''}</div>`:''}
        </div>
        <div class="srow-actions">
          <button class="sbtn" onclick="manageProducts('${s.id}')">🎮 מוצרים</button>
          <button class="sbtn" onclick="setDebtLimit('${s.id}')">💳 מסגרת חוב</button>
          <button class="sbtn" onclick="prevStore('${s.id}')">תצוגה</button>
          <button class="sbtn" onclick="editPrices('${s.id}')">מחירים</button>
          ${s.id!=='default'?`<button class="dbtn" onclick="delStore('${s.id}')">מחק</button>`:''}
        </div>
      </div>
      <div class="cbar-wrap"><div class="cbar ${bc}" style="width:${pct}%"></div></div>
      <div class="cnums"><span>יתרה: <strong>₪${s.credit.toLocaleString()}</strong></span><span>${pct}%</span></div>
      <div class="topup-row">
        <input id="tp_${s.id}" type="number" min="0" placeholder="סכום טעינה (₪)" style="flex:1;"/>
        <button class="gbtn" onclick="topup('${s.id}')">טען קרדיט +</button>
      </div>
    </div>`;
  }).join('');
}

// ============ ORDERS ============
function renderOrders(){
  // הופנה לטבלת הטעינות החדשה
  if(typeof renderLoads==='function')renderLoads();
}

function doneOrder(id){
  const o=orders.find(o=>o.id===id);
  if(o){
    o.status='done';
    // 🔗 סנכרן סטטוס של ה-load המקושר
    try{syncLoadStatusFromOrder(o);}catch(e){}
    renderOrders();updateStats();saveData();
    // אם חנות צופה בטאב "ההזמנות שלי" כרגע - רענן
    if(typeof renderMyOrders==='function'){
      var myOrdersPage=document.getElementById('page-my-orders');
      if(myOrdersPage&&myOrdersPage.classList.contains('on'))renderMyOrders();
    }
    // 🔔 התראה לחנות שההזמנה שלה אושרה
    if(typeof notify!=='undefined'){
      notify.send('order:status',{
        message:'ההזמנה "'+o.prod+' — '+o.pkg+'" עבור "'+o.user+'" הושלמה ✓',
        target_store_id:o.storeId,
        action_store_id:o.storeId
      });
    }
    sendTelegram(
      `✅ <b>הזמנה הושלמה!</b>\n\n`+
      `🏪 חנות: ${o.storeName}\n`+
      `🎮 מוצר: ${o.prod} — ${o.pkg}\n`+
      `👤 משתמש: ${o.user}\n`+
      `💰 מחיר: ₪${o.price}`
    );
  }
}

function renderLog(){
  const all=stores.flatMap(s=>s.log.map(l=>({...l,store:s.name}))).slice(0,80);
  const el=document.getElementById('log-list');
  el.innerHTML=all.length?all.map(l=>`
    <div class="lrow">
      <span><strong>${l.store}</strong> — ${l.t}${l.user?' ('+l.user+')':''}</span>
      <span class="${l.plus?'lplus':'lminus'}">${l.plus?'+':'-'}₪${l.amt} <span style="color:#333;font-size:11px;">· ${l.time}</span></span>
    </div>`).join(''):'<div style="text-align:center;padding:1rem;color:#555;font-size:13px;">אין רשומות</div>';
}

function updateStats(){
  // חנויות אמיתיות (ללא ברירת מחדל הפנימית)
  const realStores=stores.filter(s=>s.id!=='default');
  const stStores=document.getElementById('st-stores');
  if(stStores)stStores.textContent=realStores.length;
  const stCredit=document.getElementById('st-credit');
  if(stCredit)stCredit.textContent='₪'+realStores.reduce((t,s)=>t+s.credit,0).toLocaleString();
  const stOrders=document.getElementById('st-orders');
  if(stOrders)stOrders.textContent=orders.length;
  const stRev=document.getElementById('st-rev');
  if(stRev)stRev.textContent='₪'+orders.filter(o=>o.status==='done').reduce((t,o)=>t+o.price,0).toLocaleString();
  const ss=document.getElementById('store-stats');
  if(ss)ss.innerHTML=realStores.map(s=>{
    const so=orders.filter(o=>o.storeId===s.id);
    const rev=so.filter(o=>o.status==='done').reduce((t,o)=>t+o.price,0);
    return`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #475467;font-size:13px;"><span>${s.name}</span><span>${so.length} הזמנות · <span style="color:#39e600;font-weight:700;">₪${rev}</span></span></div>`;
  }).join('');
  const ps=document.getElementById('prod-stats');
  if(ps){
    const c={};orders.forEach(o=>{c[o.prod]=(c[o.prod]||0)+1;});
    const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,8);
    ps.innerHTML=sorted.length?sorted.map(([n,cnt])=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #475467;font-size:13px;"><span>${n}</span><span style="color:#39e600;font-weight:700;">${cnt}</span></div>`).join(''):'<div style="color:#555;font-size:13px;padding:1rem;text-align:center;">אין נתונים</div>';
  }
}

function updateFilters(){
  const sel=document.getElementById('of-store');
  if(!sel)return; // האלמנט לא קיים בדף הנוכחי
  const cur=sel.value;
  sel.innerHTML='<option value="all">כל החנויות</option>'+stores.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  if(stores.find(s=>s.id===cur))sel.value=cur;
}

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
    .filter(p=>!p.hidden)
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
  ['sec-dash','sec-orders','sec-log','sec-stats','sec-debts','sec-monthly','sec-security','sec-sessions'].forEach(s=>{
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
  if(id==='sec-sessions')renderSessionsTab();
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
        if(s.username==='admin'&&s.password===ADMIN_PASS){
          const adminUser=users.find(x=>x.username==='admin')||{id:'admin',username:'admin',password:ADMIN_PASS,role:'admin',storeId:null};
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

// === Block #3 ===
// ============================================================
// ============ ℹ️ דפי מידע: אודות / תקנון / צור קשר ============
// ============================================================

// פרטי העסק (מרוכזים — שינוי כאן משנה בכל המקומות)
var BUSINESS_INFO={
  name:'CashPhone',
  tagline:'פתרון למזומן — טעינות גיימינג וכרטיסי גיפט B2B',
  phone:'055-5525525',
  whatsapp:'055-5525525',
  email:'Cashphone21@gmail.com',
  hours:'ראשון–חמישי, 09:00–22:00',
  taxId:'305431926',
  address:'באר שבע, ישראל'
};

function showInfoPage(page){
  var modal=document.getElementById('info-modal');
  var title=document.getElementById('info-title');
  var content=document.getElementById('info-content');
  if(!modal||!title||!content)return;
  modal.style.display='flex';

  // איפוס סטיילים של טאבים
  ['about','terms','contact'].forEach(function(p){
    var btn=document.getElementById('info-tab-'+p);
    if(btn){
      btn.style.color='#bbb';
      btn.style.borderBottomColor='transparent';
      btn.style.background='none';
    }
  });
  // הדגש פעיל
  var activeBtn=document.getElementById('info-tab-'+page);
  if(activeBtn){
    activeBtn.style.color='#39e600';
    activeBtn.style.borderBottomColor='#39e600';
    activeBtn.style.background='#1a2a1a';
  }

  if(page==='about'){
    title.textContent='ℹ️ אודות '+BUSINESS_INFO.name;
    content.innerHTML=getAboutContent();
  } else if(page==='terms'){
    title.textContent='⚖️ תקנון ותנאי שימוש';
    content.innerHTML=getTermsContent();
  } else if(page==='contact'){
    title.textContent='📞 צור קשר';
    content.innerHTML=getContactContent();
  }
  // גלילה לראש
  content.scrollTop=0;
}

function closeInfoPage(){
  var modal=document.getElementById('info-modal');
  if(modal)modal.style.display='none';
}

// תוכן דף אודות
function getAboutContent(){
  var b=BUSINESS_INFO;
  return ''+
    '<div style="text-align:center;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid #2a2a2a;">'+
      '<div style="font-size:28px;font-weight:800;color:#39e600;letter-spacing:1px;">CASH<span style="color:#fff;">PHONE</span></div>'+
      '<div style="font-size:13px;color:#888;margin-top:6px;">'+b.tagline+'</div>'+
    '</div>'+

    '<h3 style="color:#39e600;font-size:17px;margin:20px 0 10px;">🏢 מי אנחנו</h3>'+
    '<p style="margin:0 0 14px;">'+b.name+' היא חברה ישראלית המתמחה במתן פתרונות מקיפים לחנויות סלולר וגיימינג ברחבי הארץ. אנו ספק B2B מוביל המספק טעינות לכל פלטפורמות הגיימינג הפופולריות וכרטיסי גיפט מגוונים, באמצעות מערכת ניהול חכמה וזמינה 24/6.</p>'+

    '<h3 style="color:#39e600;font-size:17px;margin:20px 0 10px;">🎯 המטרה שלנו</h3>'+
    '<p style="margin:0 0 14px;">לאפשר לחנויות הסלולר והגיימינג בישראל להציע ללקוחותיהן את מגוון המוצרים הדיגיטליים הרחב ביותר, במחירים תחרותיים ובמהירות שאין שנייה לה. אנחנו מאמינים ששירות מהיר, מערכת פשוטה ויחס אישי הם הדרך לבנות שותפויות עסקיות לטווח ארוך.</p>'+

    '<h3 style="color:#39e600;font-size:17px;margin:20px 0 10px;">🎮 המוצרים שלנו</h3>'+
    '<div style="background:#222831;border-radius:10px;padding:14px;margin-bottom:14px;">'+
      '<div style="font-weight:700;color:#fff;margin-bottom:8px;">🕹️ טעינות גיימינג:</div>'+
      '<ul style="margin:0 0 14px 0;padding-right:20px;">'+
        '<li>Roblox Robux</li>'+
        '<li>Fortnite V-Bucks</li>'+
        '<li>PlayStation Network (PSN)</li>'+
        '<li>Xbox Live</li>'+
        '<li>Steam Wallet</li>'+
        '<li>Google Play & App Store</li>'+
        '<li>Valorant, League of Legends, Apex Legends, PUBG, Call of Duty, Genshin Impact, Minecraft, EA FC ועוד</li>'+
      '</ul>'+
      '<div style="font-weight:700;color:#fff;margin-bottom:8px;">🎁 כרטיסי גיפט:</div>'+
      '<div style="margin-right:20px;">מגוון רחב של כרטיסי גיפט מהמותגים המובילים בארץ ובעולם.</div>'+
    '</div>'+

    '<h3 style="color:#39e600;font-size:17px;margin:20px 0 10px;">⚡ איך זה עובד</h3>'+
    '<ol style="margin:0 0 14px 0;padding-right:20px;">'+
      '<li style="margin-bottom:8px;"><b style="color:#fff;">הצטרפות:</b> צרו קשר ואנחנו פותחים לכם חשבון במערכת.</li>'+
      '<li style="margin-bottom:8px;"><b style="color:#fff;">טעינת קרדיט:</b> מעבירים תשלום ואנו טוענים לכם יתרה במערכת.</li>'+
      '<li style="margin-bottom:8px;"><b style="color:#fff;">ביצוע הזמנות:</b> נכנסים למערכת, בוחרים מוצר וחבילה, מקלידים את שם השחקן ושולחים.</li>'+
      '<li style="margin-bottom:8px;"><b style="color:#fff;">קבלת המוצר:</b> אנחנו מבצעים את הטעינה במהירות ומסמנים את ההזמנה כהושלמה.</li>'+
      '<li style="margin-bottom:0;"><b style="color:#fff;">מעקב מלא:</b> רואים בכל רגע את היתרה, ההיסטוריה והסטטוסים — הכל במערכת.</li>'+
    '</ol>'+

    '<h3 style="color:#39e600;font-size:17px;margin:20px 0 10px;">⭐ היתרונות שלנו</h3>'+
    '<div style="display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:14px;">'+
      '<div style="background:#1a2a1a;border-right:3px solid #39e600;padding:12px 14px;border-radius:6px;">'+
        '<div style="font-weight:700;color:#39e600;margin-bottom:4px;">⚡ שירות מהיר</div>'+
        '<div style="font-size:13px;color:#bbb;">ביצוע הזמנות במהירות — בלי לחכות, בלי כאבי ראש.</div>'+
      '</div>'+
      '<div style="background:#1a2a1a;border-right:3px solid #39e600;padding:12px 14px;border-radius:6px;">'+
        '<div style="font-weight:700;color:#39e600;margin-bottom:4px;">🎯 מגוון רחב</div>'+
        '<div style="font-size:13px;color:#bbb;">עשרות מוצרים שונים — כל הגיימינג שיש בשוק במקום אחד.</div>'+
      '</div>'+
      '<div style="background:#1a2a1a;border-right:3px solid #39e600;padding:12px 14px;border-radius:6px;">'+
        '<div style="font-weight:700;color:#39e600;margin-bottom:4px;">📱 מערכת קלה ונגישה</div>'+
        '<div style="font-size:13px;color:#bbb;">ממשק פשוט, אינטואיטיבי ועובד מצוין גם בנייד. ללא הורדת אפליקציה.</div>'+
      '</div>'+
      '<div style="background:#1a2a1a;border-right:3px solid #39e600;padding:12px 14px;border-radius:6px;">'+
        '<div style="font-weight:700;color:#39e600;margin-bottom:4px;">💰 מחירים תחרותיים</div>'+
        '<div style="font-size:13px;color:#bbb;">מחירים מותאמים אישית לכל לקוח לפי היקף הפעילות.</div>'+
      '</div>'+
      '<div style="background:#1a2a1a;border-right:3px solid #39e600;padding:12px 14px;border-radius:6px;">'+
        '<div style="font-weight:700;color:#39e600;margin-bottom:4px;">📊 שקיפות מלאה</div>'+
        '<div style="font-size:13px;color:#bbb;">היסטוריית הזמנות, מאזן קרדיט, ודוחות זמינים בכל רגע.</div>'+
      '</div>'+
      '<div style="background:#1a2a1a;border-right:3px solid #39e600;padding:12px 14px;border-radius:6px;">'+
        '<div style="font-weight:700;color:#39e600;margin-bottom:4px;">🤝 יחס אישי</div>'+
        '<div style="font-size:13px;color:#bbb;">תמיכה ישירה בוואטסאפ — מענה מהיר לכל שאלה.</div>'+
      '</div>'+
    '</div>'+

    '<h3 style="color:#39e600;font-size:17px;margin:20px 0 10px;">📞 פרטי קשר</h3>'+
    '<div style="background:#222831;border-radius:10px;padding:14px;">'+
      '<div style="margin-bottom:8px;">📱 <b>טלפון/וואטסאפ:</b> <a href="tel:'+b.phone+'" style="color:#39e600;text-decoration:none;">'+b.phone+'</a></div>'+
      '<div style="margin-bottom:8px;">✉️ <b>אימייל:</b> <a href="mailto:'+b.email+'" style="color:#39e600;text-decoration:none;">'+b.email+'</a></div>'+
      '<div style="margin-bottom:8px;">📍 <b>כתובת:</b> '+b.address+'</div>'+
      '<div style="margin-bottom:8px;">🏢 <b>ח.פ./עוסק מורשה:</b> '+b.taxId+'</div>'+
      '<div>🕐 <b>שעות פעילות:</b> '+b.hours+'</div>'+
    '</div>'+

    '<div style="text-align:center;margin-top:24px;padding-top:18px;border-top:1px solid #2a2a2a;color:#666;font-size:12px;">'+
      '© '+new Date().getFullYear()+' '+b.name+'. כל הזכויות שמורות.'+
    '</div>';
}

// תוכן תקנון
function getTermsContent(){
  var b=BUSINESS_INFO;
  var lastUpdate=new Date().toLocaleDateString('he-IL',{day:'2-digit',month:'long',year:'numeric'});
  return ''+
    '<div style="background:#222831;border:1px solid #475467;border-radius:8px;padding:12px;margin-bottom:18px;font-size:12px;color:#bbb;">'+
      '📅 עודכן לאחרונה: <b style="color:#fff;">'+lastUpdate+'</b><br>'+
      '⚠️ השימוש במערכת מהווה הסכמה מלאה לתנאים אלו. נא לקרוא בעיון.'+
    '</div>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">1. כללי והגדרות</h3>'+
    '<div style="background:#222831;border-right:3px solid #39e600;padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:12px;">'+
      '<div style="color:#888;margin-bottom:4px;">פרטי החברה:</div>'+
      '<div><b style="color:#fff;">'+b.name+'</b> · ח.פ. <b style="color:#fff;">'+b.taxId+'</b></div>'+
      '<div style="color:#bbb;">'+b.address+'</div>'+
    '</div>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '1.1. מסמך זה מהווה הסכם משפטי מחייב בין '+b.name+' (להלן: "<b>החברה</b>" או "<b>הספק</b>") לבין הלקוח העסקי הרשום במערכת (להלן: "<b>הלקוח</b>" או "<b>המשתמש</b>").<br>'+
      '1.2. השירות מיועד <b style="color:#ef9f27;">ללקוחות עסקיים בלבד (B2B)</b> — חנויות סלולר, חנויות גיימינג, ועוסקים מורשים. השירות אינו מיועד ללקוחות פרטיים.<br>'+
      '1.3. הניסוח במסמך זה הוא בלשון זכר מטעמי נוחות בלבד, אך מתייחס לכלל המגדרים.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">2. רישום והרשאת לקוח</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '2.1. הצטרפות למערכת מותנית באישור מצד החברה ובהגשת המסמכים הנדרשים, לרבות אישור עוסק מורשה תקף.<br>'+
      '2.2. הלקוח מתחייב לספק פרטים מדויקים ועדכניים. החברה רשאית לדרוש מסמכי הזדהות נוספים בכל עת.<br>'+
      '2.3. סיסמת המערכת היא אישית. הלקוח אחראי לשמירתה ואין להעביר אותה לצד שלישי. כל פעולה תחת המשתמש של הלקוח תיחשב כפעולה שבוצעה על ידו.<br>'+
      '2.4. החברה שומרת לעצמה את הזכות לסרב להצטרפות או להפסיק את השירות בכל עת, על פי שיקול דעתה הבלעדי.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">3. תנאי תשלום ושיטת עבודה</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '3.1. <b style="color:#ef9f27;">המודל העסקי הוא תשלום מראש</b> — הלקוח מעביר תשלום, והחברה טוענת לו קרדיט במערכת בהתאם.<br>'+
      '3.2. לאחר ביצוע הזמנה, הסכום יורד באופן אוטומטי מיתרת הקרדיט של הלקוח.<br>'+
      '3.3. לקוחות מסוימים, על פי שיקול דעת החברה, עשויים לקבל מסגרת אשראי מוגדרת. מסגרת זו ניתנת לשינוי או ביטול בכל עת.<br>'+
      '3.4. תשלום באמצעות העברה בנקאית, ביט, או אמצעי תשלום אחר שיוסכם מראש בין הצדדים.<br>'+
      '3.5. חוב פתוח של הלקוח כלפי החברה הינו מסמך מחייב לכל דבר ועניין.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">4. ביצוע הזמנות</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '4.1. הלקוח אחראי באופן בלעדי לוודא את נכונות פרטי ההזמנה, לרבות שם המשתמש/מזהה השחקן, סוג המוצר וכמותו.<br>'+
      '4.2. <b style="color:#ef9f27;">לא ניתן לבטל או לשנות הזמנה לאחר אישורה</b>, ולא יבוצע החזר כספי בגין הזמנות שבוצעו עקב טעות מצד הלקוח.<br>'+
      '4.3. החברה תבצע את ההזמנה בהקדם האפשרי, ככלל בתוך מספר דקות. עם זאת, החברה אינה מתחייבת לזמני אספקה ספציפיים.<br>'+
      '4.4. במקרה בו ההזמנה לא בוצעה (תקלה אצל הספק / מוצר לא זמין וכד\'), הסכום יוחזר במלואו לקרדיט של הלקוח.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">5. מחירים ושערי מטבע</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '5.1. המחירים במערכת נקובים בשקלים חדשים (₪) וכוללים מע"מ כדין (אם רלוונטי).<br>'+
      '5.2. מחירי המוצרים עשויים להשתנות מעת לעת בהתאם לשערי המטבע, מחירי הספקים וגורמים נוספים. השינוי יחול על הזמנות חדשות בלבד.<br>'+
      '5.3. החברה רשאית להציע מחירים שונים ללקוחות שונים על פי שיקולים עסקיים (היקף פעילות, ותק וכד\').<br>'+
      '5.4. מחירים שגויים שהוצגו בטעות אינם מחייבים את החברה.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">6. אחריות והגבלות</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '6.1. החברה משמשת כמתווך בין הלקוח לבין ספקי המוצרים הדיגיטליים. אחריות החברה מוגבלת לסכום ההזמנה הספציפית.<br>'+
      '6.2. החברה אינה אחראית לנזקים עקיפים, לרבות אובדן רווחים, פגיעה במוניטין, או נזק תוצאתי מכל סוג שהוא.<br>'+
      '6.3. החברה אינה אחראית לשימוש שעושה הלקוח הסופי במוצר שנקנה (קוד גיפט, חשבון משחק וכד\').<br>'+
      '6.4. במקרה של תקלה מצד ספק חיצוני, זמן התיקון הוא לפי לוחות הזמנים של הספק.<br>'+
      '6.5. החברה אינה אחראית לנזקים שנגרמו עקב כשל טכני, ניתוק רשת, או כוח עליון.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">7. שימוש אסור במערכת</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '7.1. אסור להשתמש במערכת לכל מטרה בלתי חוקית, לרבות הלבנת הון, מימון פעילות פלילית או כל פעולה אסורה בחוק.<br>'+
      '7.2. אסור לנסות לפרוץ למערכת, לבצע התקפות סייבר, או לפגוע בתשתית טכנולוגית של החברה.<br>'+
      '7.3. אסור להעביר את גישת המשתמש לצדדים שלישיים שאינם רשומים במערכת.<br>'+
      '7.4. הפרת תנאים אלו תוביל להפסקה מיידית של השירות וחשיפה לתביעות משפטיות.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">8. סיום ההתקשרות</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '8.1. כל אחד מהצדדים רשאי להפסיק את ההתקשרות בהודעה מראש של 7 ימים.<br>'+
      '8.2. במקרה של הפרת תנאי תקנון זה מצד הלקוח, החברה רשאית לסיים את ההתקשרות באופן מיידי וללא הודעה מוקדמת.<br>'+
      '8.3. בעת סיום ההתקשרות, יתרת קרדיט נטו לזכות הלקוח (לאחר קיזוז חובות) תוחזר תוך 14 ימי עסקים.<br>'+
      '8.4. חובות הלקוח כלפי החברה ימשיכו לחול גם לאחר סיום ההתקשרות.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">9. פרטיות ואבטחת מידע</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '9.1. החברה מתחייבת לשמור על פרטיות הלקוח ולא להעביר את פרטיו לצד שלישי, אלא במקרים הקבועים בחוק.<br>'+
      '9.2. נתוני הלקוח (היסטוריית הזמנות, יתרות, פרטי קשר) נשמרים במערכת לצרכים תפעוליים, חשבונאיים וחוקיים.<br>'+
      '9.3. הלקוח זכאי לעיין בפרטיו ולבקש את תיקונם בכל עת.<br>'+
      '9.4. החברה משתמשת בכלים מקובלים לאבטחת מידע, אולם אינה יכולה להבטיח באופן מוחלט נגד פריצות.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">10. שינויים בתקנון</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '10.1. החברה שומרת לעצמה את הזכות לעדכן את התקנון מעת לעת.<br>'+
      '10.2. שינויים מהותיים יישלחו ללקוח באמצעות הודעה במערכת או באימייל.<br>'+
      '10.3. המשך השימוש במערכת לאחר עדכון התקנון מהווה הסכמה לשינויים.'+
    '</p>'+

    '<h3 style="color:#39e600;font-size:16px;margin:18px 0 8px;">11. סמכות שיפוט וחוק חל</h3>'+
    '<p style="margin:0 0 12px;font-size:13px;">'+
      '11.1. על תקנון זה ועל כל מחלוקת הנוגעת אליו יחול הדין הישראלי בלבד.<br>'+
      '11.2. סמכות השיפוט הבלעדית בכל סכסוך תהיה נתונה לבתי המשפט המוסמכים במחוז המרכז.<br>'+
      '11.3. במקרה של סתירה בין תקנון זה לבין הסכם פרטני בכתב, ההסכם הפרטני יגבר.'+
    '</p>'+

    '<div style="background:#283a28;border:1px solid #39e600;border-radius:10px;padding:14px;margin-top:24px;text-align:center;">'+
      '<div style="font-weight:700;color:#39e600;margin-bottom:6px;">📋 לשאלות, בירורים או הערות לתקנון:</div>'+
      '<div style="font-size:13px;">צרו קשר ב-<a href="tel:'+b.phone+'" style="color:#39e600;">'+b.phone+'</a> או במייל <a href="mailto:'+b.email+'" style="color:#39e600;">'+b.email+'</a></div>'+
    '</div>'+

    '<div style="text-align:center;margin-top:18px;color:#666;font-size:11px;">'+
      'תקנון זה הינו רכושו של '+b.name+' ומוגן בזכויות יוצרים.'+
    '</div>';
}

// תוכן צור קשר
function getContactContent(){
  var b=BUSINESS_INFO;
  var waNumber=b.whatsapp.replace(/[^0-9]/g,'');
  if(waNumber.startsWith('0'))waNumber='972'+waNumber.substring(1);
  return ''+
    '<div style="text-align:center;margin-bottom:24px;">'+
      '<div style="font-size:48px;margin-bottom:8px;">📞</div>'+
      '<div style="font-size:16px;color:#bbb;">נשמח לעמוד לרשותכם בכל שאלה</div>'+
    '</div>'+

    '<div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:20px;">'+
      // וואטסאפ
      '<a href="https://wa.me/'+waNumber+'" target="_blank" style="text-decoration:none;display:block;background:linear-gradient(135deg,#25D366,#128C7E);border-radius:12px;padding:16px;color:#fff;">'+
        '<div style="display:flex;align-items:center;gap:14px;">'+
          '<div style="font-size:32px;">💬</div>'+
          '<div style="flex:1;">'+
            '<div style="font-size:12px;opacity:0.9;">פתח שיחה בוואטסאפ</div>'+
            '<div style="font-size:18px;font-weight:700;">'+b.whatsapp+'</div>'+
          '</div>'+
          '<div style="font-size:20px;">←</div>'+
        '</div>'+
      '</a>'+
      // טלפון
      '<a href="tel:'+b.phone+'" style="text-decoration:none;display:block;background:#222831;border:1px solid #5a6478;border-radius:12px;padding:16px;color:#fff;">'+
        '<div style="display:flex;align-items:center;gap:14px;">'+
          '<div style="font-size:32px;">📱</div>'+
          '<div style="flex:1;">'+
            '<div style="font-size:12px;color:#888;">חייג עכשיו</div>'+
            '<div style="font-size:18px;font-weight:700;color:#39e600;">'+b.phone+'</div>'+
          '</div>'+
          '<div style="font-size:20px;color:#39e600;">←</div>'+
        '</div>'+
      '</a>'+
      // מייל
      '<a href="mailto:'+b.email+'" style="text-decoration:none;display:block;background:#222831;border:1px solid #5a6478;border-radius:12px;padding:16px;color:#fff;">'+
        '<div style="display:flex;align-items:center;gap:14px;">'+
          '<div style="font-size:32px;">✉️</div>'+
          '<div style="flex:1;">'+
            '<div style="font-size:12px;color:#888;">שלח אימייל</div>'+
            '<div style="font-size:14px;font-weight:700;color:#39e600;word-break:break-all;">'+b.email+'</div>'+
          '</div>'+
          '<div style="font-size:20px;color:#39e600;">←</div>'+
        '</div>'+
      '</a>'+
    '</div>'+

    // שעות פעילות
    '<div style="background:#222831;border:1px solid #5a6478;border-radius:12px;padding:16px;margin-bottom:12px;">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'+
        '<span style="font-size:22px;">🕐</span>'+
        '<span style="font-size:15px;font-weight:700;color:#fff;">שעות פעילות</span>'+
      '</div>'+
      '<div style="color:#bbb;font-size:14px;padding-right:32px;">'+b.hours+'</div>'+
      '<div style="color:#888;font-size:12px;padding-right:32px;margin-top:4px;">פניות שיתקבלו מחוץ לשעות הפעילות יטופלו ביום העסקים הבא</div>'+
    '</div>'+

    // כתובת
    '<div style="background:#222831;border:1px solid #5a6478;border-radius:12px;padding:16px;margin-bottom:16px;">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'+
        '<span style="font-size:22px;">📍</span>'+
        '<span style="font-size:15px;font-weight:700;color:#fff;">פרטי החברה</span>'+
      '</div>'+
      '<div style="color:#bbb;font-size:14px;padding-right:32px;margin-bottom:4px;">📌 '+b.address+'</div>'+
      '<div style="color:#bbb;font-size:14px;padding-right:32px;">🏢 ח.פ. '+b.taxId+'</div>'+
    '</div>'+

    // טיפ
    '<div style="background:#1a2a1a;border:1px solid #39e600;border-radius:10px;padding:12px;font-size:12px;color:#bbb;">'+
      '<b style="color:#39e600;">💡 טיפ:</b> לתגובה מהירה ביותר — שלחו הודעה בוואטסאפ. ברוב המקרים נחזור אליכם תוך מספר דקות בשעות הפעילות.'+
    '</div>'+

    '<div style="text-align:center;margin-top:24px;color:#666;font-size:11px;">'+
      'תודה שבחרתם ב-<b style="color:#39e600;">'+b.name+'</b>'+
    '</div>';
}

// ============================================================
// ============ 🚀 הזמנה ידנית מהירה ============
// ============================================================

// state של ההזמנה הידנית
var qoState={store:null,product:null,package:null};

// פתיחת המודל — אתחול הרשימות
function openQuickOrder(){
  // איפוס state
  qoState={store:null,product:null,package:null};

  // מילוי רשימת חנויות (לא מוקפאות, ממוינות לפי שם)
  var storeSel=document.getElementById('qo-store');
  if(storeSel){
    var avail=stores.filter(function(s){return !s.frozen;});
    avail.sort(function(a,b){return (a.name||'').localeCompare(b.name||'','he');});
    storeSel.innerHTML='<option value="">— בחר חנות —</option>'+avail.map(function(s){
      return '<option value="'+s.id+'">'+s.name+' (יתרה: ₪'+s.credit.toLocaleString()+')</option>';
    }).join('');
  }

  // איפוס מוצר וחבילה
  var prodSel=document.getElementById('qo-product');
  if(prodSel){
    prodSel.innerHTML='<option value="">— בחר חנות קודם —</option>';
    prodSel.disabled=true;
  }
  var pkgSel=document.getElementById('qo-package');
  if(pkgSel){
    pkgSel.innerHTML='<option value="">— בחר מוצר קודם —</option>';
    pkgSel.disabled=true;
  }

  // איפוס שדות
  var u=document.getElementById('qo-user');if(u)u.value='';
  var n=document.getElementById('qo-note');if(n)n.value='';
  var info=document.getElementById('qo-store-info');if(info)info.style.display='none';
  var sum=document.getElementById('qo-summary');if(sum)sum.style.display='none';
  var w=document.getElementById('qo-warning');if(w)w.style.display='none';

  // כפתור שליחה — מבוטל בהתחלה
  var btn=document.getElementById('qo-submit');
  if(btn){btn.disabled=true;btn.style.opacity='0.5';btn.textContent='✓ צור הזמנה';}

  // השהיית sync — שלא יקפוץ עדכון באמצע ההקלדה
  if(typeof pauseSyncFor==='function')pauseSyncFor(120000);

  // הצג מודל
  document.getElementById('quick-order-modal').style.display='flex';
}

function closeQuickOrder(){
  document.getElementById('quick-order-modal').style.display='none';
  qoState={store:null,product:null,package:null};
  SYNC_PAUSED_UNTIL=0; // ביטול השהיית sync
}

// כשבוחרים חנות
function qoOnStoreChange(){
  var sel=document.getElementById('qo-store');
  var info=document.getElementById('qo-store-info');
  var prodSel=document.getElementById('qo-product');
  if(!sel||!sel.value){
    qoState.store=null;
    if(info)info.style.display='none';
    if(prodSel){prodSel.innerHTML='<option value="">— בחר חנות קודם —</option>';prodSel.disabled=true;}
    qoUpdateSummary();
    return;
  }
  qoState.store=stores.find(function(s){return s.id===sel.value;});
  qoState.product=null;
  qoState.package=null;
  // הצגת מידע על החנות
  if(info&&qoState.store){
    var s=qoState.store;
    var debtLimit=s.debtLimit||0;
    var availableTotal=s.credit+debtLimit;
    info.innerHTML='💰 יתרה זמינה להזמנה: <b style="color:#39e600;">₪'+availableTotal.toLocaleString()+'</b>'+
      (debtLimit>0?' <span style="color:#888;">(כולל ₪'+debtLimit.toLocaleString()+' מסגרת אשראי)</span>':'');
    info.style.display='block';
  }
  // מילוי רשימת מוצרים
  if(prodSel){
    prodSel.innerHTML='<option value="">— בחר מוצר —</option>'+PRODS.map(function(p){
      return '<option value="'+p.id+'">'+p.name+'</option>';
    }).join('');
    prodSel.disabled=false;
    prodSel.value='';
  }
  // איפוס חבילה
  var pkgSel=document.getElementById('qo-package');
  if(pkgSel){pkgSel.innerHTML='<option value="">— בחר מוצר קודם —</option>';pkgSel.disabled=true;}
  qoUpdateSummary();
}

// כשבוחרים מוצר
function qoOnProductChange(){
  var sel=document.getElementById('qo-product');
  var pkgSel=document.getElementById('qo-package');
  var ulbl=document.getElementById('qo-user-label');
  if(!sel||!sel.value){
    qoState.product=null;
    if(pkgSel){pkgSel.innerHTML='<option value="">— בחר מוצר קודם —</option>';pkgSel.disabled=true;}
    qoUpdateSummary();
    return;
  }
  qoState.product=PRODS.find(function(p){return p.id===sel.value;});
  qoState.package=null;
  // עדכון תווית שם משתמש (לפי המוצר)
  if(ulbl&&qoState.product){
    ulbl.textContent=qoState.product.ul||'שם משתמש / ID';
  }
  // מילוי חבילות עם מחירים מותאמים לחנות הנבחרת
  if(pkgSel&&qoState.product&&qoState.store){
    var s=qoState.store;
    var prod=qoState.product;
    pkgSel.innerHTML='<option value="">— בחר חבילה —</option>'+prod.pkgs.map(function(pkg,idx){
      var price=sp(s,prod.id,pkg.p); // מחיר מותאם לחנות
      return '<option value="'+idx+'">'+pkg.a+' — ₪'+price.toLocaleString()+'</option>';
    }).join('');
    pkgSel.disabled=false;
    pkgSel.value='';
  }
  qoUpdateSummary();
}

// כשבוחרים חבילה
function qoOnPackageChange(){
  var sel=document.getElementById('qo-package');
  if(!sel||sel.value===''){
    qoState.package=null;
    qoUpdateSummary();
    return;
  }
  if(qoState.product){
    qoState.package=qoState.product.pkgs[parseInt(sel.value)];
  }
  qoUpdateSummary();
}

// עדכון סיכום מחיר/רווח/יתרה — כל פעם ששינוי
function qoUpdateSummary(){
  var sum=document.getElementById('qo-summary');
  var btn=document.getElementById('qo-submit');
  var warn=document.getElementById('qo-warning');
  if(!qoState.store||!qoState.product||!qoState.package){
    if(sum)sum.style.display='none';
    if(warn)warn.style.display='none';
    if(btn){btn.disabled=true;btn.style.opacity='0.5';}
    return;
  }
  var s=qoState.store;
  var prod=qoState.product;
  var pkg=qoState.package;
  // חישוב מחיר ללקוח (לפי המחירון של החנות)
  var price=sp(s,prod.id,pkg.p);
  // חישוב עלות לי (לפי dollar costs)
  var usdCost=getDollarCost(prod,pkg);
  var ilsCost=Math.round(usdCost*dollarRate);
  var profit=price-ilsCost;
  var balanceAfter=s.credit-price;

  // הצגת סיכום
  var pEl=document.getElementById('qo-price');
  var cEl=document.getElementById('qo-cost');
  var prEl=document.getElementById('qo-profit');
  var baEl=document.getElementById('qo-balance-after');
  if(pEl)pEl.textContent='₪'+price.toLocaleString();
  if(cEl)cEl.textContent='₪'+ilsCost.toLocaleString()+' ($'+usdCost.toFixed(2)+')';
  if(prEl){
    prEl.textContent='₪'+profit.toLocaleString();
    prEl.style.color=profit>=0?'#39e600':'#e24b4a';
  }
  if(baEl){
    baEl.textContent='₪'+balanceAfter.toLocaleString();
    baEl.style.color=balanceAfter>=0?'#888':'#e24b4a';
  }
  if(sum)sum.style.display='block';

  // בדיקת מסגרת אשראי
  var debtLimit=s.debtLimit||0;
  var maxAllowed=s.credit+debtLimit;
  if(price>maxAllowed){
    if(warn){
      warn.innerHTML='⛔ <b>חריגה ממסגרת!</b> ההזמנה (₪'+price.toLocaleString()+') חורגת מהיתרה הזמינה (₪'+maxAllowed.toLocaleString()+'). לא ניתן להמשיך.';
      warn.style.display='block';
      warn.style.color='#e24b4a';
      warn.style.borderColor='#5a2020';
    }
    if(btn){btn.disabled=true;btn.style.opacity='0.5';}
    return;
  } else if(balanceAfter<0){
    // נכנס לחוב אבל בתוך המסגרת
    if(warn){
      warn.innerHTML='⚠️ הזמנה זו תכניס את החנות לחוב של ₪'+Math.abs(balanceAfter).toLocaleString()+' (בתוך המסגרת).';
      warn.style.display='block';
      warn.style.color='#ef9f27';
      warn.style.borderColor='#3a2a00';
    }
  } else {
    if(warn)warn.style.display='none';
  }

  // אפשר שליחה
  if(btn){btn.disabled=false;btn.style.opacity='1';}
}

// יצירת ההזמנה — בעצם אותה לוגיקה כמו submitOrder אבל עם ה-state שלנו
async function submitQuickOrder(){
  if(!qoState.store||!qoState.product||!qoState.package){
    toast('t-admin','חסרים פרטים');
    return;
  }
  var user=(document.getElementById('qo-user')||{}).value||'';
  user=user.trim();
  if(!user){
    toast('t-admin','חובה להקליד שם שחקן');
    document.getElementById('qo-user').focus();
    return;
  }
  var note=((document.getElementById('qo-note')||{}).value||'').trim();
  var s=qoState.store;
  var prod=qoState.product;
  var pkg=qoState.package;
  var price=sp(s,prod.id,pkg.p);

  // בדיקת תקציב
  var debtLimit=s.debtLimit||0;
  if(price>s.credit+debtLimit){
    await cpAlert('ההזמנה חורגת מהמסגרת המאושרת',{type:'error',title:'⛔ חריגה ממסגרת'});
    return;
  }

  // אישור סופי
  var msg='🏪 חנות: '+s.name+'\n';
  msg+='🎮 מוצר: '+prod.name+' — '+pkg.a+'\n';
  msg+='👤 שחקן: '+user+'\n';
  if(note)msg+='📝 הערה: '+note+'\n';
  msg+='💰 מחיר: ₪'+price.toLocaleString()+'\n';
  msg+='💳 יתרה אחרי: ₪'+(s.credit-price).toLocaleString();
  if(!await cpConfirm(msg,{type:'question',title:'אישור הזמנה ידנית',okText:'בצע הזמנה'}))return;

  // ביצוע ההזמנה (אותה לוגיקה של submitOrder)
  s.credit-=price;
  s.log.unshift({t:'הזמנה: '+prod.name+' (ידנית ✋)',amt:price,plus:false,time:now(),user:user});
  var orderObj={
    id:Date.now(),storeId:s.id,storeName:s.name,
    prod:prod.name,pkg:pkg.a,price:price,basePrice:pkg.p,user:user,
    note:note?note+' (ידנית)':'הזמנה ידנית',
    status:'new',time:now(),manual:true
  };
  orders.unshift(orderObj);
  // 🔗 צור גם load מקושר (סנכרון אוטומטי)
  try{createLoadFromOrder(orderObj);saveLoads();}catch(e){console.warn('Failed to create load:',e);}

  // לוג ביקורת
  logAudit('order-manual','הזמנה ידנית',{
    storeId:s.id,storeName:s.name,product:prod.name,package:pkg.a,
    price:price,user:user
  });

  // רענון תצוגות
  try{renderStoreFront();}catch(e){}
  try{renderOrders();}catch(e){}
  try{updateStats();}catch(e){}
  try{renderLog();}catch(e){}
  try{if(typeof renderDashboard==='function')renderDashboard();}catch(e){}

  saveData();

  // התראה לטלגרם
  try{
    sendTelegram(
      '🔔 <b>הזמנה ידנית!</b> ✋\n\n'+
      '🏪 חנות: '+s.name+'\n'+
      '🎮 מוצר: '+prod.name+'\n'+
      '📦 כמות: '+pkg.a+'\n'+
      '👤 משתמש: '+user+'\n'+
      (note?'📝 הערה: '+note+'\n':'')+
      '💰 מחיר: ₪'+price+'\n'+
      '💳 יתרה: ₪'+s.credit.toLocaleString()+'\n'+
      '🕐 '+now()
    );
  }catch(e){}

  closeQuickOrder();
  toast('t-admin','✅ הזמנה ידנית נוצרה: '+prod.name+' '+pkg.a+' ל-'+user);
}

// הצגת הכפתור הצף רק כשהאדמין מחובר
function updateQuickOrderFab(){
  var fab=document.getElementById('quick-order-fab');
  if(!fab)return;
  var adminPage=document.getElementById('page-admin');
  var isAdmin=currentUser&&(currentUser.role==='admin'||currentUser.role==='reseller');
  var adminVisible=adminPage&&adminPage.classList.contains('on');
  fab.style.display=(isAdmin&&adminVisible)?'flex':'none';
  fab.style.alignItems='center';
  fab.style.justifyContent='center';

  // 💰 כפתור רווח מהיר - לחנות בעמוד החנות, ולמשווק בעמוד פאנל
  var marginFab=document.getElementById('margin-fab');
  if(marginFab){
    var isStore=currentUser&&currentUser.role==='store';
    var isReseller=currentUser&&currentUser.role==='reseller';
    var storePageVisible=document.getElementById('page-store')&&document.getElementById('page-store').classList.contains('on');
    var resellerPageVisible=document.getElementById('page-reseller')&&document.getElementById('page-reseller').classList.contains('on');
    var show=(isStore&&storePageVisible)||(isReseller&&resellerPageVisible);
    marginFab.style.display=show?'flex':'none';
    marginFab.style.alignItems='center';
    marginFab.style.justifyContent='center';
  }
}

// ============================================================
// ============ 💰 מערכת מרווח אוטומטי ============
// ============================================================
// משתמשים: חנות (קובעת מרווח על מה שהיא משלמת לי כדי לתמחר ללקוח)
// משווק: קובע מרווח על מה שכל חנות שלו משלמת לו
// הנוסחה: customerPrice = sp(s,prod,pkg) * (1 + pct/100) [או] + fixed

// state גלובלי של עמוד המרווח
var mgState={
  scope:'all',     // 'all' או 'prod'
  prodId:null,     // אם scope='prod'
  type:'pct',      // 'pct' או 'fixed'
  value:0,
  // למשווק: באיזו חנות הוא עכשיו עורך
  resellerStoreId:null
};

// קבלת חנות הרלוונטית לעריכה
function mgGetStore(){
  if(currentUser&&currentUser.role==='store'){
    return stores.find(function(s){return s.id===currentUser.storeId;});
  }
  if(currentUser&&currentUser.role==='reseller'&&mgState.resellerStoreId){
    return stores.find(function(s){return s.id===mgState.resellerStoreId;});
  }
  return null;
}

// רנדור עמוד הרווחים (לחנות)
function renderMarginPage(){
  var s=mgGetStore();
  if(!s){
    var wrap=document.getElementById('mg-current-list');
    if(wrap)wrap.innerHTML='<div style="text-align:center;padding:30px;color:#888;">לא נמצאה חנות</div>';
    return;
  }
  // אתחל ערכים לפי state
  mgSetScope(mgState.scope,true);
  mgSetType(mgState.type,true);
  // איכלוס select המוצרים
  var sel=document.getElementById('mg-prod-select');
  if(sel){
    var html='';
    PRODS.forEach(function(p){
      html+='<option value="'+p.id+'"'+(mgState.prodId===p.id?' selected':'')+'>'+p.name+'</option>';
    });
    sel.innerHTML=html;
    sel.onchange=function(){mgState.prodId=parseInt(this.value);mgPreview();};
    if(!mgState.prodId&&PRODS.length)mgState.prodId=PRODS[0].id;
  }
  // קיצורי דרך לפי סוג
  renderMgShortcuts();
  // רענון הקלט
  var inp=document.getElementById('mg-value');
  if(inp&&mgState.value)inp.value=mgState.value;
  // רענון תצוגה מקדימה
  mgPreview();
  // רענון רשימת המחירים הנוכחית
  renderMgCurrent();
}

function mgSetScope(scope,silent){
  mgState.scope=scope;
  document.getElementById('mg-scope-all').classList.toggle('on',scope==='all');
  document.getElementById('mg-scope-prod').classList.toggle('on',scope==='prod');
  var w=document.getElementById('mg-prod-select-wrap');
  if(w)w.style.display=scope==='prod'?'block':'none';
  if(!silent)mgPreview();
}

function mgSetType(type,silent){
  mgState.type=type;
  document.getElementById('mg-type-pct').classList.toggle('on',type==='pct');
  document.getElementById('mg-type-fixed').classList.toggle('on',type==='fixed');
  var lbl=document.getElementById('mg-value-label');
  var sfx=document.getElementById('mg-value-suffix');
  if(lbl)lbl.textContent=type==='pct'?'📈 אחוז רווח (%)':'💵 רווח קבוע (₪)';
  if(sfx)sfx.textContent=type==='pct'?'%':'₪';
  if(!silent){renderMgShortcuts();mgPreview();}
}

function renderMgShortcuts(){
  var w=document.getElementById('mg-shortcuts');
  if(!w)return;
  var values=mgState.type==='pct'?[5,10,15,20,30,50]:[1,2,3,5,10,20];
  var html='';
  values.forEach(function(v){
    html+='<button onclick="mgSetValue('+v+')" style="background:#2d3748;color:#86efac;border:1px solid #475467;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">+'+v+(mgState.type==='pct'?'%':'₪')+'</button>';
  });
  w.innerHTML=html;
}

function mgSetValue(v){
  mgState.value=v;
  var inp=document.getElementById('mg-value');
  if(inp)inp.value=v;
  mgPreview();
}

// חישוב מחיר ללקוח מסוים, לפי המרווח שנבחר
function mgComputePrice(s,prod,pkg){
  var basePay=sp(s,prod.id,pkg.p); // מה שהחנות משלמת לי
  var v=parseFloat(mgState.value)||0;
  if(v<=0)return basePay;
  if(mgState.type==='pct'){
    return Math.round(basePay*(1+v/100));
  }
  // fixed
  return Math.round(basePay+v);
}

function mgPreview(){
  var s=mgGetStore();
  if(!s)return;
  // קח את הערך מהשדה
  var inpEl=document.getElementById('mg-value');
  if(inpEl)mgState.value=parseFloat(inpEl.value)||0;
  var preview=document.getElementById('mg-preview');
  var list=document.getElementById('mg-preview-list');
  if(!preview||!list)return;
  if(!mgState.value||mgState.value<=0){
    preview.style.display='none';
    return;
  }
  // קבל מוצרים רלוונטיים
  var prodsToShow=mgState.scope==='all'
    ?PRODS.slice(0,2)  // 2 דוגמאות מתוך כולם
    :[PRODS.find(function(p){return p.id===mgState.prodId;})].filter(Boolean);
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
      html+='<span style="color:#888;">משלמת ₪'+basePay+'</span>';
      html+='<span style="color:#86efac;">→</span>';
      html+='<span style="color:#39e600;font-weight:700;">₪'+newPrice+' ללקוח</span>';
      html+='<span style="background:#1a3a1a;color:#86efac;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;">+₪'+profit+'</span>';
      html+='</span></div>';
      samples++;
    });
  });
  if(samples===0){
    preview.style.display='none';
    return;
  }
  list.innerHTML=html;
  preview.style.display='block';
}

async function mgApply(){
  var s=mgGetStore();
  if(!s){await cpAlert('לא נמצאה חנות',{type:'error'});return;}
  var inpEl=document.getElementById('mg-value');
  if(inpEl)mgState.value=parseFloat(inpEl.value)||0;
  if(!mgState.value||mgState.value<=0){
    await cpAlert('נא להזין ערך גדול מ-0',{type:'warning'});
    return;
  }
  var msg='';
  if(mgState.scope==='all'){
    msg='זה יעדכן את המחיר ללקוח של כל המוצרים\n';
    msg+='לפי '+(mgState.type==='pct'?'+'+mgState.value+'%':'+₪'+mgState.value+' קבוע')+'\n';
    msg+='מעל המחיר שאתה משלם לי על כל חבילה.\n\nלהמשיך?';
  }else{
    var prod=PRODS.find(function(p){return p.id===mgState.prodId;});
    msg='זה יעדכן את המחיר ללקוח רק של "'+(prod?prod.name:'')+'"\n';
    msg+='לפי '+(mgState.type==='pct'?'+'+mgState.value+'%':'+₪'+mgState.value+' קבוע')+'.\n\nלהמשיך?';
  }
  if(!await cpConfirm(msg,{type:'question',title:'אישור החלת רווח',okText:'החל'}))return;

  // החלה: עדכון s.costPrices
  if(!s.costPrices)s.costPrices={};
  var count=0;
  PRODS.forEach(function(p){
    if(mgState.scope==='prod'&&p.id!==mgState.prodId)return;
    p.pkgs.forEach(function(pkg){
      var newPrice=mgComputePrice(s,p,pkg);
      var key=p.id+'_'+pkg.p;
      s.costPrices[key]=newPrice;
      count++;
    });
  });
  saveData();
  logAudit('margin-apply','החלת מרווח אוטומטי',{
    storeId:s.id,storeName:s.name,
    scope:mgState.scope,
    type:mgState.type,
    value:mgState.value,
    productCount:count,
    actorRole:currentUser.role,
    actorName:currentUser.username
  });
  var toastTarget=currentUser.role==='reseller'?'t-reseller':'t-margin';
  if(!document.getElementById(toastTarget))toastTarget='t-store';
  toast(toastTarget,'✅ עודכנו '+count+' מחירים בהצלחה');
  // רענון
  if(currentUser.role==='store'){
    renderMgCurrent();
    if(typeof renderStoreFront==='function')try{renderStoreFront();}catch(e){}
  }else if(currentUser.role==='reseller'){
    if(typeof renderResellerStores==='function')try{renderResellerStores();}catch(e){}
  }
}

async function mgReset(){
  var s=mgGetStore();
  if(!s){await cpAlert('לא נמצאה חנות',{type:'error'});return;}
  var msg=mgState.scope==='all'
    ?'זה יאפס את כל המחירים שלך ללקוח חזרה למחיר הבסיס של המערכת.\nכל ההגדרות הידניות שלך יימחקו.\n\nלהמשיך?'
    :'זה יאפס רק את המוצר הנבחר חזרה למחיר הבסיס.\n\nלהמשיך?';
  if(!await cpConfirm(msg,{type:'danger',title:'איפוס למחירי בסיס',okText:'אפס'}))return;
  if(!s.costPrices)s.costPrices={};
  if(mgState.scope==='all'){
    s.costPrices={};
  }else{
    PRODS.forEach(function(p){
      if(p.id!==mgState.prodId)return;
      p.pkgs.forEach(function(pkg){
        delete s.costPrices[p.id+'_'+pkg.p];
      });
    });
  }
  saveData();
  logAudit('margin-reset','איפוס מרווח',{
    storeId:s.id,storeName:s.name,
    scope:mgState.scope,actorRole:currentUser.role,actorName:currentUser.username
  });
  var toastTarget=currentUser.role==='reseller'?'t-reseller':'t-margin';
  if(!document.getElementById(toastTarget))toastTarget='t-store';
  toast(toastTarget,'🔄 המחירים אופסו');
  if(currentUser.role==='store')renderMgCurrent();
}

function renderMgCurrent(){
  var s=mgGetStore();
  if(!s)return;
  var wrap=document.getElementById('mg-current-list');
  if(!wrap)return;
  var html='<table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html+='<thead><tr style="background:#2d3748;color:#aaa;">'+
    '<th style="padding:8px;text-align:right;">מוצר</th>'+
    '<th style="padding:8px;text-align:right;">חבילה</th>'+
    '<th style="padding:8px;text-align:center;">משלם לספק</th>'+
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
  html+='</tbody></table>';
  wrap.innerHTML=html;
}

// ============ פתיחה מהירה (FAB) ============
async function openMarginQuick(){
  // לחנות - פותח מודאל מקוצר
  // למשווק - פותח picker של חנויות, ואז את העמוד
  if(currentUser&&currentUser.role==='store'){
    // חנות - מודאל מהיר
    showMarginQuickModal();
    return;
  }
  if(currentUser&&currentUser.role==='reseller'){
    var myStores=rsGetMyStores();
    if(myStores.length===0){
      await cpAlert('אין לך עדיין חנויות',{type:'info'});
      return;
    }
    if(myStores.length===1){
      mgState.resellerStoreId=myStores[0].id;
      showMarginQuickModal();
      return;
    }
    // יותר מחנות אחת - תן לבחור
    var html='<div style="margin-bottom:10px;color:#aaa;font-size:13px;">בחר חנות לעריכה:</div>';
    myStores.forEach(function(s){
      html+='<button onclick="rsPickStoreForMargin(\''+s.id+'\')" style="display:block;width:100%;text-align:right;background:#2d3748;color:#fff;border:1px solid #475467;border-radius:8px;padding:12px;margin-bottom:6px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">🏪 '+s.name+' <span style="float:left;color:#888;font-size:11px;">קרדיט: ₪'+(s.credit||0).toLocaleString()+'</span></button>';
    });
    cpAlert(html,{title:'💰 הגדר רווח לחנות',html:true,icon:'💰',okText:'בטל'});
  }
}

function rsPickStoreForMargin(storeId){
  mgState.resellerStoreId=storeId;
  // סגור את המודאל הקיים
  var existing=document.querySelector('.cpd-overlay');
  if(existing)existing.remove();
  setTimeout(function(){showMarginQuickModal();},100);
}

function showMarginQuickModal(){
  var s=mgGetStore();
  if(!s){cpAlert('לא נמצאה חנות',{type:'error'});return;}
  var html='';
  html+='<div style="background:#0a1a0a;border:1px solid #1a3a1a;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px;color:#86efac;">';
  html+='💡 קביעה מהירה של רווח על כל המוצרים. למסך מלא — '+(currentUser.role==='store'?'לך לטאב "💰 רווחים"':'לך לטאב "💰 קביעת רווח"');
  html+='</div>';
  // טופס
  html+='<div style="margin-bottom:12px;"><label style="font-size:11px;color:#aaa;">סוג חישוב</label>';
  html+='<div style="display:flex;gap:6px;margin-top:4px;">';
  html+='<button id="mq-pct" onclick="mqType(\'pct\')" class="atab on">📊 אחוזים %</button>';
  html+='<button id="mq-fixed" onclick="mqType(\'fixed\')" class="atab">💵 ₪ קבוע</button>';
  html+='</div></div>';
  html+='<div style="margin-bottom:12px;"><label style="font-size:11px;color:#aaa;">ערך</label>';
  html+='<input id="mq-value" type="number" min="0" step="0.5" placeholder="20" style="width:100%;background:#1a2030;color:#fff;border:1px solid #5a6478;border-radius:8px;padding:10px;font-size:18px;font-weight:700;text-align:center;font-family:inherit;margin-top:4px;" oninput="mqUpdate()"/></div>';
  html+='<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;" id="mq-shortcuts"></div>';
  html+='<div id="mq-preview" style="background:#0a1a0a;border:1px solid #1a3a1a;border-radius:8px;padding:10px;margin-bottom:12px;display:none;">';
  html+='<div style="font-size:11px;color:#86efac;margin-bottom:6px;font-weight:700;">👁️ תצוגה מקדימה:</div>';
  html+='<div id="mq-preview-list" style="font-size:11.5px;"></div>';
  html+='</div>';
  html+='<button onclick="mqApply()" style="width:100%;background:linear-gradient(135deg,#39e600,#2ab800);color:#000;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;">✓ החל על כל המוצרים</button>';

  cpAlert(html,{
    title:'💰 הגדר רווח מהיר — '+s.name,
    html:true,icon:'💰',okText:'סגור',
    showClose:true
  });
  // אתחול state מהיר
  mgState.scope='all';
  mgState.type='pct';
  mgState.value=0;
  setTimeout(function(){mqShortcuts();},50);
}

function mqType(t){
  mgState.type=t;
  var pBtn=document.getElementById('mq-pct');
  var fBtn=document.getElementById('mq-fixed');
  if(pBtn)pBtn.classList.toggle('on',t==='pct');
  if(fBtn)fBtn.classList.toggle('on',t==='fixed');
  mqShortcuts();
  mqUpdate();
}

function mqShortcuts(){
  var w=document.getElementById('mq-shortcuts');
  if(!w)return;
  var values=mgState.type==='pct'?[5,10,15,20,30]:[1,2,3,5,10];
  var html='';
  values.forEach(function(v){
    html+='<button onclick="mqSetVal('+v+')" style="background:#2d3748;color:#86efac;border:1px solid #475467;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;flex:1;">+'+v+(mgState.type==='pct'?'%':'₪')+'</button>';
  });
  w.innerHTML=html;
}

function mqSetVal(v){
  var inp=document.getElementById('mq-value');
  if(inp)inp.value=v;
  mqUpdate();
}

function mqUpdate(){
  var inp=document.getElementById('mq-value');
  if(!inp)return;
  mgState.value=parseFloat(inp.value)||0;
  var s=mgGetStore();
  if(!s)return;
  var preview=document.getElementById('mq-preview');
  var list=document.getElementById('mq-preview-list');
  if(!preview||!list)return;
  if(!mgState.value||mgState.value<=0){preview.style.display='none';return;}
  // 3 דוגמאות
  var html='';
  var samples=[];
  for(var i=0;i<PRODS.length&&samples.length<3;i++){
    if(PRODS[i].pkgs.length){samples.push({prod:PRODS[i],pkg:PRODS[i].pkgs[0]});}
  }
  samples.forEach(function(item){
    var basePay=sp(s,item.prod.id,item.pkg.p);
    var newP=mgState.type==='pct'?Math.round(basePay*(1+mgState.value/100)):Math.round(basePay+mgState.value);
    var profit=newP-basePay;
    html+='<div style="display:flex;justify-content:space-between;padding:3px 0;">';
    html+='<span style="color:#ccc;">'+item.prod.name+'</span>';
    html+='<span><span style="color:#888;">₪'+basePay+'</span> → <span style="color:#39e600;font-weight:700;">₪'+newP+'</span> <span style="color:#86efac;">(+₪'+profit+')</span></span>';
    html+='</div>';
  });
  list.innerHTML=html;
  preview.style.display='block';
}

async function mqApply(){
  var s=mgGetStore();
  if(!s){await cpAlert('לא נמצאה חנות',{type:'error'});return;}
  var inp=document.getElementById('mq-value');
  if(inp)mgState.value=parseFloat(inp.value)||0;
  if(!mgState.value||mgState.value<=0){
    await cpAlert('נא להזין ערך גדול מ-0',{type:'warning'});
    return;
  }
  // סגור את המודאל ועבור ל-mgApply הרגיל
  var existing=document.querySelector('.cpd-overlay');
  if(existing)existing.remove();
  mgState.scope='all';
  setTimeout(function(){mgApply();},100);
}

function bnavGo(tab){
  document.querySelectorAll('.bnav-btn').forEach(b=>b.classList.remove('on'));
  document.getElementById('bn-'+tab).classList.add('on');
  // אם המשתמש הוא חנות - השתמש בדפים שלו
  var isStoreUser=currentUser&&currentUser.role==='store';
  if(tab==='store'){
    showPage('page-store');renderStoreFront();
  }
  else if(tab==='orders'){
    if(isStoreUser){
      showPage('page-my-orders');
      if(typeof renderMyOrders==='function')renderMyOrders();
    } else {
      // אדמין/משווק במובייל - השאר את ההתנהגות הישנה
      showPage('page-admin');
      var atabs=document.querySelectorAll('.atab');
      if(atabs[1])atabs[1].click();
    }
  }
  else if(tab==='log'){
    if(isStoreUser){
      // לחנות: "יומן" = הקרדיט שלי (תנועות)
      showPage('page-my-credit');
      if(typeof renderMyCredit==='function')renderMyCredit();
    } else {
      showPage('page-admin');
      var atabs=document.querySelectorAll('.atab');
      if(atabs[3])atabs[3].click();
    }
  }
}

// ============================================================
// ============ 🏪 פונקציות חנות - הזמנות וקרדיט ============
// ============================================================

// רינדור חנויות עם חוב פתוח (לאדמין, בטאב חובות)
function renderUnpaidStores(){
  var list=document.getElementById('unpaid-stores-list');
  var summary=document.getElementById('unpaid-stores-summary');
  if(!list)return;

  var search=(document.getElementById('unpaid-search')||{}).value||'';
  var sortMode=(document.getElementById('unpaid-sort')||{}).value||'biggest';
  search=search.trim().toLowerCase();

  // רק חנויות שיש להן חוב פתוח
  var unpaidStores=stores.filter(function(s){return (s.unpaidBalance||0)>0;});

  // סינון לפי שם
  var filtered=unpaidStores;
  if(search){
    filtered=unpaidStores.filter(function(s){
      return (s.name||'').toLowerCase().indexOf(search)!==-1;
    });
  }

  // מיון
  filtered.sort(function(a,b){
    if(sortMode==='smallest')return (a.unpaidBalance||0)-(b.unpaidBalance||0);
    if(sortMode==='recent')return (b.unpaidUpdatedAt||0)-(a.unpaidUpdatedAt||0);
    if(sortMode==='oldest')return (a.unpaidUpdatedAt||0)-(b.unpaidUpdatedAt||0);
    return (b.unpaidBalance||0)-(a.unpaidBalance||0); // biggest default
  });

  // סיכום
  var totalUnpaid=unpaidStores.reduce(function(t,s){return t+(s.unpaidBalance||0);},0);
  if(summary){
    if(unpaidStores.length===0){
      summary.textContent='✅ הכל שולם';
      summary.style.color='#39e600';
    } else {
      summary.textContent='₪'+totalUnpaid.toLocaleString()+' פתוח · '+unpaidStores.length+' חנויות';
      summary.style.color='#ef9f27';
    }
  }

  if(filtered.length===0){
    list.innerHTML='<div style="text-align:center;padding:30px;color:#666;font-size:13px;">'+(unpaidStores.length===0?'✅ אין חוב פתוח. הכל שולם!':'אין תוצאות לסינון')+'</div>';
    return;
  }

  list.innerHTML=filtered.map(function(s){
    var amt=s.unpaidBalance||0;
    var updatedStr='';
    if(s.unpaidUpdatedAt){
      try{
        var d=new Date(s.unpaidUpdatedAt);
        updatedStr=d.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit'})+' '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
      }catch(e){}
    }
    var hasUnpaid=amt>0;
    var bgColor=hasUnpaid?'#3a2828':'#1a1f2a';
    var amtColor=hasUnpaid?'#ef9f27':'#666';
    return '<div style="background:'+bgColor+';border-bottom:1px solid #2a2a2a;padding:14px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px;">'+
      '<div style="flex:1;min-width:160px;">'+
      '<div style="font-size:15px;font-weight:700;color:#fff;">🏪 '+s.name+'</div>'+
      (updatedStr?'<div style="font-size:11px;color:#888;margin-top:4px;">עודכן: '+updatedStr+'</div>':'')+
      '</div>'+
      '<div style="text-align:left;white-space:nowrap;">'+
      '<div style="font-size:11px;color:#888;">חוב פתוח</div>'+
      '<div style="font-size:22px;font-weight:800;color:'+amtColor+';">₪'+amt.toLocaleString()+'</div>'+
      '</div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;">'+
      (hasUnpaid?'<button onclick="recordPayment(\''+s.id+'\')" style="flex:1;background:linear-gradient(135deg,#39e600,#2ab800);color:#000;border:none;border-radius:8px;padding:10px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">💰 שולם לי...</button>':'')+
      '<button onclick="editUnpaidBalance(\''+s.id+'\')" style="'+(hasUnpaid?'':'flex:1;')+'background:#475467;color:#fff;border:1px solid #5a6478;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;" title="ערוך סכום ידנית">✏️ ערוך סכום</button>'+
      '</div>'+
      '</div>';
  }).join('');
}

// עריכת חוב פתוח ידנית — לתיקוני נתונים
async function editUnpaidBalance(storeId){
  var s=stores.find(function(x){return x.id===storeId;});
  if(!s)return;
  var current=s.unpaidBalance||0;
  var input=await cpPrompt('סכום נוכחי: ₪'+current.toLocaleString()+'\n\nהקלד סכום חדש (0 לאיפוס):',{
    title:'✏️ עריכת חוב פתוח — '+s.name,
    icon:'✏️',
    inputType:'number',
    min:0,
    default:current,
    placeholder:'סכום בש"ח'
  });
  if(input===null)return;
  input=String(input).trim();
  if(input==='')return;
  var newAmt=parseInt(input);
  if(isNaN(newAmt)||newAmt<0){toast('t-admin','סכום לא תקין');return;}
  if(!await cpConfirm('לעדכן את החוב הפתוח של "'+s.name+'" מ-₪'+current.toLocaleString()+' ל-₪'+newAmt.toLocaleString()+'?',{type:'question',okText:'עדכן'}))return;
  s.unpaidBalance=newAmt;
  s.unpaidUpdatedAt=Date.now();
  logAudit('unpaid-edit','עריכת חוב פתוח ידנית',{
    storeId:s.id,storeName:s.name,from:current,to:newAmt
  });
  saveData();
  if(typeof renderUnpaidStores==='function')renderUnpaidStores();
  if(typeof renderDebtsTab==='function')renderDebtsTab();
  if(typeof renderMyCredit==='function'){
    var myCreditPage=document.getElementById('page-my-credit');
    if(myCreditPage&&myCreditPage.classList.contains('on'))renderMyCredit();
  }
  toast('t-admin','✅ חוב פתוח עודכן ל-₪'+newAmt.toLocaleString());
}

// פונקציית עזר: השג את חנות המשתמש הנוכחי (אם הוא חנות)
function getCurrentStore(){
  if(!currentUser)return null;
  if(currentUser.role==='store'&&currentUser.storeId){
    return stores.find(function(s){return s.id===currentUser.storeId;})||null;
  }
  // בשביל אדמין שמסתכל בתצוגת חנות, נחזיר את prevId
  if(currentUser.role==='admin'||currentUser.role==='reseller'){
    return stores.find(function(s){return s.id===prevId;})||null;
  }
  return null;
}

// ============ 📋 ההזמנות שלי ============
function renderMyOrders(){
  var s=getCurrentStore();
  if(!s){
    var list=document.getElementById('myo-list');
    if(list)list.innerHTML='<div style="text-align:center;padding:30px;color:#666;font-size:13px;">לא נמצאה חנות מקושרת</div>';
    return;
  }

  // כל ההזמנות של החנות
  var allOrders=orders.filter(function(o){return o.storeId===s.id;});

  // פילטרים
  var search=(document.getElementById('myo-search')||{}).value||'';
  var statusFilter=(document.getElementById('myo-filter-status')||{}).value||'all';
  var periodFilter=(document.getElementById('myo-filter-period')||{}).value||'all';
  search=search.trim().toLowerCase();

  // חישוב חתך תקופה
  var nowMs=Date.now();
  var DAY=24*60*60*1000;
  var periodCutoff=0;
  if(periodFilter==='today'){
    var d=new Date();d.setHours(0,0,0,0);periodCutoff=d.getTime();
  }else if(periodFilter==='week'){
    periodCutoff=nowMs-7*DAY;
  }else if(periodFilter==='month'){
    periodCutoff=nowMs-30*DAY;
  }

  var filtered=allOrders.filter(function(o){
    if(statusFilter!=='all'&&(o.status||'new')!==statusFilter)return false;
    if(periodCutoff>0){
      // o.id הוא Date.now() בעת היצירה
      if(typeof o.id==='number'&&o.id<periodCutoff)return false;
    }
    if(search){
      var hay=((o.user||'')+' '+(o.prod||'')+' '+(o.pkg||'')+' '+(o.note||'')).toLowerCase();
      if(hay.indexOf(search)===-1)return false;
    }
    return true;
  });

  // עדכון ספירות
  var totalEl=document.getElementById('myo-total');
  var doneEl=document.getElementById('myo-done');
  var pendingEl=document.getElementById('myo-pending');
  if(totalEl)totalEl.textContent=allOrders.length;
  if(doneEl)doneEl.textContent=allOrders.filter(function(o){return o.status==='done';}).length;
  if(pendingEl)pendingEl.textContent=allOrders.filter(function(o){return (o.status||'new')==='new';}).length;

  // רינדור רשימה
  var list=document.getElementById('myo-list');
  var summary=document.getElementById('myo-summary');
  if(!list)return;

  if(filtered.length===0){
    list.innerHTML='<div style="text-align:center;padding:30px;color:#666;font-size:13px;">'+(allOrders.length===0?'עדיין לא ביצעת הזמנות. עבור לטאב 🛒 חנות.':'אין תוצאות לסינון')+'</div>';
    if(summary)summary.textContent='';
    return;
  }

  var html=filtered.map(function(o){
    var status=o.status||'new';
    var statusBadge=status==='done'?
      '<span style="background:#1a2a1a;color:#39e600;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">✅ הושלמה</span>':
      '<span style="background:#3a3528;color:#ef9f27;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">⏱️ ממתינה</span>';
    var dateStr='';
    if(typeof o.id==='number'){
      try{
        var d=new Date(o.id);
        dateStr=d.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit'});
      }catch(e){}
    }
    return '<div style="background:'+(status==='done'?'#1a2a1a':'#222831')+';border-bottom:1px solid #2a2a2a;padding:12px 14px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px;">'+
      '<div style="flex:1;min-width:200px;">'+
      '<div style="font-size:14px;font-weight:700;color:#fff;">🎮 '+(o.prod||'—')+' · '+(o.pkg||'—')+'</div>'+
      '<div style="font-size:12px;color:#bbb;margin-top:3px;">👤 שחקן: <span style="color:#fff;font-weight:600;">'+(o.user||'—')+'</span></div>'+
      (o.note?'<div style="font-size:11px;color:#888;margin-top:3px;">📝 '+o.note+'</div>':'')+
      '</div>'+
      '<div style="text-align:left;white-space:nowrap;">'+
      '<div style="font-size:16px;font-weight:800;color:#39e600;">₪'+(o.price||0)+'</div>'+
      '<div style="margin-top:4px;">'+statusBadge+'</div>'+
      '</div>'+
      '</div>'+
      '<div style="font-size:11px;color:#666;font-family:monospace;text-align:left;">'+
      (dateStr?dateStr+' · ':'')+(o.time||'')+
      '</div>'+
      '</div>';
  }).join('');

  list.innerHTML=html;

  // סיכום
  if(summary){
    var totalSpent=filtered.reduce(function(t,o){return t+(o.price||0);},0);
    summary.textContent='מציג '+filtered.length+' הזמנות · סה"כ ₪'+totalSpent.toLocaleString();
  }
}

// ייצוא הזמנות החנות ל-CSV
function exportMyOrders(){
  var s=getCurrentStore();
  if(!s){toast('t-my-orders','לא נמצאה חנות');return;}
  var myOrders=orders.filter(function(o){return o.storeId===s.id;});
  if(myOrders.length===0){toast('t-my-orders','אין הזמנות לייצוא');return;}
  var rows=[
    ['תאריך','שעה','מוצר','כמות','שחקן','הערה','מחיר','סטטוס'],
    ...myOrders.map(function(o){
      var dateStr='';
      if(typeof o.id==='number'){
        try{dateStr=new Date(o.id).toLocaleDateString('he-IL');}catch(e){}
      }
      return[dateStr,o.time||'',o.prod||'',o.pkg||'',o.user||'',o.note||'',o.price||0,o.status==='done'?'הושלמה':'ממתינה'];
    })
  ];
  downloadCSV('הזמנות_'+s.name+'_'+new Date().toLocaleDateString('he-IL').replace(/\//g,'-')+'.csv',rows);
  toast('t-my-orders','✅ הקובץ הורד');
}

// ============ 💳 הקרדיט שלי ============
function renderMyCredit(){
  var s=getCurrentStore();
  if(!s){
    var list=document.getElementById('myc-list');
    if(list)list.innerHTML='<div style="text-align:center;padding:30px;color:#666;font-size:13px;">לא נמצאה חנות מקושרת</div>';
    return;
  }

  // יתרה נוכחית
  var balanceEl=document.getElementById('myc-balance');
  var balanceSub=document.getElementById('myc-balance-sub');
  if(balanceEl){
    if(s.credit<0){
      balanceEl.textContent='חוב: ₪'+Math.abs(s.credit).toLocaleString();
      balanceEl.style.color='#e24b4a';
      if(balanceSub){balanceSub.textContent='⚠️ יתרה שלילית';balanceSub.style.color='#e24b4a';}
    }else{
      balanceEl.textContent='₪'+s.credit.toLocaleString();
      balanceEl.style.color='#39e600';
      if(balanceSub){
        if(s.credit===0){balanceSub.textContent='הקרדיט אזל';balanceSub.style.color='#ef9f27';}
        else{balanceSub.textContent='זמין להזמנה';balanceSub.style.color='#888';}
      }
    }
  }

  // חישוב סה"כ טעינות והוצאות מהיומן (חישוב חכם — מתעלם מתיקונים/תשלומים)
  var log=Array.isArray(s.log)?s.log:[];
  // טעינות אמיתיות (l.plus=true ולא תיקון)
  var realLoads=log.filter(function(l){return l.plus&&!l.isReduction&&!l.isPayment;});
  var totalLoadedRaw=realLoads.reduce(function(t,l){return t+(l.amt||0);},0);
  // הפחתות (תיקוני טעות) — מורידות מסה"כ נטען
  var totalReductions=log.filter(function(l){return l.isReduction;}).reduce(function(t,l){return t+(l.amt||0);},0);
  // נטו: מה שבאמת נטען (אחרי תיקוני טעות)
  var totalLoaded=Math.max(0,totalLoadedRaw-totalReductions);
  // הוצאות אמיתיות (הזמנות בלבד — לא הפחתות, לא תשלומי חוב)
  var realSpends=log.filter(function(l){return !l.plus&&!l.isReduction&&!l.isPayment;});
  var totalSpent=realSpends.reduce(function(t,l){return t+(l.amt||0);},0);
  var loadCount=realLoads.length;
  var spendCount=realSpends.length;

  var loadedEl=document.getElementById('myc-loaded');
  var loadedSub=document.getElementById('myc-loaded-sub');
  var spentEl=document.getElementById('myc-spent');
  var spentSub=document.getElementById('myc-spent-sub');
  if(loadedEl)loadedEl.textContent='₪'+totalLoaded.toLocaleString();
  if(loadedSub){
    if(totalReductions>0){
      loadedSub.textContent=loadCount+' טעינות (אחרי תיקון של ₪'+totalReductions.toLocaleString()+')';
    } else {
      loadedSub.textContent=loadCount+' טעינות';
    }
  }
  if(spentEl)spentEl.textContent='₪'+totalSpent.toLocaleString();
  if(spentSub)spentSub.textContent=spendCount+' הזמנות';

  // מסגרת חוב
  var debtCard=document.getElementById('myc-debt-card');
  if(debtCard){
    var debtLimit=s.debtLimit||0;
    if(debtLimit>0){
      debtCard.style.display='block';
      var currentDebt=s.credit<0?Math.abs(s.credit):0;
      var available=debtLimit-currentDebt;
      var pct=debtLimit>0?Math.min(100,(currentDebt/debtLimit)*100):0;
      var dl=document.getElementById('myc-debt-limit');
      var dc=document.getElementById('myc-debt-current');
      var da=document.getElementById('myc-debt-available');
      var bar=document.getElementById('myc-debt-bar');
      if(dl)dl.textContent='₪'+debtLimit.toLocaleString();
      if(dc)dc.textContent='₪'+currentDebt.toLocaleString();
      if(da)da.textContent='₪'+Math.max(0,available).toLocaleString();
      if(bar)bar.style.width=pct+'%';
    }else{
      debtCard.style.display='none';
    }
  }

  // 💳 חוב פתוח (סכום פשוט + תאריך עדכון)
  var unpaidCard=document.getElementById('myc-unpaid-card');
  if(unpaidCard){
    var unpaidAmt=s.unpaidBalance||0;
    if(unpaidAmt>0){
      unpaidCard.style.display='block';
      var ut=document.getElementById('myc-unpaid-total');
      var uu=document.getElementById('myc-unpaid-updated');
      if(ut)ut.textContent='₪'+unpaidAmt.toLocaleString();
      if(uu){
        if(s.unpaidUpdatedAt){
          try{
            var d=new Date(s.unpaidUpdatedAt);
            var dateStr=d.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit'});
            var timeStr=d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
            uu.textContent='עודכן לאחרונה: '+dateStr+' '+timeStr;
          }catch(e){uu.textContent='—';}
        } else {
          uu.textContent='—';
        }
      }
    } else {
      unpaidCard.style.display='none';
    }
  }

  // רינדור רשימת תנועות
  var list=document.getElementById('myc-list');
  var summary=document.getElementById('myc-summary');
  if(!list)return;

  var typeFilter=(document.getElementById('myc-filter-type')||{}).value||'all';
  var periodFilter=(document.getElementById('myc-filter-period')||{}).value||'30';

  var filtered=log.filter(function(l){
    if(typeFilter==='plus'&&!l.plus)return false;
    if(typeFilter==='minus'&&l.plus)return false;
    return true;
  });

  var displayItems=filtered;
  if(periodFilter!=='all'){
    var limit=parseInt(periodFilter)||30;
    displayItems=filtered.slice(0,limit);
  }

  if(displayItems.length===0){
    list.innerHTML='<div style="text-align:center;padding:30px;color:#666;font-size:13px;">'+(log.length===0?'אין תנועות עדיין':'אין תוצאות לסינון')+'</div>';
    if(summary)summary.textContent='';
    return;
  }

  var html=displayItems.map(function(l){
    var bg=l.plus?'#1a2a1a':(l.isPayment?'#1a2a3a':'#3a2828');
    var sign=l.plus?'+':'-';
    var color=l.plus?'#39e600':(l.isPayment?'#5dade2':'#e24b4a');
    var icon=l.plus?'📥':(l.isPayment?'💰':'📤');
    return '<div style="background:'+bg+';border-bottom:1px solid #2a2a2a;padding:12px 14px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'+
      '<div style="flex:1;min-width:140px;">'+
      '<div style="font-size:13px;font-weight:700;color:#fff;">'+icon+' '+(l.t||'—')+'</div>'+
      (l.user?'<div style="font-size:11px;color:#888;margin-top:3px;">👤 '+l.user+'</div>':'')+
      '</div>'+
      '<div style="text-align:left;white-space:nowrap;">'+
      '<div style="font-size:16px;font-weight:800;color:'+color+';">'+sign+'₪'+(l.amt||0).toLocaleString()+'</div>'+
      '<div style="font-size:11px;color:#666;font-family:monospace;margin-top:2px;">'+(l.time||'')+'</div>'+
      '</div>'+
      '</div></div>';
  }).join('');

  list.innerHTML=html;

  if(summary){
    summary.textContent='מציג '+displayItems.length+' מתוך '+filtered.length+' תנועות'+(periodFilter!=='all'&&filtered.length>displayItems.length?' (יש עוד — בחר "הכל" לצפיה)':'');
  }
}

// ייצוא תנועות ל-CSV
function exportMyCredit(){
  var s=getCurrentStore();
  if(!s){toast('t-my-credit','לא נמצאה חנות');return;}
  var log=Array.isArray(s.log)?s.log:[];
  if(log.length===0){toast('t-my-credit','אין תנועות לייצוא');return;}
  var rows=[
    ['שעה','סוג','תיאור','שחקן','סכום','חתימה'],
    ...log.map(function(l){
      return[l.time||'',l.plus?'טעינה':'הוצאה',l.t||'',l.user||'',l.amt||0,l.plus?'+':'-'];
    })
  ];
  downloadCSV('תנועות_'+s.name+'_'+new Date().toLocaleDateString('he-IL').replace(/\//g,'-')+'.csv',rows);
  toast('t-my-credit','✅ הקובץ הורד');
}

// ============================================================
// ============ 🛡️ פונקציות UI - טאב אבטחה ============
// ============================================================

// ============================================================
// 🖥️ מערכת סשנים פעילים
// ============================================================

// מאגר סשנים — מתעדכן בזמן אמת
const _activeSessions = {};
let _mySessionId = null;
let _myIpData = null;

// יצירת ID ייחודי לסשן
function _genSessionId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

// זיהוי מכשיר מ-UserAgent
function _parseDevice(ua){
  if(!ua) return {device:'לא ידוע', browser:'לא ידוע', os:'לא ידוע'};
  let device='💻 מחשב', os='', browser='';
  if(/iPhone/i.test(ua)) device='📱 iPhone';
  else if(/Android/i.test(ua) && /Mobile/i.test(ua)) device='📱 אנדרואיד';
  else if(/iPad/i.test(ua)) device='📟 iPad';
  else if(/Android/i.test(ua)) device='📟 טאבלט';
  if(/Windows NT 10/i.test(ua)) os='Windows 10/11';
  else if(/Windows NT/i.test(ua)) os='Windows';
  else if(/Mac OS X/i.test(ua)) os='macOS';
  else if(/Android/i.test(ua)) os='Android';
  else if(/iPhone OS/i.test(ua)||/iOS/i.test(ua)) os='iOS';
  else if(/Linux/i.test(ua)) os='Linux';
  if(/Edg\//i.test(ua)) browser='Edge';
  else if(/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser='Chrome';
  else if(/Firefox\//i.test(ua)) browser='Firefox';
  else if(/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser='Safari';
  else if(/OPR\//i.test(ua)||/Opera/i.test(ua)) browser='Opera';
  else browser='דפדפן לא ידוע';
  return {device, browser, os};
}

// שמירת סשן ב-Firestore
async function _saveSessionToFirestore(sessionData){
  if(!window.fbOK||!window.db) return;
  try{
    await window.db.collection('cashphone_sessions').doc(sessionData.id).set(sessionData);
  }catch(e){ console.warn('Session save failed:',e); }
}

// מחיקת סשן מ-Firestore (ביציאה)
async function _removeSessionFromFirestore(sessionId){
  if(!window.fbOK||!window.db) return;
  try{
    await window.db.collection('cashphone_sessions').doc(sessionId).delete();
  }catch(e){ console.warn('Session remove failed:',e); }
}

// קבלת IP ומיקום
async function _fetchIpData(){
  try{
    const res = await fetch('https://ipapi.co/json/', {signal: AbortSignal.timeout(4000)});
    if(res.ok) return await res.json();
  }catch(e){}
  try{
    const res2 = await fetch('https://api.ipify.org?format=json', {signal: AbortSignal.timeout(3000)});
    if(res2.ok){ const d=await res2.json(); return {ip:d.ip,city:'—',country_name:'—'}; }
  }catch(e){}
  return {ip:'לא ידוע',city:'—',country_name:'—'};
}

// אתחול סשן — נקרא מ-doLogin
async function initSession(username, role){
  _mySessionId = _genSessionId();
  _myIpData = await _fetchIpData();
  const dev = _parseDevice(navigator.userAgent);
  const sessionData = {
    id: _mySessionId,
    username,
    role,
    ip: _myIpData.ip || 'לא ידוע',
    city: _myIpData.city || '—',
    country: _myIpData.country_name || '—',
    device: dev.device,
    browser: dev.browser,
    os: dev.os,
    loginTime: Date.now(),
    lastSeen: Date.now(),
    userAgent: navigator.userAgent.slice(0,120)
  };
  _activeSessions[_mySessionId] = sessionData;
  await _saveSessionToFirestore(sessionData);
  // Heartbeat כל 30 שניות
  if(window._sessionHeartbeat) clearInterval(window._sessionHeartbeat);
  window._sessionHeartbeat = setInterval(async function(){
    if(_mySessionId && _activeSessions[_mySessionId]){
      _activeSessions[_mySessionId].lastSeen = Date.now();
      if(window.fbOK && window.db){
        try{ await window.db.collection('cashphone_sessions').doc(_mySessionId).update({lastSeen: Date.now()}); }catch(e){}
      }
    }
  }, 30000);
}

// סיום סשן — נקרא מ-doLogout
async function endSession(){
  if(window._sessionHeartbeat) clearInterval(window._sessionHeartbeat);
  if(_mySessionId){
    delete _activeSessions[_mySessionId];
    await _removeSessionFromFirestore(_mySessionId);
    _mySessionId = null;
  }
}

// ניתוק סשן של משתמש אחר (רק אדמין)
async function kickSession(sessionId){
  if(!currentUser||currentUser.role!=='admin') return;
  if(sessionId===_mySessionId){ cpAlert('לא ניתן לנתק את עצמך 😄','warning'); return; }
  if(window.fbOK&&window.db){
    try{ await window.db.collection('cashphone_sessions').doc(sessionId).delete(); }catch(e){}
  }
  delete _activeSessions[sessionId];
  renderSessionsTab();
  toast('t-admin','✅ המשתמש נותק');
}

// שחרור נעילה של משתמש
function unlockUser(username){
  _resetAttempts(username);
  renderSessionsTab();
  toast('t-admin','✅ הנעילה של '+username+' שוחררה');
}

// פורמט זמן
function _timeAgo(ts){
  const diff = Date.now() - ts;
  const s = Math.floor(diff/1000);
  if(s<60) return 'לפני '+s+' שניות';
  const m = Math.floor(s/60);
  if(m<60) return 'לפני '+m+' דקות';
  const h = Math.floor(m/60);
  return 'לפני '+h+' שעות';
}
function _duration(ts){
  const diff = Date.now() - ts;
  const m = Math.floor(diff/60000);
  if(m<60) return m+' דק\'';
  return Math.floor(m/60)+'ש\' '+(m%60)+'ד\'';
}

// רינדור טאב הסשנים
async function renderSessionsTab(){
  const el = document.getElementById('sessions-list');
  const lockedEl = document.getElementById('locked-users-list');
  if(!el) return;

  el.innerHTML = '<div style="color:#aaa;font-size:13px;text-align:center;padding:20px;">⏳ טוען סשנים...</div>';

  // שלוף סשנים מ-Firestore
  let sessions = [];
  if(window.fbOK && window.db){
    try{
      const snap = await window.db.collection('cashphone_sessions').get();
      snap.forEach(doc => { sessions.push(doc.data()); });
      // נקה סשנים ישנים (חסרי heartbeat מעל 3 דקות)
      const stale = sessions.filter(s => Date.now() - s.lastSeen > 3*60*1000);
      for(const s of stale){
        try{ await window.db.collection('cashphone_sessions').doc(s.id).delete(); }catch(e){}
      }
      sessions = sessions.filter(s => Date.now() - s.lastSeen <= 3*60*1000);
    }catch(e){ sessions = Object.values(_activeSessions); }
  } else {
    sessions = Object.values(_activeSessions);
  }

  if(sessions.length===0){
    el.innerHTML='<div style="color:#888;font-size:13px;text-align:center;padding:20px;">אין סשנים פעילים כרגע</div>';
  } else {
    let html='';
    sessions.forEach(function(s){
      const isMe = s.id === _mySessionId;
      const roleIcon = s.role==='admin'?'👑':s.role==='reseller'?'💼':'🏪';
      html += '<div style="background:'+(isMe?'#1a2a1a':'#2d3748')+';border:1px solid '+(isMe?'#39e600':'#475467')+';border-radius:10px;padding:12px 14px;margin-bottom:10px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">';
      html += '<div>';
      html += '<div style="font-weight:700;color:#fff;font-size:14px;">'+roleIcon+' '+s.username+(isMe?' <span style="font-size:11px;background:#39e600;color:#000;padding:1px 6px;border-radius:8px;font-weight:700;">אתה</span>':'')+'</div>';
      html += '<div style="font-size:12px;color:#aaa;margin-top:4px;">🌐 IP: <b style="color:#fff;">'+s.ip+'</b>';
      if(s.city&&s.city!=='—') html += ' &nbsp;📍 '+s.city+', '+s.country;
      html += '</div>';
      html += '<div style="font-size:12px;color:#aaa;margin-top:2px;">'+s.device+' &nbsp;|&nbsp; '+s.browser+' &nbsp;|&nbsp; '+s.os+'</div>';
      html += '<div style="font-size:12px;color:#aaa;margin-top:2px;">⏰ נכנס: '+new Date(s.loginTime).toLocaleString('he-IL')+' &nbsp;('+_duration(s.loginTime)+' מחובר)</div>';
      html += '<div style="font-size:11px;color:#666;margin-top:2px;">עדכון אחרון: '+_timeAgo(s.lastSeen)+'</div>';
      html += '</div>';
      if(!isMe){
        html += '<button onclick="kickSession(\''+s.id+'\')" style="background:#e24b4a;color:#fff;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap;">⛔ נתק</button>';
      }
      html += '</div></div>';
    });
    el.innerHTML = html;
  }

  // משתמשים חסומים
  if(lockedEl){
    const locked = Object.entries(_loginAttempts)
      .filter(([k,v]) => v.locked)
      .map(([k,v]) => ({username: k.replace('rl_',''), data: v}));
    if(locked.length===0){
      lockedEl.innerHTML='<div style="color:#888;font-size:13px;text-align:center;padding:16px;">אין משתמשים חסומים כרגע ✅</div>';
    } else {
      let html='';
      locked.forEach(function(l){
        const remaining = Math.ceil((LOCKOUT_MINUTES*60*1000-(Date.now()-l.data.firstAttempt))/60000);
        html+='<div style="background:#2a1a1a;border:1px solid #e24b4a;border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">';
        html+='<div><div style="color:#fff;font-weight:700;">🔒 '+l.username+'</div>';
        html+='<div style="font-size:12px;color:#aaa;">'+l.data.count+' ניסיונות כושלים — עוד '+Math.max(0,remaining)+' דקות לשחרור</div></div>';
        html+='<button onclick="unlockUser(\''+l.username+'\')" style="background:#39e600;color:#000;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:700;">🔓 שחרר</button>';
        html+='</div>';
      });
      lockedEl.innerHTML=html;
    }
  }
}

// ייצוא CSV של הסשנים
function exportSessionsCSV(){
  const sessions = Object.values(_activeSessions);
  if(sessions.length===0){ cpAlert('אין סשנים לייצוא','info'); return; }
  const rows = [['שם משתמש','תפקיד','IP','עיר','מכשיר','דפדפן','זמן כניסה']];
  sessions.forEach(s=>{
    rows.push([s.username,s.role,s.ip,s.city+' '+s.country,s.device,s.browser,new Date(s.loginTime).toLocaleString('he-IL')]);
  });
  downloadCSV('sessions_'+Date.now()+'.csv', rows);
}

// ============================================================
// 🔑 שינוי סיסמת אדמין
// ============================================================

// בדיקת חוזק סיסמה
function _checkPassStrength(pass){
  let score = 0;
  if(pass.length >= 8) score++;
  if(pass.length >= 12) score++;
  if(/[A-Z]/.test(pass)) score++;
  if(/[0-9]/.test(pass)) score++;
  if(/[^A-Za-z0-9]/.test(pass)) score++;
  return score;
}

// עדכון פס חוזק בזמן הקלדה
document.addEventListener('DOMContentLoaded', function(){
  const inp = document.getElementById('cp-new');
  if(!inp) return;
  inp.addEventListener('input', function(){
    const score = _checkPassStrength(inp.value);
    const bar = document.getElementById('pass-strength-bar');
    const txt = document.getElementById('pass-strength-txt');
    if(!bar||!txt) return;
    const colors = ['#e24b4a','#e24b4a','#ef9f27','#39e600','#39e600'];
    const labels = ['','חלשה מאוד 😟','חלשה 😕','בינונית 👍','חזקה 💪','חזקה מאוד 🔒'];
    bar.style.background = score>0 ? colors[score-1] : '#2d3748';
    bar.style.width = (score*20)+'%';
    txt.textContent = inp.value.length>0 ? (labels[score]||'') : '';
    txt.style.color = score>0 ? colors[score-1] : '#888';
  });
});

async function changeAdminPassword(){
  const current = document.getElementById('cp-current').value;
  const newPass = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  const errEl = document.getElementById('change-pass-err');
  const okEl = document.getElementById('change-pass-ok');

  function showErr(msg){ errEl.textContent=msg; errEl.style.display='block'; okEl.style.display='none'; }
  function showOk(msg){ okEl.textContent=msg; okEl.style.display='block'; errEl.style.display='none'; }
  function hideAll(){ errEl.style.display='none'; okEl.style.display='none'; }
  hideAll();

  // ולידציות
  if(!current){ showErr('יש להזין את הסיסמה הנוכחית'); return; }
  if(current !== ADMIN_PASS){ showErr('❌ הסיסמה הנוכחית שגויה'); return; }
  if(!newPass){ showErr('יש להזין סיסמה חדשה'); return; }
  if(newPass.length < 8){ showErr('הסיסמה חייבת להכיל לפחות 8 תווים'); return; }
  if(newPass !== confirm){ showErr('❌ הסיסמאות לא תואמות'); return; }
  if(newPass === current){ showErr('הסיסמה החדשה זהה לנוכחית'); return; }
  if(_checkPassStrength(newPass) < 2){ showErr('⚠️ הסיסמה חלשה מדי — הוסף מספרים או אותיות גדולות'); return; }

  // שמירה ב-Firestore
  if(window.fbOK && window.db){
    try{
      await window.db.collection('cashphone').doc('main').update({
        adminPass: newPass,
        adminPassUpdated: Date.now()
      });
    }catch(e){ console.warn('Firestore save failed:', e); }
  }

  // עדכון ADMIN_PASS בזיכרון
  // eslint-disable-next-line no-global-assign
  window._runtimeAdminPass = newPass;

  // ניקוי שדות
  document.getElementById('cp-current').value='';
  document.getElementById('cp-new').value='';
  document.getElementById('cp-confirm').value='';
  document.getElementById('pass-strength-bar').style.background='#2d3748';
  document.getElementById('pass-strength-txt').textContent='';

  logAudit('security','סיסמת אדמין שונתה',{});
  showOk('✅ הסיסמה שונתה בהצלחה! בפעם הבאה השתמש בסיסמה החדשה.');
}

function renderSecurityTab(){
  var ab=document.getElementById('sec-auto-backup');
  var lastBackup=document.getElementById('sec-last-backup');
  var settings=getBackupSettings();

  if(ab)ab.checked=settings.autoReminder!==false;

  if(lastBackup){
    try{
      var t=parseInt(localStorage.getItem('cp_last_backup')||'0');
      if(t>0){
        var diff=Date.now()-t;
        var hours=Math.floor(diff/(60*60*1000));
        var minutes=Math.floor((diff%(60*60*1000))/(60*1000));
        var human=new Date(t).toLocaleString('he-IL');
        var ago=hours>=24?Math.floor(hours/24)+' ימים':hours>0?hours+' שעות':minutes+' דקות';
        lastBackup.textContent=human+' ('+ago+' מאז)';
        lastBackup.style.color=hours>=24?'#ef9f27':'#fff';
      }else{
        lastBackup.textContent='מעולם לא בוצע';
        lastBackup.style.color='#ef9f27';
      }
    }catch(e){lastBackup.textContent='—';}
  }

  renderAuditLog();
}

function toggleAutoReminder(){
  var s=getBackupSettings();
  var ab=document.getElementById('sec-auto-backup');
  s.autoReminder=ab.checked;
  saveBackupSettings(s);
  toast('t-admin',ab.checked?'⏰ תזכורת לגיבוי הופעלה':'תזכורת לגיבוי כובתה');
}

// תווית ידידותית לסוג פעולה
function auditTypeLabel(type){
  var map={
    'login':'🟢 כניסה','logout':'⚫ יציאה',
    'store-delete':'🗑️ מחיקת חנות','store-delete-perm':'⚠️ מחיקה לצמיתות',
    'store-freeze':'🧊 הקפאת חנות','store-unfreeze':'🔥 הפשרת חנות',
    'user-create':'➕ יצירת משתמש','user-delete':'🗑️ מחיקת משתמש',
    'password-change':'🔑 שינוי סיסמה',
    'prices-change':'💲 שינוי מחירים',
    'credit-topup':'💰 טעינת קרדיט',
    'order-manual':'✋ הזמנה ידנית',
    'credit-reduce':'➖ הפחתת קרדיט',
    'payment-received':'💵 תשלום מחנות',
    'unpaid-edit':'✏️ עריכת חוב פתוח',
    'payment-received':'💵 תשלום מחנות',
    'unpaid-edit':'✏️ עדכון חוב פתוח',
    'debt-limit-change':'💳 שינוי מסגרת חוב',
    'backup-manual':'📥 גיבוי ידני','backup-auto':'📥 גיבוי יומי','backup-restore':'📤 שחזור גיבוי',
    'audit-export':'📋 ייצוא לוג','audit-clear':'🗑️ ניקוי לוג'
  };
  return map[type]||('• '+type);
}

function auditTypeColor(type){
  if(type.indexOf('delete')>=0)return '#3a1a1a';
  if(type==='login'||type.indexOf('backup')>=0)return '#1a2a1a';
  if(type==='store-freeze')return '#3a3528';
  return '#222831';
}

function renderAuditLog(){
  var list=document.getElementById('audit-list');
  var summary=document.getElementById('audit-summary');
  if(!list)return;

  var search=(document.getElementById('audit-search')||{}).value||'';
  var typeFilter=(document.getElementById('audit-filter-type')||{}).value||'all';
  search=search.trim().toLowerCase();

  var filtered=auditLog.filter(function(e){
    if(typeFilter!=='all'&&e.type!==typeFilter)return false;
    if(search){
      var hay=(e.user+' '+e.description+' '+e.type+' '+(e.role||'')).toLowerCase();
      if(hay.indexOf(search)===-1)return false;
    }
    return true;
  });

  if(filtered.length===0){
    list.innerHTML='<div style="text-align:center;padding:30px;color:#666;font-size:13px;">'+(auditLog.length===0?'אין רשומות עדיין. פעולות רגישות יירשמו כאן אוטומטית.':'אין תוצאות לסינון')+'</div>';
    if(summary)summary.textContent='';
    return;
  }

  var html=filtered.slice(0,200).map(function(e){
    var bg=auditTypeColor(e.type);
    var details='';
    if(e.details){
      var parts=[];
      for(var k in e.details){
        if(!Object.prototype.hasOwnProperty.call(e.details,k))continue;
        var v=e.details[k];
        if(v===null||v===undefined||v==='')continue;
        if(Array.isArray(v))v=v.join(', ');
        if(typeof v==='object')v=JSON.stringify(v);
        var label={
          storeId:'מזהה חנות',storeName:'חנות',username:'משתמש',userId:'מזהה',
          role:'תפקיד',amount:'סכום',newCredit:'יתרה חדשה',
          from:'מ-',to:'ל-',linkedUsers:'משתמשים מקושרים',
          file:'קובץ',version:'גרסה',deletedRecords:'רשומות שנמחקו',records:'רשומות'
        }[k]||k;
        parts.push('<span style="color:#888;">'+label+':</span> <span style="color:#bbb;">'+String(v).substring(0,80)+'</span>');
      }
      if(parts.length)details='<div style="font-size:11px;margin-top:4px;line-height:1.6;">'+parts.join(' · ')+'</div>';
    }
    var roleEmoji=e.role==='admin'?'👑':e.role==='reseller'?'💼':e.role==='store'?'🏪':'❓';
    return '<div style="background:'+bg+';border-bottom:1px solid #2a2a2a;padding:10px 14px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">'+
      '<div style="flex:1;min-width:200px;">'+
      '<div style="font-size:13px;font-weight:700;color:#fff;">'+auditTypeLabel(e.type)+'</div>'+
      '<div style="font-size:12px;color:#bbb;margin-top:2px;">'+e.description+'</div>'+
      details+
      '</div>'+
      '<div style="text-align:left;font-size:11px;color:#666;white-space:nowrap;">'+
      '<div>'+roleEmoji+' <span style="color:#bbb;">'+e.user+'</span></div>'+
      '<div style="margin-top:2px;font-family:monospace;">'+e.timeStr+'</div>'+
      '</div>'+
      '</div></div>';
  }).join('');

  list.innerHTML=html;
  if(summary){
    summary.textContent='מציג '+Math.min(filtered.length,200)+' מתוך '+filtered.length+' (סה"כ '+auditLog.length+' רשומות בלוג)';
  }
}

function exportAuditLog(){
  if(auditLog.length===0){toast('t-admin','אין רשומות לייצוא');return;}
  var rows=[
    ['תאריך','משתמש','תפקיד','סוג פעולה','תיאור','פרטים נוספים'],
    ...auditLog.map(function(e){
      var det='';
      if(e.details){
        try{det=JSON.stringify(e.details);}catch(_){det=String(e.details);}
      }
      return[e.timeStr,e.user,e.role||'',auditTypeLabel(e.type).replace(/[^\u0590-\u05FFa-zA-Z0-9 ]/g,'').trim(),e.description,det];
    })
  ];
  downloadCSV('audit_log_'+new Date().toLocaleDateString('he-IL').replace(/\//g,'-')+'.csv',rows);
  logAudit('audit-export','ייצוא לוג ביקורת',{records:auditLog.length});
  toast('t-admin','✅ הלוג יוצא');
}

async function clearAuditLog(){
  if(auditLog.length===0){toast('t-admin','הלוג ריק');return;}
  var msg='למחוק את כל '+auditLog.length+' הרשומות בלוג?\nאי אפשר לבטל את זה. מומלץ לייצא ל-CSV קודם.';
  if(!await cpConfirm(msg,{type:'danger',title:'ניקוי לוג ביקורת',okText:'מחק הכל'}))return;
  var count=auditLog.length;
  auditLog=[];
  saveAuditLog();
  logAudit('audit-clear','ניקוי לוג ביקורת',{deletedRecords:count});
  toast('t-admin','🗑️ הלוג נוקה');
  renderAuditLog();
}

// === Block #4 ===
(function(){
  // רישום Service Worker — מבוטל זמנית כדי למנוע מטמון שמדרס נתונים חדשים
  // אם תרצה להפעיל שוב — הסר את התגובה
  /*
  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('service-worker.js')
        .then(function(reg){
          console.log('✅ Service Worker registered:', reg.scope);
          reg.addEventListener('updatefound', function(){
            const newWorker = reg.installing;
            if(!newWorker)return;
            newWorker.addEventListener('statechange', function(){
              if(newWorker.state==='installed' && navigator.serviceWorker.controller){
                showUpdateBanner();
              }
            });
          });
        })
        .catch(function(err){
          console.warn('Service Worker registration failed:', err);
        });
    });
  }
  */

  // הסרת Service Worker קיים אם יש (כדי לסיים את המטמון של הגרסה הישנה)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistrations().then(function(registrations){
      for(let registration of registrations){
        registration.unregister().then(function(){
          console.log('🗑️ Service Worker ישן הוסר');
        });
      }
    }).catch(function(e){console.warn('SW unregister error:',e);});
    // ניקוי מטמון של Service Worker
    if(window.caches){
      caches.keys().then(function(names){
        for(let name of names){
          caches.delete(name);
        }
      }).catch(function(e){});
    }
  }

  // ===== באנר התקנה =====
  let deferredPrompt = null;
  let installBannerShown = false;

  // עוזר: בדיקה האם המשתמש הנוכחי מחובר כצוות (אדמין/חנות/משווק)
  function isStaffUser(){
    try{
      return typeof currentUser!=='undefined' && currentUser && currentUser.role;
    }catch(e){return false;}
  }

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    tryShowInstallBanner();
  });

  function tryShowInstallBanner(){
    if(!deferredPrompt || installBannerShown) return;
    // לא מציגים לאדמין/חנות/משווק - רק ללקוחות שגולשים בחנות
    if(isStaffUser()) return;
    // מציגים את הבאנר רק אם המשתמש לא דחה אותו ב-7 ימים האחרונים
    const dismissed = localStorage.getItem('cp_install_dismissed');
    if(dismissed){
      const daysAgo = (Date.now()-parseInt(dismissed))/86400000;
      if(daysAgo < 7) return;
    }
    showInstallBanner();
  }

  // אם משתמש צוות יוצא (logout) — ננסה להציג שוב ללקוח
  document.addEventListener('click', function(e){
    if(deferredPrompt && !installBannerShown && !isStaffUser()){
      setTimeout(tryShowInstallBanner, 500);
    }
  });

  function showInstallBanner(){
    if(installBannerShown) return;
    installBannerShown = true;
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML =
      '<div style="position:fixed;bottom:16px;left:16px;right:16px;max-width:420px;margin:0 auto;'+
      'background:linear-gradient(135deg,#3a4556,#475467);border:1px solid #39e600;'+
      'border-radius:14px;padding:12px 14px;z-index:9999;box-shadow:0 10px 30px rgba(57,230,0,0.25);'+
      'display:flex;align-items:center;gap:10px;font-family:inherit;direction:rtl;">'+
        '<button id="pwa-dismiss-btn" aria-label="סגור" style="background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:50%;width:32px;height:32px;min-width:32px;font-size:20px;font-weight:700;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit;flex-shrink:0;">×</button>'+
        '<div style="font-size:28px;flex-shrink:0;">📱</div>'+
        '<div style="flex:1;min-width:0;">'+
          '<div style="font-size:13px;font-weight:700;color:#39e600;margin-bottom:1px;">התקן את CashPhone</div>'+
          '<div style="font-size:11px;color:#aaa;">גישה מהירה ממסך הבית</div>'+
        '</div>'+
        '<button id="pwa-install-btn" style="background:linear-gradient(135deg,#39e600,#2ab800);color:#000;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0;">התקן</button>'+
      '</div>';
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').onclick = async function(){
      if(!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if(choice.outcome==='accepted'){
        console.log('✅ App installed');
      }
      deferredPrompt = null;
      banner.remove();
    };
    document.getElementById('pwa-dismiss-btn').onclick = function(){
      localStorage.setItem('cp_install_dismissed', Date.now().toString());
      banner.remove();
    };
  }

  // התקנה הצליחה
  window.addEventListener('appinstalled', function(){
    console.log('✅ CashPhone installed as app');
    deferredPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if(banner) banner.remove();
  });

  // ===== באנר עדכון =====
  function showUpdateBanner(){
    const existing = document.getElementById('pwa-update-banner');
    if(existing) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.innerHTML =
      '<div style="position:fixed;top:16px;left:16px;right:16px;max-width:420px;margin:0 auto;'+
      'background:#0a1a0a;border:1px solid #39e600;border-radius:12px;padding:12px 16px;z-index:9999;'+
      'display:flex;align-items:center;gap:10px;font-family:inherit;direction:rtl;font-size:13px;color:#fff;">'+
        '<span style="font-size:20px;">🔄</span>'+
        '<span style="flex:1;">גירסה חדשה זמינה</span>'+
        '<button onclick="location.reload()" style="background:#39e600;color:#000;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">רענן</button>'+
      '</div>';
    document.body.appendChild(banner);
  }

  // זיהוי האם האפליקציה מותקנת (running standalone)
  if(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true){
    console.log('🚀 Running as installed PWA');
    document.documentElement.classList.add('pwa-installed');
  }
})();

// === Block #5 ===
(function(){
  var maxLines=200;
  var lines=[];
  function appendLine(level,args){
    try{
      var msg=Array.prototype.map.call(args,function(a){
        if(typeof a==='string')return a;
        try{return JSON.stringify(a);}catch(e){return String(a);}
      }).join(' ');
      var t=new Date().toLocaleTimeString();
      var color=level==='error'?'#ff7070':level==='warn'?'#ef9f27':'#39e600';
      lines.push('<span style="color:#888;">['+t+']</span> <span style="color:'+color+';">'+msg.replace(/</g,'&lt;')+'</span>');
      if(lines.length>maxLines)lines=lines.slice(-maxLines);
      var el=document.getElementById('debug-log');
      if(el)el.innerHTML=lines.join('<br>');
      if(el&&el.parentElement.style.display!=='none')el.parentElement.scrollTop=el.parentElement.scrollHeight;
    }catch(e){}
  }
  // מחבר לקונסול - שומר את הלוגים גם אם המשתמש פתח/סגר
  var oLog=console.log,oWarn=console.warn,oErr=console.error;
  console.log=function(){appendLine('log',arguments);oLog.apply(console,arguments);};
  console.warn=function(){appendLine('warn',arguments);oWarn.apply(console,arguments);};
  console.error=function(){appendLine('error',arguments);oErr.apply(console,arguments);};
  // לוג גם של שגיאות לא תפוסות
  window.addEventListener('error',function(e){appendLine('error',['JS ERROR:',e.message,'at',e.filename+':'+e.lineno]);});
  window.dbgOpen=function(){
    var p=document.getElementById('debug-panel');
    if(p)p.style.display='block';
    // הוסף תוכן localStorage נוכחי
    try{
      var s=localStorage.getItem('cp_stores');
      var u=localStorage.getItem('cp_users');
      var ts=localStorage.getItem('cp_ts');
      console.log('--- מצב localStorage נוכחי ---');
      console.log('cp_stores:',s?JSON.parse(s).length+' חנויות':'ריק');
      console.log('cp_users:',u?JSON.parse(u).length+' משתמשים':'ריק');
      console.log('cp_ts:',ts||'אין');
      if(typeof stores!=='undefined')console.log('זיכרון: stores='+stores.length);
      if(typeof users!=='undefined')console.log('זיכרון: users='+users.length);
    }catch(e){console.error('דיבאג שגיאה:',e.message);}
  };
  window.dbgClose=function(){
    var p=document.getElementById('debug-panel');
    if(p)p.style.display='none';
  };
  window.dbgClear=function(){
    lines=[];
    var el=document.getElementById('debug-log');
    if(el)el.innerHTML='';
  };
})();

// ניקוי סשן כשסוגרים/מרעננים את הדף
window.addEventListener('beforeunload', function(){
  if(_mySessionId && window.fbOK && window.db){
    // sendBeacon — הדרך היחידה לשלוח בקשה לפני סגירת הדף
    try{
      const url = 'https://firestore.googleapis.com/v1/projects/cashphone-467f1/databases/(default)/documents/cashphone_sessions/'+_mySessionId;
      navigator.sendBeacon && navigator.sendBeacon('/beacon-noop'); // fallback
      window.db.collection('cashphone_sessions').doc(_mySessionId).delete();
    }catch(e){}
  }
});
