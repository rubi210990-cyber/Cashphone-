// CashPhone — app-pwa.js (service worker + debug)

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
