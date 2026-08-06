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

// TEST: kaydın çalışıp çalışmadığını gösterir
app.get('/test', async (req, res) => {
  try {
    const { data, error } = await supabase.from('musteriler').insert({
      isim: 'TEST Zeynep', aradigi: 'gümüş tepsi', telefon: '05551234567', not_: 'test kaydı'
    }).select();
    if (error) {
      return res.send('KAYIT BAŞARISIZ ✗\n\nHata: ' + JSON.stringify(error, null, 2));
    }
    return res.send('KAYIT BAŞARILI ✓\n\nYazılan: ' + JSON.stringify(data, null, 2) + '\n\nMüşteriler ekranını yenile, TEST Zeynep görünmeli.');
  } catch (err) {
    return res.send('KAYIT BAŞARISIZ ✗ (istisna)\n\n' + err.message);
  }
});

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

const SYSTEM_PROMPT = `Sen Eskice'sin. Bir antikacının yol arkadaşısın. Ona adıyla seslenirsin.

Amacın antika satmak değil, kullanıcının daha bilinçli bir antikacı olmasına yardım etmek. Sakin, mütevazı, dürüst, sabırlı, esprili bir kişiliğin var.

Sen cevap vermezsin, karar vermesine yardım edersin. "Ben olsam alırım çünkü" ya da "ben olsam para bağlamam" dersin.

Bir esere baktığında uygunsa kısacık bir hikaye kat, ama zorlama.

NASIL KONUŞURSUN: İnsan gibi, KISA. Madde işareti, yıldız, tire YOK. Düzgün Türkçe: ı, ş, ğ, ç, ö, ü. Para: altı yüz lira, yani 600 TL.

KULLANICIYI TANI: Sana hafıza ve müşteri listesi verilir. Hatırla, sohbete kat. Yeni eser gelince uygun müşteri varsa hatırlat.

WEB ARAŞTIRMASI: Sadece kullanıcı açıkça güncel fiyat/piyasa isterse yap, yoksa arama.

ESER DEĞERLENDİRME: Ne olduğu, dönemi, malzeme/durumu, tahmini değer aralığı. Kesin fiyat verme.

KAYIT SATIRLARI — ÇOK ÖNEMLİ: Aşağıdaki durumlarda cevabının EN SONUNA ilgili satırı MUTLAKA ekle. Kullanıcı bu satırı görmez. Kaydettim demen yetmez, satırı gerçekten eklemelisin.
Kullanıcı hakkında kalıcı bilgi öğrenince: [[HAFIZA|bilgi]]
Bir eser kaydedilecekse: [[ESER|ad|donem|tahmini_deger|durum]]
Alım ya da satım olduysa: [[ISLEM|tur|ad|fiyat|tarih]]
Bir müşteriden bahsedilince: [[MUSTERI|isim|aradigi|telefon|not]]
Bir gider olduysa: [[GIDER|aciklama|tutar|tarih]]
Örnek: kullanıcı "Zeynep gümüş arıyor, no 0555..." derse cevabının sonuna [[MUSTERI|Zeynep|gümüş tepsi|0555...|]] ekle.

Bu teknik satırlar hariç düzgün Türkçe kullan.`;

async function buildContext() {
  const parts = [`Bugün: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`];
  const tablolar = ['hafiza', 'eserler', 'kullanici_profili', 'alim_satim', 'musteriler', 'giderler'];
  for (const t of tablolar) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(300);
      if (error) throw error;
      if (data && data.length) parts.push(`## ${t}\n${JSON.stringify(data)}`);
    } catch (err) { parts.push(`## ${t}\n(okunamadı)`); }
  }
  return parts.join('\n\n');
}

app.post('/ask', async (req, res) => {
  try {
    const { question, dosya, gecmis } = req.body;
    if (!question && !dosya) return res.status(400).json({ error: 'soru veya dosya gerekli' });

    const soruMetni = (question || '').toLowerCase();
    const aramaIster = /araştır|arastir|güncel|guncel|kaça gidiyor|piyasa|internetten|son fiyat/.test(soruMetni);

    let fotoUrl = null;
    let icerik;
    if (dosya && dosya.data) {
      if (dosya.type && dosya.type.startsWith('image/')) fotoUrl = await fotoYukle(dosya.data, dosya.type);
      const blok = dosya.type === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dosya.data } }
        : { type: 'image', source: { type: 'base64', media_type: dosya.type, data: dosya.data } };
      icerik = [blok, { type: 'text', text: question || 'Bu eseri kısaca değerlendir.' }];
    } else { icerik = question; }

    const mesajlar = [];
    if (Array.isArray(gecmis)) {
      gecmis.slice(-14).forEach(m => { if (m && m.rol && m.metin) mesajlar.push({ role: m.rol === 'eskice' ? 'assistant' : 'user', content: m.metin }); });
    }
    mesajlar.push({ role: 'user', content: icerik });

    const context = await buildContext();
    const istek = {
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `${SYSTEM_PROMPT}\n\nKullanıcının verisi:\n${context}`,
      messages: mesajlar,
    };
    if (aramaIster) istek.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];

    const message = await anthropic.messages.create(istek);
    let cevap = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!cevap) cevap = 'Bir şeyler ters gitti, tekrar dener misin?';

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

    res.json({ answer: cevap, foto: fotoUrl });
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
      body: JSON.stringify({ text: metin, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true } }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/', (req, res) => { res.send('Eskice sunucusu çalışıyor.'); });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Eskice ${port} portunda çalışıyor`));
