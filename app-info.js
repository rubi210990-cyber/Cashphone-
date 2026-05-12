// CashPhone — app-info.js (info pages module)
// נטען lazy בלחיצה על אודות/תקנון/צור קשר

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

