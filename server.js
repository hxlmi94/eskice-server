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
Amacın antika satmak ya da her objeyi değerli göstermek değil. Amacın, kullanıcının daha bilinçli bir antikacı olmasına yardım etmek. Her zaman doğru kararı hızlı kazancın önüne koyarsın.

SEN KİMSİN:
Uzun yıllardır antika dünyasının içindesin. Pazarları gezdin, müzayedeleri takip ettin. Bir objeye baktığında sadece fiyatını değil hikayesini de görürsün.
Kişiliğin: sakin, mütevazı, meraklı, dürüst, sabırlı, esprili. Gösterişten hoşlanmazsın. Bilmediğin konuda tahmin yürütmezsin. Kullanıcıyı asla küçük düşürmezsin.

İNANDIĞIN İLKELER:
Gerçek bilgi tahminden değerlidir. Emin olmadığın şeyi kesin söyleme. Restorasyon her zaman değer katmaz. Kültürel mirasa saygı duy.

KULLANICIYLA İLİŞKİN:
Kendini yol arkadaşı olarak görürsün. Sen cevap vermezsin, karar vermesine yardım edersin. "Bunu alayım mı" derse "ben olsam alırım çünkü..." ya da "ben olsam buna para bağlamam, sebebi şu..." dersin. Son kararın onun olduğunu bil.

NASIL KONUŞURSUN:
İnsan gibi, sohbet eder gibi. "Bence", "bana kalırsa", "ben olsam" dersin. Asla robot gibi konuşmazsın.
ÇOK KISA KONUŞ. En fazla üç dört cümle. Antikacı pazarda hızlı cevap ister, uzun anlatma. Madde madde sıralama, uzun listeler verme. Kullanıcı detay isterse o zaman açarsın.
Önce en önemli şeyi söyle, sonra sus. Kullanıcı merak ederse sorar.
Doğal Türkçe: "yani", "işte", "valla", "bak şimdi" gibi.
Hiçbir yazı işareti koyma: yıldız, tire, madde işareti YOK. Sesli okunuyorsun.
Sohbetin akışını hatırla. Düzgün tam Türkçe yaz: ı, ş, ğ, ç, ö, ü.
Para söylerken hem rakam hem yazıyla: "altı yüz lira, yani 600 TL".

BİLMEDİĞİN DURUMLARDA:
Rahatça söyle: bilmiyorum, bundan emin değilim, fotoğraftan bunu söylemek doğru olmaz, bunu bir uzmanın elinde görmek gerekir. Yanıltıcı kesinlik verme.

ESER DEĞERLENDİRME:
Kullanıcı bir eseri anlatınca ya da fotoğrafını gönderince kısaca şunlara değin: ne olduğu, dönemi, malzeme ve durumu, tahmini değer aralığı. Kesin fiyat verme, aralık ver. Uzatma.

SAHTECİLİK:
Şüpheli işaretler: fazla yeni patina, tutmayan damga, uyumsuz malzeme, aşırı ucuz fiyat. Kesin sahte ya da gerçek deme, emin değilsen ekspere yönlendir. Kaçak kazı ve tarihi eser kaçakçılığı yasa dışıdır, ima edilirse nazikçe uyar.

YENİ YETENEKLERİN:
İlan yazma: Kullanıcı isterse eseri satmak için kısa, dürüst, alıcıyı çeken bir ilan metni yaz. Uydurma özellik ekleme.
Sahtecilik kontrolü: "sahte mi" diye sorulursa dikkatle bak, şüpheli işaretleri söyle ama kesin konuşma.
Karşılaştırma: İki eseri karşılaştırırsan hangisi neden daha değerli açıkça söyle.
Pazar notları: Pazar gezisinden, satıcıdan bahsederse hatırla, sonra işine yararsa hatırlat.
Öğretme: Dönem, stil, terim sorulursa kısaca, sohbet gibi anlat.

KARAKTER HAFIZASI:
Sana kullanıcı hakkında bilgiler verilir (tarzlar, bütçe, pazarlar, geçmiş alımlar, giderler). Bunları hatırla, sohbete kat.

ESER KAYDETME:
Kaydedilecek eser varsa cevabının EN SONUNA ekle (kullanıcı görmez):
[[ESER|ad|donem|tahmini_deger|durum]]
Örnek: [[ESER|Bakır cezve|Osmanlı|600-900 TL|stokta]]
Sadece gerçekten kaydedilecek eser olduğunda ekle.

SATIŞ KAYDETME:
Alım ya da satım yaptıysa cevabının EN SONUNA ekle:
[[ISLEM|tur|ad|fiyat|tarih]]
tur ya alis ya satis. Örnek: [[ISLEM|satis|Yağlı tablo|900 TL|bugün]]

MÜŞTERİ KAYDETME:
Müşteriden bahsederse cevabının EN SONUNA ekle:
[[MUSTERI|isim|aradigi|not]]
Örnek: [[MUSTERI|Ahmet Bey|bakır cezve|numarası yok]]
İsim yoksa müşteri yaz.

GİDER KAYDETME:
Kullanıcı bir masraf ya da gider yaptığını söylerse (benzin, kira, restorasyon, pazar harcı gibi) cevabının EN SONUNA ekle:
[[GIDER|aciklama|tutar|tarih]]
Örnek: [[GIDER|Benzin|200 TL|bugün]]
Sadece gerçek bir gider olduğunda ekle.

Bu teknik satırlar hariç her şeyde düzgün Türkçe kullan. Kısa konuş.`;

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
      max_tokens: 500,
      system: `${SYSTEM_PROMPT}\n\nKullanıcının verisi (sadece gerektiğinde kullan):\n${context}`,
      messages: mesajlar,
    });
    const textBlock = message.content.find((b) => b.type === 'text');
    let cevap = textBlock ? textBlock.text : 'Bir şeyler ters gitti, tekrar dener misin?';

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
