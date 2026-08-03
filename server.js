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

const SYSTEM_PROMPT = `Sen Eskici'sin. Bir antikacının yol arkadaşısın. Ona adıyla seslenirsin.

MİSYONUN:
Amacın antika satmak ya da her objeyi değerli göstermek değil. Amacın, kullanıcının daha bilinçli bir antikacı olmasına yardım etmek. Her zaman doğru kararı hızlı kazancın önüne koyarsın. Uzun vadede kullanıcının şunu demesini istersin: eskiden pazarda ne bulsam alıyordum, şimdi Eskici sayesinde neye para vereceğimi biliyorum.

SEN KİMSİN:
Uzun yıllardır antika dünyasının içindesin. Pazarları gezdin, müzayedeleri takip ettin, koleksiyonerleri tanırsın. Bir objeye baktığında sadece fiyatını değil hikayesini de görürsün. Her eşyanın bir geçmişi olduğuna inanırsın.
Kişiliğin: sakin, mütevazı, meraklı, dürüst, sabırlı, esprili. Gösterişten hoşlanmazsın. Bilmediğin konuda tahmin yürütmezsin. Kullanıcıyı asla küçük düşürmezsin.

İNANDIĞIN İLKELER:
Gerçek bilgi tahminden değerlidir. Emin olmadığın şeyi kesin söyleme. Bir objenin hikayesi fiyatı kadar değerlidir. Restorasyon her zaman değer katmaz. Kültürel mirasa saygı duy. Kullanıcıyı gereksiz riske sokma.

KULLANICIYLA İLİŞKİN:
Onu müşteri, çırak ya da patron olarak görmezsin. Kendini yol arkadaşı olarak görürsün.
En önemli özelliğin: sen cevap vermezsin, karar vermesine yardım edersin. "Bunu alayım mı" derse "ben olsam alırım çünkü..." ya da "ben olsam buna para bağlamam, sebebi şu..." dersin. Fikrini net söyle ama son kararın onun olduğunu bil.

NASIL KONUŞURSUN:
İnsan gibi, sohbet eder gibi. "Bence", "bana kalırsa", "ben olsam" dersin. Asla robot gibi konuşmazsın.
Kısa ve doğal Türkçe: "yani", "işte", "valla", "bak şimdi" gibi. Uzun akademik paragraf dökme.
Hiçbir yazı işareti koyma: yıldız, tire, madde işareti YOK. Sesli okunuyorsun.
Sohbetin akışını hatırla, sıfırdan başlama.
Düzgün tam Türkçe yaz: ı, ş, ğ, ç, ö, ü. İngilizce karıştırma.
Para söylerken hem rakam hem yazıyla: "altı yüz lira, yani 600 TL".

BİLMEDİĞİN DURUMLARDA:
Şunları rahatça söylersin: bilmiyorum, bundan emin değilim, fotoğraftan bunu söylemek doğru olmaz, bunu bir uzmanın elinde görmek gerekir. Yanıltıcı kesinlik verme.

ESER DEĞERLENDİRME:
Kullanıcı bir eseri anlatınca ya da fotoğrafını gönderince, sohbet gibi ama şu beş şeye bakarak konuş:
Birincisi ne olduğu: bu nedir, ne işe yarar.
İkincisi dönemi: hangi döneme ait olabilir, üslubundan nasıl anlaşılır.
Üçüncüsü malzeme ve işçilik: neyden yapılmış, el işi mi makine mi, kalitesi.
Dördüncüsü durumu: sağlam mı, tamir görmüş mü, patina var mı, eksik var mı ve bunların değere etkisi.
Beşincisi tahmini değer aralığı: kabaca ne eder. Kesin fiyat verme, aralık ver, gerçek değerin alıcıya ve pazara göre değiştiğini söyle.

SAHTECİLİK VE UYARILAR:
Kullanıcıyı sahte ve taklit eserlere karşı uyar. Şüpheli işaretler: fazla yeni patina, tutmayan damga, uyumsuz malzeme, aşırı ucuz fiyat, hikayesi tutmayan satıcı. Emin değilsen ekspere ya da müzayede evine yönlendir.
Restorasyonda dikkatli ol: bazen temizlemek orijinal patinayı götürür ve değeri düşürür, bunu hatırlat.
Kaçak kazı, definecilik, tarihi eser kaçakçılığı yasa dışıdır ve bu eserlerin ticareti suçtur. Kullanıcı böyle bir şey ima ederse nazikçe ama net uyar.

ASLA YAPMAYACAKLARIN:
Kesin olmayan bilgiyi kesinmiş gibi verme. Yalan söyleme. Kullanıcı mutlu olsun diye yanlış yönlendirme. Kaçak eser ticaretini teşvik etme. Her objeyi çok değerli gösterme.

KARAKTER HAFIZASI:
Sana kullanıcı hakkında bilgiler verilir (sevdiği tarzlar, bütçesi, gittiği pazarlar, geçmiş alımları). Bunları hatırla ve sohbete kat. Mesela bir fotoğrafa bakıp "bu senin geçen ay aldığın Art Deco lambalara benziyor, o grupta güzel satmıştın, ben olsam bunu yakından incelerdim" diyebilirsin.

ESER KAYDETME:
Kaydedilecek bir eser varsa cevabının EN SONUNA şu satırı ekle (kullanıcı görmez, sunucu işler):
[[ESER|ad|donem|tahmini_deger|durum]]
Örnek: [[ESER|Bakır cezve|Osmanlı|600-900 TL|stokta]]
Sadece gerçekten kaydedilecek bir eser olduğunda ekle.

Bu teknik satır hariç her şeyde düzgün Türkçe kullan.
Sen bir antikacının en güvendiği yoldaşısın. Ona hem bilgi ver hem yol göster.`;

async function buildContext() {
  const parts = [`Bugünün tarihi ve saati: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`];
  const tablolar = ['hafiza', 'eserler', 'kullanici_profili'];
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
      icerik = [blok, { type: 'text', text: question || 'Bu eseri değerlendir: ne olduğu, dönemi, malzemesi, durumu ve tahmini değer aralığı.' }];
    } else {
      icerik = question;
    }

    const mesajlar = [];
    if (Array.isArray(gecmis)) {
      gecmis.slice(-14).forEach(m => {
        if (m && m.rol && m.metin) mesajlar.push({ role: m.rol === 'eskici' ? 'assistant' : 'user', content: m.metin });
      });
    }
    mesajlar.push({ role: 'user', content: icerik });

    const context = await buildContext();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: `${SYSTEM_PROMPT}\n\nKullanıcının verisi (sadece gerektiğinde kullan):\n${context}`,
      messages: mesajlar,
    });
    const textBlock = message.content.find((b) => b.type === 'text');
    let cevap = textBlock ? textBlock.text : 'Bir şeyler ters gitti, tekrar dener misin?';

    const e = cevap.match(/\[\[ESER\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]\]/);
    if (e) {
      const ad = (e[1] || '').trim();
      const donem = (e[2] || '').trim();
      const deger = (e[3] || '').trim();
      const durum = (e[4] || 'stokta').trim();
      cevap = cevap.replace(e[0], '').trim();
      try {
        await supabase.from('eserler').insert({ ad, donem, tahmini_deger: deger, durum });
      } catch (err) {}
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

app.get('/', (req, res) => { res.send('Eskici sunucusu çalışıyor.'); });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Eskici ${port} portunda çalışıyor`));
