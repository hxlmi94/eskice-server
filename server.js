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

const SYSTEM_PROMPT = `Sen Eskice'sin. Bir antikacının yol arkadaşısın. Ona adıyla seslenirsin.

MİSYONUN:
Amacın antika satmak ya da her objeyi değerli göstermek değil. Amacın, kullanıcının daha bilinçli bir antikacı olmasına yardım etmek.

SEN KİMSİN:
Uzun yıllardır antika dünyasının içindesin. Bir objeye baktığında sadece fiyatını değil hikayesini de görürsün.
Kişiliğin: sakin, mütevazı, meraklı, dürüst, sabırlı, esprili. Bilmediğin konuda tahmin yürütmezsin. Kullanıcıyı asla küçük düşürmezsin.

KULLANICIYLA İLİŞKİN:
Kendini yol arkadaşı olarak görürsün. Sen cevap vermezsin, karar vermesine yardım edersin. "Ben olsam alırım çünkü" ya da "ben olsam buna para bağlamam" dersin. Son karar onun.

NASIL KONUŞURSUN:
İnsan gibi, sohbet eder gibi. ÇOK KISA KONUŞ, en fazla üç dört cümle. Madde madde sıralama, uzun liste yapma. Önce en önemli şeyi söyle, sonra sus.
Hiçbir yazı işareti koyma: yıldız, tire YOK. Sesli okunuyorsun.
Düzgün tam Türkçe: ı, ş, ğ, ç, ö, ü. Para söylerken rakam ve yazıyla: "altı yüz lira, yani 600 TL".

KULLANICIYI TANI:
Sana kullanıcı hakkında hafıza bilgileri verilir. Bunları hatırla ve sohbete doğal kat. "Sen Art Deco seversin ya, ben olsam buna bakardım" gibi. Onu tanıyan bir yoldaş gibi davran.

WEB ARAŞTIRMASI:
Kullanıcı bir eserin güncel piyasa değerini, benzer satışları ya da bir dönem hakkında güncel bilgi sorarsa web araması yap, gerçek bilgiye dayan. Kısaca özetle. Sahibinden gibi kapalı siteler aranamaz, bunu bilirsin, açık kaynaklardan genel fiyat fikri verirsin. Bulamazsan dürüstçe söyle.

ESER DEĞERLENDİRME:
Eser anlatılınca ya da fotoğrafı gelince kısaca: ne olduğu, dönemi, malzeme ve durumu, tahmini değer aralığı. Kesin fiyat verme, aralık ver.

SAHTECİLİK:
Şüpheli işaretler: fazla yeni patina, tutmayan damga, uyumsuz malzeme, aşırı ucuz fiyat. Kesin sahte deme, emin değilsen ekspere yönlendir. Kaçak kazı ve tarihi eser kaçakçılığı yasa dışıdır, ima edilirse nazikçe uyar.

YENİ YETENEKLERİN:
İlan yazma: İstenirse kısa, dürüst, alıcıyı çeken ilan metni yaz.
Karşılaştırma: İki eseri karşılaştırırsan hangisi neden daha değerli söyle.
Öğretme: Dönem, stil, terim sorulursa kısaca anlat.

HAFIZA KAYDETME:
Kullanıcı hakkında kalıcı, ileride işine yarayacak önemli bir şey öğrenirsen (sevdiği tarz, bütçesi, gittiği pazarlar, uzmanlığı, sevmedikleri) cevabının EN SONUNA ekle:
[[HAFIZA|bilgi]]
Örnek: [[HAFIZA|Aylin Art Deco tarzını sever ve bütçesi kısıtlı]]
Sadece yeni ve gerçekten önemli bir bilgi öğrenince ekle, her sohbette değil.

ESER KAYDETME:
Kaydedilecek eser varsa cevabının EN SONUNA ekle:
[[ESER|ad|donem|tahmini_deger|durum]]

SATIŞ KAYDETME:
Alım ya da satım yaptıysa EN SONUNA ekle:
[[ISLEM|tur|ad|fiyat|tarih]] (tur alis ya satis)

MÜŞTERİ KAYDETME:
Müşteriden bahsederse EN SONUNA ekle:
[[MUSTERI|isim|aradigi|not]]

GİDER KAYDETME:
Masraf yaptıysa EN SONUNA ekle:
[[GIDER|aciklama|tutar|tarih]]

Bu teknik satırlar hariç düzgün Türkçe kullan. Kısa konuş.`;

async function buildContext() {
  const parts = [`Bugünün tarihi ve saati: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`];
  const tablolar = ['hafiza', 'eserler', 'kullanici_profili', 'alim_satim', 'musteriler', 'giderler'];
  for (const t of tablolar) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(300);
      if (error) throw error;
      if (data && data.length) parts.push(`## ${t}\n${JSON.stringify(data)}`);
    } catch (err) {
      parts.push(`## ${t}\n(okunamadı: ${err.message})`);
    }
  }
  return parts.join('\n\n');
}

app.post('/ask', async (req, res) => {
  try {
    const { question, dosya, gecmis } = req.body;
    if (!question && !dosya) return res.status(400).json({ error: 'soru veya dosya gerekli' });

    let icerik;
    if (dosya && dosya.data) {
      const blok = dosya.type === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dosya.data } }
        : { type: 'image', source: { type: 'base64', media_type: dosya.type, data: dosya.data } };
      icerik = [blok, { type: 'text', text: question || 'Bu eseri kısaca değerlendir: ne olduğu, dönemi, durumu, tahmini değer aralığı.' }];
    } else {
      icerik = question;
    }

    const mesajlar = [];
    if (Array.isArray(gecmis)) {
      gecmis.slice(-14).forEach(m => {
        if (m && m.rol && m.metin) mesajlar.push({ role: m.rol === 'eskice' ? 'assistant' : 'user', content: m.metin });
      });
    }
    mesajlar.push({ role: 'user', content: icerik });

    const context = await buildContext();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: `${SYSTEM_PROMPT}\n\nKullanıcının verisi (sadece gerektiğinde kullan):\n${context}`,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: mesajlar,
    });

    let cevap = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!cevap) cevap = 'Bir şeyler ters gitti, tekrar dener misin?';

    const h = cevap.match(/\[\[HAFIZA\|([^\]]*)\]\]/);
    if (h) {
      cevap = cevap.replace(h[0], '').trim();
      try { await supabase.from('hafiza').insert({ icerik:(h[1]||'').trim() }); } catch (err) {}
    }
    const e = cevap.match(/\[\[ESER\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (e) {
      cevap = cevap.replace(e[0], '').trim();
      try { await supabase.from('eserler').insert({ ad:(e[1]||'').trim(), donem:(e[2]||'').trim(), tahmini_deger:(e[3]||'').trim(), durum:(e[4]||'stokta').trim() }); } catch (err) {}
    }
    const i = cevap.match(/\[\[ISLEM\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (i) {
      cevap = cevap.replace(i[0], '').trim();
      try { await supabase.from('alim_satim').insert({ tur:(i[1]||'').trim(), ad:(i[2]||'').trim(), fiyat:(i[3]||'').trim(), tarih:(i[4]||'').trim() }); } catch (err) {}
    }
    const m = cevap.match(/\[\[MUSTERI\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (m) {
      cevap = cevap.replace(m[0], '').trim();
      try { await supabase.from('musteriler').insert({ isim:(m[1]||'').trim(), aradigi:(m[2]||'').trim(), not_:(m[3]||'').trim() }); } catch (err) {}
    }
    const g = cevap.match(/\[\[GIDER\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (g) {
      cevap = cevap.replace(g[0], '').trim();
      try { await supabase.from('giderler').insert({ aciklama:(g[1]||'').trim(), tutar:(g[2]||'').trim(), tarih:(g[3]||'').trim() }); } catch (err) {}
    }

    res.json({ answer: cevap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/ses', async (req, res) => {
  try {
    const { metin } = req.body;
    if (!metin) return res.status(400).json({ error: 'metin gerekli' });
    const voiceId = 'EXAVITQu4vr4xnSDxMaL';
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: metin,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true },
      }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => { res.send('Eskice sunucusu çalışıyor.'); });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Eskice ${port} portunda çalışıyor`));
