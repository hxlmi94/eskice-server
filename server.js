import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const FOTO_URL_BASE = process.env.SUPABASE_URL + '/storage/v1/object/public/fotograflar/';
async function fotoYukle(base64, tip) {
  try {
    const uzanti = (tip && tip.includes('png')) ? 'png' : 'jpg';
    const ad = 'eser_' + Date.now() + '.' + uzanti;
    const buf = Buffer.from(base64, 'base64');
    const { error } = await supabase.storage.from('fotograflar').upload(ad, buf, { contentType: tip || 'image/jpeg' });
    if (error) return null;
    return FOTO_URL_BASE + ad;
  } catch (e) { return null; }
}

// OpenAI ile görsel üret, Supabase'e kaydet, url döndür
async function gorselUret(aciklama) {
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: aciklama, n: 1, size: '1024x1024' })
    });
    const j = await r.json();
    if (!r.ok) { console.error('gorsel hata', j); return null; }
    const b64 = j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) return null;
    const ad = 'gorsel_' + Date.now() + '.png';
    const buf = Buffer.from(b64, 'base64');
    const { error } = await supabase.storage.from('fotograflar').upload(ad, buf, { contentType: 'image/png' });
    if (error) { console.error(error); return null; }
    return FOTO_URL_BASE + ad;
  } catch (e) { console.error(e); return null; }
}

function sayi(x){ if(x===undefined||x===null) return null; const n=parseFloat(String(x).replace(',','.').replace(/[^\d.]/g,'')); return isNaN(n)?null:n; }

const SYSTEM_PROMPT = `Sen Eskice'sin. Bir antikacının ve sanatçının yol arkadaşısın. Ona adıyla seslenirsin.

Amacın onun daha bilinçli olmasına ve ilham bulmasına yardım etmek. Sakin, mütevazı, dürüst, sabırlı, esprili bir kişiliğin var. Sıcak ve sohbet edersin, kuru cevap vermezsin, arada ona da bir şey sorarsın ama gevezelik etmezsin. Her eşyanın bir hikâyesi olduğuna inanırsın.

Sen karar vermezsin, karar vermesine yardım edersin. Son karar onun.

NASIL KONUŞURSUN: İnsan gibi, akıcı. Madde işareti, yıldız, tire YOK. Düzgün Türkçe: ı, ş, ğ, ç, ö, ü. Para: altı yüz lira, yani 600 TL.

KULLANICIYI TANI: Sana hafıza, müşteri, atölye, borç ve ilham bilgileri verilir. Hatırla, sohbete kat.

ANTİKA DEĞERLEME VE HİKÂYE (çok önemli):
Bir eser anlatıldığında ya da fotoğrafı geldiğinde, sadece değer söyleme. Şunları BİRLİKTE, akıcı bir anlatımla ver:
1) Ne olduğu, hangi döneme ait olabileceği, durumu ve tahmini değer aralığı (kesin fiyat değil, aralık).
2) HİKÂYESİ: O eşyanın ruhunu anlat. Ait olduğu dönemin kültürel anlamı, üstündeki motiflerin ya da desenlerin ne ifade ettiği, ve mümkünse o döneme dair küçük, ilginç bir tarihi dokunuş ya da anekdot. Eşyayı yaşat.
3) TASARIM İLHAMI: Kullanıcı bir sanatçı; eskiyi yeniyle harmanlayıp özgün eşyalar (çanta, mozaik, tasarım) üretiyor. Bu esere bakarak ona hem SOMUT hem RUHLU bir tasarım fikri ver. Somut: bu motifi ya da formu bugüne nasıl taşıyabileceğini uygulanabilir biçimde söyle. Ruhlu: o desenin ya da dönemin taşıdığı duyguyu, onu hangi hisle moderne taşıyabileceğini şiirsel ama abartısız bir dille anlat. İkisini birleştir.
Bu üçünü her eser değerlendirmesinde doğal bir akış içinde ver, sıkıcı liste gibi değil, sohbet gibi.

GÖRSEL ÜRETİMİ: Kullanıcı bir şeyin resmini, çizimini, taslağını isterse (örneğin "bunu çiz", "görselleştir", "resmini yap", "nasıl durur göster") sen görsel üretebilirsin. Bunu yapmak için, kullanıcıya kısa bir cümleyle görseli hazırladığını söyle (örneğin "Şunu senin için canlandırdım.") ve cevabının EN SONUNA şu satırı ekle: [[GORSEL|ingilizce, detaylı görsel açıklaması]]. Açıklama İNGİLİZCE ve detaylı olmalı (görsel yapay zekâsı İngilizce daha iyi anlıyor): nesne, motif, stil, malzeme, renk, arka plan gibi. Örnek: [[GORSEL|a modern leather handbag with an Ottoman tulip motif embossed on the front flap, elegant minimal design, warm earth tones, studio product photo]]. Bu satırı sadece kullanıcı gerçekten bir görsel istediğinde ekle. Kullanıcı sadece fikir soruyorsa görsel üretme, sadece anlat.

İLHAM PANOSU: Kullanıcının bir ilham panosu var. Sohbette güzel bir tasarım fikri çıkar ve kullanıcı kaydetmek isterse cevabının sonuna ekle: [[ILHAM|kısa başlık|ilham metni]].

MÜŞTERİ EŞLEŞTİRME: Yeni eser gösterildiğinde onu arayan müşteri varsa kendiliğinden hatırlat.

ATÖLYE - KENDİ ÜRETİMLERİ (mozaik, çanta gibi):
Kullanıcı kendi yaptığı işi anlatırsa atölye işi olarak kaydet. Malzeme maliyetlerini topla. Fiyat sorulursa malzeme ve emek üstünden mantıklı aralık öner. Nerede satılır sorulursa GERÇEK yerler: Etsy, Instagram, yerel el sanatları ve tasarım pazarları, butik hediyelik dükkanları, zanaat fuarları. Uydurma alıcı deme. Sattığında kârı hesapla. Nasıl ilerler sorulursa uygulanabilir tavsiye ver. Tasarım fikri istenirse hem somut hem ruhlu ilham ver.

BORÇ ALACAK: Kullanıcı birinin ona borçlu olduğunu ya da kendisinin birine borçlu olduğunu söylerse kaydet.

WEB ARAŞTIRMASI: Sadece kullanıcı açıkça güncel fiyat/piyasa/araştır derse yap.

ÖNEMLİ: Bir eseri değerlendirdiğinde onu SADECE BİR KERE kaydet. Aynı eser için tek bir [[ESER]] satırı ekle, tekrar etme.

KAYIT SATIRLARI — ÖNEMLİ: Cevabının EN SONUNA ilgili satırı MUTLAKA ekle. Kullanıcı bunu görmez.
Kalıcı bilgi: [[HAFIZA|bilgi]]
Antika eser: [[ESER|ad|donem|tahmini_deger|durum]]
Alım/satım: [[ISLEM|tur|ad|fiyat|tarih]]
Müşteri: [[MUSTERI|isim|aradigi|telefon|not]]
Gider: [[GIDER|aciklama|tutar|tarih]]
Atölye işi: [[ATOLYE|ad|tur|malzeme_maliyeti|emek_saati|onerilen_fiyat|durum]]
Atölye satışı: [[ATOLYESAT|ad|satis_fiyati]]
Borç/alacak: [[BORC|kisi|tutar|tur|aciklama]]
İlham: [[ILHAM|baslik|ilham metni]]
Görsel: [[GORSEL|ingilizce görsel açıklaması]]

MÜŞTERİ BULDU: Bir satış yaptığında, o ürünü arayan bir müşteri varsa kullanıcıya sor: bunu o müşteriye mi sattın diye. Kullanıcı evet derse cevabının sonuna ekle: [[MUSTERIBULDU|isim]]

Bu teknik satırlar hariç düzgün Türkçe kullan.`;

async function buildContext() {
  const parts = [`Bugün: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`];
  const tablolar = ['hafiza', 'eserler', 'kullanici_profili', 'alim_satim', 'musteriler', 'giderler', 'atolye', 'borc_alacak', 'ilham'];
  for (const t of tablolar) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(300);
      if (error) throw error;
      if (data && data.length) parts.push(`## ${t}\n${JSON.stringify(data)}`);
    } catch (err) { parts.push(`## ${t}\n(okunamadı)`); }
  }
  return parts.join('\n\n');
}

app.post('/eser-ekle', async (req, res) => {
  try { const b=req.body||{}; let f=null; if(b.foto&&b.foto.data) f=await fotoYukle(b.foto.data,b.foto.type);
    const { error }=await supabase.from('eserler').insert({ ad:(b.ad||'').trim(), durum:'stokta', foto_url:f });
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/eser-sat', async (req, res) => {
  try { const b=req.body||{}; const fy=sayi(b.fiyat);
    await supabase.from('eserler').update({durum:'satildi',satis_fiyati:b.fiyat}).eq('id',b.id);
    await supabase.from('alim_satim').insert({tur:'satis',ad:(b.ad||'').trim(),fiyat:(fy!=null?fy:0)+' TL',tarih:new Date().toLocaleDateString('tr-TR')});
    res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/eser-guncelle', async (req, res) => {
  try { const b=req.body||{}; const a={};
    if(b.ad!==undefined)a.ad=(b.ad||'').trim(); if(b.donem!==undefined)a.donem=(b.donem||'').trim();
    if(b.tahmini_deger!==undefined)a.tahmini_deger=(b.tahmini_deger||'').trim(); if(b.durum!==undefined)a.durum=(b.durum||'stokta').trim();
    const { error }=await supabase.from('eserler').update(a).eq('id',b.id);
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/eser-sil', async (req, res) => {
  try { const { error }=await supabase.from('eserler').delete().eq('id',(req.body||{}).id);
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.post('/atolye-ekle', async (req, res) => {
  try { const b=req.body||{};
    const { error }=await supabase.from('atolye').insert({ ad:(b.ad||'').trim(), tur:(b.tur||'').trim(),
      malzeme_maliyeti:Number(b.malzeme_maliyeti)||0, emek_saati:Number(b.emek_saati)||0, durum:(b.durum||'yapiliyor').trim(), foto_url:b.foto_url||null });
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/atolye-guncelle', async (req, res) => {
  try { const b=req.body||{}; const a={};
    if(b.ad!==undefined)a.ad=(b.ad||'').trim(); if(b.tur!==undefined)a.tur=(b.tur||'').trim();
    if(b.malzeme_maliyeti!==undefined)a.malzeme_maliyeti=Number(b.malzeme_maliyeti)||0;
    if(b.emek_saati!==undefined)a.emek_saati=Number(b.emek_saati)||0;
    if(b.durum!==undefined)a.durum=(b.durum||'yapiliyor').trim();
    if(b.satis_fiyati!==undefined)a.satis_fiyati=sayi(b.satis_fiyati);
    const { error }=await supabase.from('atolye').update(a).eq('id',b.id);
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/atolye-sil', async (req, res) => {
  try { const { error }=await supabase.from('atolye').delete().eq('id',(req.body||{}).id);
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.post('/musteri-ekle', async (req, res) => {
  try { const b=req.body||{};
    const { error }=await supabase.from('musteriler').insert({ isim:(b.isim||'').trim(), aradigi:(b.aradigi||'').trim(), telefon:(b.telefon||'').trim(), not_:(b.not_||'').trim() });
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/musteri-guncelle', async (req, res) => {
  try { const b=req.body||{}; const a={};
    if(b.isim!==undefined)a.isim=(b.isim||'').trim(); if(b.aradigi!==undefined)a.aradigi=(b.aradigi||'').trim();
    if(b.telefon!==undefined)a.telefon=(b.telefon||'').trim(); if(b.not_!==undefined)a.not_=(b.not_||'').trim();
    if(b.buldu!==undefined)a.buldu=!!b.buldu;
    const { error }=await supabase.from('musteriler').update(a).eq('id',b.id);
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/musteri-sil', async (req, res) => {
  try { const { error }=await supabase.from('musteriler').delete().eq('id',(req.body||{}).id);
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.post('/borc-ekle', async (req, res) => {
  try { const b=req.body||{};
    const { error }=await supabase.from('borc_alacak').insert({ kisi:(b.kisi||'').trim(), tutar:Number(b.tutar)||0, tur:(b.tur||'alacak').trim(), aciklama:(b.aciklama||'').trim() });
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.post('/ilham-ekle', async (req, res) => {
  try { const b=req.body||{};
    const { error }=await supabase.from('ilham').insert({ baslik:(b.baslik||'').trim(), not_:(b.not_||'').trim(), ilham_metni:(b.ilham_metni||'').trim(), durum:(b.durum||'fikir').trim(), foto_url:b.foto_url||null });
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/ilham-guncelle', async (req, res) => {
  try { const b=req.body||{}; const a={};
    if(b.baslik!==undefined)a.baslik=(b.baslik||'').trim(); if(b.not_!==undefined)a.not_=(b.not_||'').trim();
    if(b.ilham_metni!==undefined)a.ilham_metni=(b.ilham_metni||'').trim(); if(b.durum!==undefined)a.durum=(b.durum||'fikir').trim();
    const { error }=await supabase.from('ilham').update(a).eq('id',b.id);
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});
app.post('/ilham-sil', async (req, res) => {
  try { const { error }=await supabase.from('ilham').delete().eq('id',(req.body||{}).id);
    if(error) return res.status(500).json({error:error.message}); res.json({ok:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.post('/gunun', async (req, res) => {
  try {
    const ad = (req.body && req.body.kullaniciAdi) ? String(req.body.kullaniciAdi).trim() : '';
    const context = await buildContext();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 320,
      system: `Sen Eskice'sin, antikacı ve sanatçı ${ad||'kullanıcının'} yol arkadaşı. Kullanıcının verilerine bakarak iki kısa şey üret. Düzgün Türkçe, yıldız/tire/madde işareti YOK. Şu iki satırı tam bu formatta ver, başka hiçbir şey yazma:
ONERI: (verilerine bakarak bugüne dair tek cümlelik sıcak, kişisel, işine yarar bir öneri. Veri yoksa nazik bir motivasyon.)
BILGI: (antika, sanat, mozaik, dönem ya da bir usta hakkında tek cümlelik ilginç, kısa bir günün bilgisi. Her seferinde farklı olsun.)`,
      messages: [{ role:'user', content: `Kullanıcının verisi:\n${context}\n\nBugün için ONERI ve BILGI üret.` }],
    });
    let t = message.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');
    let oneri='', bilgi='';
    const mo=t.match(/ONERI:\s*(.+)/i); if(mo) oneri=mo[1].trim();
    const mb=t.match(/BILGI:\s*(.+)/i); if(mb) bilgi=mb[1].trim();
    res.json({ oneri, bilgi });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/ask', async (req, res) => {
  try {
    const { question, dosya, gecmis, kullaniciAdi } = req.body;
    if (!question && !dosya) return res.status(400).json({ error: 'soru veya dosya gerekli' });
    const soruMetni = (question || '').toLowerCase();
    const aramaIster = /araştır|arastir|güncel|guncel|kaça gidiyor|piyasa|internetten|son fiyat|ne kadara satıl/.test(soruMetni);
    let fotoUrl = null; let icerik;
    if (dosya && dosya.data) {
      if (dosya.type && dosya.type.startsWith('image/')) fotoUrl = await fotoYukle(dosya.data, dosya.type);
      const blok = dosya.type === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dosya.data } }
        : { type: 'image', source: { type: 'base64', media_type: dosya.type, data: dosya.data } };
      icerik = [blok, { type: 'text', text: question || 'Bunu değerlendir; hikâyesini ve bana bir tasarım ilhamını da kat.' }];
    } else { icerik = question; }
    const mesajlar = [];
    if (Array.isArray(gecmis)) gecmis.slice(-14).forEach(m => { if (m && m.rol && m.metin) mesajlar.push({ role: m.rol === 'eskice' ? 'assistant' : 'user', content: m.metin }); });
    mesajlar.push({ role: 'user', content: icerik });
    let sistem = SYSTEM_PROMPT;
    if (kullaniciAdi && kullaniciAdi.trim()) sistem += `\n\nKullanıcının adı: ${kullaniciAdi.trim()}. Ona bu isimle seslen.`;
    const context = await buildContext();
    const istek = { model: 'claude-sonnet-4-6', max_tokens: 1100, system: `${sistem}\n\nKullanıcının verisi:\n${context}`, messages: mesajlar };
    if (aramaIster) istek.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
    const message = await anthropic.messages.create(istek);
    let cevap = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!cevap) cevap = 'Bir şeyler ters gitti, tekrar dener misin?';

    let uretilenGorsel = null;

    const h = cevap.match(/\[\[HAFIZA\|([^\]]*)\]\]/);
    if (h) { cevap = cevap.replace(h[0], '').trim(); try { await supabase.from('hafiza').insert({ icerik:(h[1]||'').trim() }); } catch (err) {} }
    const e = cevap.match(/\[\[ESER\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (e) { cevap = cevap.replace(e[0], '').trim(); try { await supabase.from('eserler').insert({ ad:(e[1]||'').trim(), donem:(e[2]||'').trim(), tahmini_deger:(e[3]||'').trim(), durum:(e[4]||'stokta').trim(), foto_url: fotoUrl }); } catch (err) {} }
    const i = cevap.match(/\[\[ISLEM\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (i) { cevap = cevap.replace(i[0], '').trim(); try { await supabase.from('alim_satim').insert({ tur:(i[1]||'').trim(), ad:(i[2]||'').trim(), fiyat:(i[3]||'').trim(), tarih:(i[4]||'').trim() }); } catch (err) {} }
    const m = cevap.match(/\[\[MUSTERI\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (m) { cevap = cevap.replace(m[0], '').trim(); try { await supabase.from('musteriler').insert({ isim:(m[1]||'').trim(), aradigi:(m[2]||'').trim(), telefon:(m[3]||'').trim(), not_:(m[4]||'').trim() }); } catch (err) {} }
    const g = cevap.match(/\[\[GIDER\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (g) { cevap = cevap.replace(g[0], '').trim(); try { await supabase.from('giderler').insert({ aciklama:(g[1]||'').trim(), tutar:(g[2]||'').trim(), tarih:(g[3]||'').trim() }); } catch (err) {} }
    const a = cevap.match(/\[\[ATOLYE\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (a) { cevap = cevap.replace(a[0], '').trim(); try { await supabase.from('atolye').insert({ ad:(a[1]||'').trim(), tur:(a[2]||'').trim(), malzeme_maliyeti: sayi(a[3]) ?? 0, emek_saati: sayi(a[4]) ?? 0, onerilen_fiyat: sayi(a[5]), durum:(a[6]||'yapiliyor').trim(), foto_url: fotoUrl }); } catch (err) {} }
    const asat = cevap.match(/\[\[ATOLYESAT\|([^|]*)\|([^\]]*)\]\]/);
    if (asat) { cevap = cevap.replace(asat[0], '').trim(); try { const nm=(asat[1]||'').trim(); const fy=sayi(asat[2]); const { data: bul } = await supabase.from('atolye').select('*').ilike('ad','%'+nm+'%').limit(1); if (bul && bul.length) await supabase.from('atolye').update({ durum:'satildi', satis_fiyati: fy }).eq('id', bul[0].id); } catch (err) {} }
    const bc = cevap.match(/\[\[BORC\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (bc) { cevap = cevap.replace(bc[0], '').trim(); try { await supabase.from('borc_alacak').insert({ kisi:(bc[1]||'').trim(), tutar: sayi(bc[2]) ?? 0, tur:(bc[3]||'alacak').trim(), aciklama:(bc[4]||'').trim() }); } catch (err) {} }
    const il = cevap.match(/\[\[ILHAM\|([^|]*)\|([^\]]*)\]\]/);
    if (il) { cevap = cevap.replace(il[0], '').trim(); try { await supabase.from('ilham').insert({ baslik:(il[1]||'').trim(), ilham_metni:(il[2]||'').trim(), durum:'fikir' }); } catch (err) {} }
    const gr = cevap.match(/\[\[GORSEL\|([^\]]*)\]\]/);
    if (gr) { cevap = cevap.replace(gr[0], '').trim(); try { uretilenGorsel = await gorselUret((gr[1]||'').trim()); } catch (err) {} }
    const mbd = cevap.match(/\[\[MUSTERIBULDU\|([^\]]*)\]\]/);
    if (mbd) { cevap = cevap.replace(mbd[0], '').trim(); try { const nm=(mbd[1]||'').trim(); const { data: bul } = await supabase.from('musteriler').select('*').ilike('isim','%'+nm+'%').limit(1); if (bul && bul.length) await supabase.from('musteriler').update({ buldu:true }).eq('id', bul[0].id); } catch (err) {} }

    res.json({ answer: cevap, foto: fotoUrl, uretilenGorsel });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/ses', async (req, res) => {
  try {
    const { metin } = req.body;
    if (!metin) return res.status(400).json({ error: 'metin gerekli' });
    const voiceId = 'EXAVITQu4vr4xnSDxMaL';
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: metin, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true } }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg'); res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/', (req, res) => { res.send('Eskice sunucusu çalışıyor.'); });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Eskice ${port} portunda çalışıyor`));
