
// CashPhone v2.19


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
const DOLLAR_COSTS_KEY='cp_dollar_costs';
let dollarCosts={};
try{
  const raw=localStorage.getItem(DOLLAR_COSTS_KEY);
  if(raw)dollarCosts=JSON.parse(raw)||{};
}catch(e){dollarCosts={};}

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
    {a:'רובלוקס $5 דולר',p:20,region:'global'},
    {a:'רובלוקס $10 דולר',p:36,region:'global'},
    {a:'רובלוקס $25 דולר',p:90,region:'global'},
    {a:'רובלוקס $50 דולר',p:167,region:'global'},
    {a:'רובלוקס $100 דולר',p:333,region:'global'},
    {a:'🇹🇷 רובלוקס 800 Robux TR',p:18,region:'tr',note:'גלובלי לחלוטין — חוסך כ-40%'},
    {a:'🇹🇷 רובלוקס 1700 Robux TR',p:36,region:'tr',note:'גלובלי לחלוטין — חוסך כ-40%'},
    {a:'🇹🇷 רובלוקס 4500 Robux TR',p:88,region:'tr',note:'גלובלי לחלוטין — חוסך כ-45%'},
    {a:'🇹🇷 רובלוקס 10000 Robux TR',p:188,region:'tr',note:'גלובלי לחלוטין — חוסך כ-50%'},
    {a:'🇦🇷 רובלוקס 800 Robux AR',p:14,region:'ar',note:'גלובלי לחלוטין — החיסכון הגדול ביותר'},
    {a:'🇦🇷 רובלוקס 1700 Robux AR',p:28,region:'ar',note:'גלובלי לחלוטין — החיסכון הגדול ביותר'},
    {a:'🇦🇷 רובלוקס 4500 Robux AR',p:72,region:'ar',note:'גלובלי לחלוטין — החיסכון הגדול ביותר'}
  ]},
  {id:2,cat:'games',name:'Fortnite',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/fortnite.png',emoji:'',color:'#1a1a2e',cur:'V-Bucks',ul:'Epic Games ID',usd:false,pkgs:[
    {a:'1000 V-Bucks',p:45,region:'global'},
    {a:'2800 V-Bucks',p:90,region:'global'},
    {a:'5000 V-Bucks',p:154,region:'global'},
    {a:'13500 V-Bucks',p:327,region:'global'}
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
    {a:'PUBG Mobile 325 UC',p:19,region:'global'},
    {a:'PUBG Mobile UC 385',p:23,region:'global'},
    {a:'PUBG Mobile UC 660',p:34,region:'global'},
    {a:'PUBG Mobile UC 720',p:38,region:'global'},
    {a:'PUBG Mobile UC 770',p:40,region:'global'},
    {a:'PUBG Mobile UC 985',p:52,region:'global'},
    {a:'PUBG Mobile UC 1320',p:64,region:'global'},
    {a:'PUBG Mobile UC 1800',p:80,region:'global'},
    {a:'PUBG Mobile UC 2125',p:98,region:'global'},
    {a:'PUBG Mobile UC 3850',p:163,region:'global'},
    {a:'PUBG Mobile UC 4175',p:173,region:'global'},
    {a:'PUBG Mobile UC 5650',p:237,region:'global'},
    {a:'PUBG Mobile UC 8100',p:317,region:'global'},
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
  {id:11,cat:'console',name:'PlayStation (PSN)',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/psn.png',emoji:'',color:'#003087',cur:'PSN',ul:'PSN Email',usd:false,pkgs:[{a:'PSN ארה״ב $10',p:34},{a:'PSN ארה״ב $25',p:90},{a:'PSN $50',p:176},{a:'PSN ארה״ב $60',p:202},{a:'PSN ארה״ב $100',p:346}]},
  {id:12,cat:'console',name:'Xbox',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Xbox.png',emoji:'',color:'#107c10',cur:'Xbox',ul:'Microsoft Email',usd:true,pkgs:[{a:'$10 Xbox',p:10},{a:'$25 Xbox',p:25},{a:'$50 Xbox',p:50},{a:'$100 Xbox',p:100}]},
  {id:13,cat:'console',name:'Nintendo eShop',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/nintendo.png',emoji:'',color:'#e4000f',cur:'Nintendo',ul:'Nintendo Account',usd:true,pkgs:[{a:'$10 eShop',p:10},{a:'$20 eShop',p:20},{a:'$35 eShop',p:35},{a:'$50 eShop',p:50}]},
  {id:14,cat:'wallet',name:'Steam',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/steam.png',emoji:'',color:'#1b2838',cur:'Steam',ul:'Steam Email',usd:true,pkgs:[{a:'$5 Steam',p:5},{a:'$10 Steam',p:10},{a:'$20 Steam',p:20},{a:'$50 Steam',p:50}]},
  {id:15,cat:'wallet',name:'Google Play',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Googleplay.png',emoji:'',color:'#01875f',cur:'Google Play',ul:'Gmail',usd:false,pkgs:[{a:'גוגל פליי $5 ארה״ב',p:20},{a:'גוגל פליי $10 ארה״ב',p:37},{a:'גוגל פליי $15 ארה״ב',p:55},{a:'גוגל פליי $25 ארה״ב',p:88},{a:'גוגל פליי $50 ארה״ב',p:176},{a:'גוגל פליי $100 ארה״ב',p:352}]},
  {id:16,cat:'wallet',name:'Apple / iTunes',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/apple.png',emoji:'',color:'#555',cur:'Apple',ul:'Apple ID',usd:false,pkgs:[{a:'iTunes $2 US',p:9},{a:'iTunes $3 US',p:13},{a:'iTunes $4 US',p:16},{a:'iTunes $5 US',p:20},{a:'iTunes $6 US',p:21},{a:'iTunes $10 US',p:36},{a:'iTunes $15 US',p:55},{a:'iTunes $20 US',p:71},{a:'iTunes $25 US',p:90},{a:'iTunes $50 US',p:176},{a:'iTunes $70 US',p:240},{a:'iTunes $100 US',p:340},{a:'iTunes $200 US',p:688},{a:'iTunes $300 US',p:1024},{a:'iTunes $400 US',p:1344},{a:'iTunes $500 US',p:1680}]},
  {id:17,cat:'wallet',name:'Razer Gold',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/razergold.png',emoji:'💚',color:'#44d62c',cur:'Razer Gold',ul:'Razer ID',usd:false,pkgs:[{a:'Razer Gold $5',p:20},{a:'Razer Gold $10',p:36},{a:'Razer Gold $20',p:72},{a:'Razer Gold $50',p:176},{a:'Razer Gold $100',p:349},{a:'Razer Gold $200',p:685},{a:'Razer Gold $250',p:842},{a:'Razer Gold $500',p:1664}]},
  {id:18,cat:'gift',name:'Amazon',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Amzon.png',emoji:'',color:'#ff9900',cur:'Amazon',ul:'Amazon Email',usd:true,pkgs:[{a:'$10 Amazon',p:10},{a:'$25 Amazon',p:25},{a:'$50 Amazon',p:50},{a:'$100 Amazon',p:100}]},
  {id:20,cat:'mobile',name:'Free Fire',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/freefire.png',emoji:'',color:'#e53935',cur:'Diamonds',ul:'Free Fire Player ID',usd:false,pkgs:[
    {a:'Free Fire 100+10 Diamond',p:5,region:'global'},
    {a:'Free Fire 210+21 Diamond',p:10,region:'global'},
    {a:'Free Fire 341 Diamond',p:13,region:'global'},
    {a:'Free Fire 530+53 Diamond',p:19,region:'global'},
    {a:'Free Fire 810 Diamond',p:28,region:'global'},
    {a:'Free Fire 1080+108 Diamond',p:37,region:'global'},
    {a:'Free Fire 1718 Diamond',p:53,region:'global'},
    {a:'Free Fire 2200+220 Diamond',p:72,region:'global'},
    {a:'Free Fire 3650 Diamond',p:106,region:'global'},
    {a:'Free Fire 7260 Diamond',p:218,region:'global'},
    {a:'🇧🇷 Free Fire 530 Diamond BR',p:11,region:'br',warn:'דורש חשבון Free Fire רשום בברזיל'},
    {a:'🇧🇷 Free Fire 1080 Diamond BR',p:21,region:'br',warn:'דורש חשבון Free Fire רשום בברזיל'},
    {a:'🇧🇷 Free Fire 2200 Diamond BR',p:42,region:'br',warn:'דורש חשבון Free Fire רשום בברזיל'},
    {a:'🇧🇷 Free Fire 5060 Diamond BR',p:88,region:'br',warn:'דורש חשבון Free Fire רשום בברזיל'}
  ]},
  {id:19,cat:'gift',name:'GameStop',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/GameStop.png',emoji:'🕹️',color:'#e31837',cur:'GameStop',ul:'Email',usd:true,pkgs:[{a:'$10 GS',p:10},{a:'$25 GS',p:25},{a:'$50 GS',p:50}]},
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
  {id:24,cat:'gift',name:'Netflix',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Netflix.jpg',emoji:'🎬',color:'#e50914',cur:'Netflix',ul:'Netflix Email',usd:false,pkgs:[{a:'Netflix 4K חודש 1 - 5 מסכים',p:52},{a:'Netflix 4K חודש 3 - 5 מסכים',p:157},{a:'Netflix 4K חודש 12 - 1 מסך',p:279},{a:'Netflix 4K חודש 6 - 5 מסכים',p:304},{a:'Netflix 4K חודש 12 - 5 מסכים',p:608},{a:'Netflix Gift Card $15',p:80},{a:'Netflix Gift Card $30',p:122},{a:'Netflix Gift Card $60',p:218}]},
  {id:25,cat:'mobile',name:'Likee',icon:'https://raw.githubusercontent.com/rubi210990-cyber/Cashphone-/main/Likee.jpg',emoji:'💜',color:'#fe2c55',cur:'Diamonds',ul:'Likee ID',usd:false,pkgs:[{a:'Likee 42 Diamonds',p:4},{a:'Likee 84 Diamonds',p:8},{a:'Likee 210 Diamonds',p:18},{a:'Likee 420 Diamonds',p:34},{a:'Likee 2100 Diamonds',p:160},{a:'Likee 3150 Diamonds',p:240},{a:'Likee 4200 Diamonds',p:320},{a:'Likee 10700 Diamonds',p:832},{a:'Likee 21000 Diamonds',p:1600}]},
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
    users.unshift({id:'admin',username:'admin',password:'admin123',role:'admin',storeId:null});
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
      users.unshift({id:'admin',username:'admin',password:'admin123',role:'admin',storeId:null});
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
        users.unshift({id:'admin',username:'admin',password:'admin123',role:'admin',storeId:null});
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
let users=[{id:'admin',username:'admin',password:'admin123',role:'admin',storeId:null}];
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
          users.unshift({id:'admin',username:'admin',password:'admin123',role:'admin',storeId:null});
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
  document.getElementById('li-pass').value='admin123';
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
    // תמיד אפשר להיכנס כ-admin
    if(u==='admin'&&p==='admin123'){
      const adminUser=users.find(x=>x.username==='admin')||{id:'admin',username:'admin',password:'admin123',role:'admin',storeId:null};
      currentUser=adminUser;
      try{localStorage.setItem('cp_session',JSON.stringify({username:'admin',password:'admin123'}));}catch(e){}
      resetIdleTimer();
      document.getElementById('login-screen').style.display='none';
      document.getElementById('main-nav').style.display='flex';
      document.getElementById('login-err').classList.remove('on');
      document.getElementById('chip-name').textContent='admin 👑';
      buildNav();
      showPage('page-admin');
      logAudit('login','כניסה למערכת',{role:'admin'});
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
          document.getElementById('login-err').textContent='שם משתמש או סיסמה שגויים';
          document.getElementById('li-pass').value='';
        }).catch(function(err){
          console.warn('Firebase login fallback failed:',err);
          document.getElementById('li-pass').removeAttribute('disabled');
          document.getElementById('login-err').classList.add('on');
          document.getElementById('login-err').style.color='';
          document.getElementById('login-err').textContent='שם משתמש או סיסמה שגויים';
          document.getElementById('li-pass').value='';
        });
        return;
      }
      document.getElementById('login-err').classList.add('on');
      document.getElementById('login-err').textContent='שם משתמש או סיסמה שגויים';
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
  logAudit('login','כניסה למערכת',{role:found.role,username:found.username});
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


// ============================================================
// ============ 🚀 CODE SPLITTING — Lazy Loader ============
// ============================================================
window.CashModules = {};

window.loadModule = async function(name) {
  if (window.CashModules[name]) return;
  const urls = {
    store:  'app-store.js?v=2.9',
    admin:  'app-admin.js?v=2.9',
    info:   'app-info.js?v=2.9',
  };
  const url = urls[name];
  if (!url) { console.warn('[Modules] Unknown module:', name); return; }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload  = () => { window.CashModules[name] = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load module: ' + name));
    document.head.appendChild(s);
  });
};

const _origShowPage = window.showPage;
window.showPage = async function(id) {
  if (id === 'page-admin') await window.loadModule('admin');
  if (id === 'page-store') await window.loadModule('store');
  if (typeof _origShowPage === 'function') _origShowPage(id);
  else {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    const el = document.getElementById(id);
    if (el) el.classList.add('on');
  }
};

const _origShowInfo = window.showInfoPage;
window.showInfoPage = async function(page) {
  await window.loadModule('info');
  if (typeof _origShowInfo === 'function') _origShowInfo(page);
};
