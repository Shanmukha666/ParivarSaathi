'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, MessageCircle, Users } from 'lucide-react';
import { useStore } from '../../lib/store';
import TextToSpeech from '../../components/TextToSpeech';
import { JOINT_QUESTIONS, JointAnswers, compareAnswers, isComplete } from '../../lib/joint';

type Copy = {
  title: string; learner: string; parent: string; pass: string; next: string; see: string; agree: string;
  differ: string; note: string; ask: string; back: string; q: string[]; o: string[][];
};
const COPY: Record<string, Copy> = {
  en: { title: 'Decide together', learner: 'Learner: your answers', parent: 'Parent: your answers',
    pass: "Now hand the phone to your parent. Do not look at each other's answers.", next: 'Next', see: 'See results',
    agree: 'You agree', differ: 'You see this differently', note: 'Different answers are normal. Talk about why, then ask the counsellor if you want help.',
    ask: 'Talk to a counsellor', back: 'Back',
    q: ['Which trade do you prefer?', 'What matters most?', 'Where should the training be?'],
    o: [['This trade', 'A different trade', 'Not sure yet'], ['Good earnings', 'Job security', 'Respect in the community', 'Safety'], ['Near home', 'In another district', 'Anywhere']] },
  te: { title: 'కలిసి నిర్ణయించండి', learner: 'విద్యార్థి: మీ సమాధానాలు', parent: 'తల్లిదండ్రులు: మీ సమాధానాలు',
    pass: 'ఇప్పుడు ఫోన్‌ను తల్లిదండ్రులకు ఇవ్వండి. ఒకరి సమాధానాలు ఒకరు చూడకండి.', next: 'తదుపరి', see: 'ఫలితాలు చూడండి',
    agree: 'మీరు ఏకీభవిస్తున్నారు', differ: 'మీ అభిప్రాయాలు వేరు', note: 'అభిప్రాయ భేదాలు సహజం. ఎందుకో మాట్లాడుకోండి; సహాయం కావాలంటే కౌన్సిలర్‌ను అడగండి.',
    ask: 'కౌన్సిలర్‌తో మాట్లాడండి', back: 'వెనక్కి',
    q: ['మీకు ఏ ట్రేడ్ ఇష్టం?', 'మీకు ఏది ముఖ్యం?', 'శిక్షణ ఎక్కడ ఉండాలి?'],
    o: [['ఈ ట్రేడ్', 'వేరే ట్రేడ్', 'ఇంకా తెలియదు'], ['మంచి సంపాదన', 'ఉద్యోగ భద్రత', 'సమాజంలో గౌరవం', 'భద్రత'], ['ఇంటి దగ్గర', 'వేరే జిల్లాలో', 'ఎక్కడైనా']] },
  hi: { title: 'साथ मिलकर तय करें', learner: 'छात्र: अपने जवाब दें', parent: 'माता-पिता: अपने जवाब दें',
    pass: 'अब फ़ोन माता-पिता को दें। एक-दूसरे के जवाब न देखें।', next: 'आगे', see: 'नतीजे देखें',
    agree: 'आप सहमत हैं', differ: 'आपकी राय अलग है', note: 'अलग राय सामान्य है। कारण पर बात करें, मदद चाहिए तो काउंसलर से पूछें।',
    ask: 'काउंसलर से बात करें', back: 'पीछे',
    q: ['आपको कौन-सा ट्रेड पसंद है?', 'आपके लिए सबसे ज़रूरी क्या है?', 'प्रशिक्षण कहाँ हो?'],
    o: [['यही ट्रेड', 'कोई और ट्रेड', 'अभी तय नहीं'], ['अच्छी कमाई', 'नौकरी की सुरक्षा', 'समाज में सम्मान', 'सुरक्षा'], ['घर के पास', 'दूसरे ज़िले में', 'कहीं भी']] },
  ta: { title: 'சேர்ந்து முடிவு செய்யுங்கள்', learner: 'மாணவர்: உங்கள் பதில்கள்', parent: 'பெற்றோர்: உங்கள் பதில்கள்',
    pass: 'இப்போது போனை பெற்றோரிடம் கொடுங்கள். ஒருவர் பதிலை மற்றவர் பார்க்க வேண்டாம்.', next: 'அடுத்து', see: 'முடிவுகளைப் பாருங்கள்',
    agree: 'நீங்கள் ஒத்துப்போகிறீர்கள்', differ: 'உங்கள் கருத்து வேறுபடுகிறது', note: 'கருத்து வேறுபாடு இயல்பானது. ஏன் என்று பேசுங்கள்; உதவி வேண்டுமெனில் ஆலோசகரிடம் கேளுங்கள்.',
    ask: 'ஆலோசகரிடம் பேசுங்கள்', back: 'பின்',
    q: ['எந்தத் தொழில் உங்களுக்குப் பிடிக்கும்?', 'உங்களுக்கு எது முக்கியம்?', 'பயிற்சி எங்கு இருக்க வேண்டும்?'],
    o: [['இந்தத் தொழில்', 'வேறு தொழில்', 'இன்னும் தெரியவில்லை'], ['நல்ல வருமானம்', 'வேலை உறுதி', 'சமூக மதிப்பு', 'பாதுகாப்பு'], ['வீட்டுக்கு அருகில்', 'வேறு மாவட்டத்தில்', 'எங்கும்']] },
};

export default function JointPage() {
  const router = useRouter();
  const { language, sessionId } = useStore();
  const c = COPY[language] || COPY.en;
  const [stage, setStage] = useState<0 | 1 | 2>(0); // 0 learner, 1 parent, 2 results
  const [learner, setLearner] = useState<JointAnswers>({});
  const [parent, setParent] = useState<JointAnswers>({});
  const current = stage === 0 ? learner : parent;
  const set = (q: (typeof JOINT_QUESTIONS)[number], i: number) =>
    (stage === 0 ? setLearner : setParent)((prev) => ({ ...prev, [q]: i }));
  const result = compareAnswers(learner, parent);
  // Best-effort save so counsellors and the dashboard can see joint answers. English labels keep data comparable.
  const save = (participant: 'learner' | 'parent', answers: JointAnswers) => {
    if (!sessionId) return;
    const payload = Object.fromEntries(JOINT_QUESTIONS.map((q, qi) => [q, COPY.en.o[qi][answers[q] ?? 0]]));
    void fetch('/api/joint-counselling/answers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, participant, answers: payload }),
    }).catch(() => undefined);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-5 space-y-5">
      <header className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label={c.back} className="h-11 w-11 rounded-full bg-white border border-slate-200 flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-extrabold text-ink flex-1 flex items-center gap-2"><Users size={22} className="text-orange-600" />{c.title}</h1>
        <TextToSpeech text={[c.title, ...(stage === 2 ? [c.note] : c.q)].join('. ')} lang={language} />
      </header>

      {stage < 2 ? (
        <>
          <p className="font-bold text-orange-700">{stage === 0 ? c.learner : c.parent}</p>
          {JOINT_QUESTIONS.map((q, qi) => (
            <fieldset key={q} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <legend className="font-bold text-slate-900 px-1">{c.q[qi]}</legend>
              {c.o[qi].map((label, oi) => (
                <button key={label} type="button" onClick={() => set(q, oi)} aria-pressed={current[q] === oi}
                  className={`w-full min-h-[48px] text-left px-4 rounded-xl border-2 font-semibold ${current[q] === oi ? 'border-orange-600 bg-orange-50 text-orange-800' : 'border-slate-200 text-slate-800'}`}>
                  {label}
                </button>
              ))}
            </fieldset>
          ))}
          <button disabled={!isComplete(current)} onClick={() => { save(stage === 0 ? 'learner' : 'parent', current); setStage(stage === 0 ? 1 : 2); }}
            className="w-full bg-orange-600 disabled:opacity-40 text-white font-bold py-4 rounded-2xl">
            {stage === 0 ? c.next : c.see}
          </button>
          {stage === 1 && <p className="text-sm text-slate-600 text-center">{c.pass}</p>}
        </>
      ) : (
        <>
          {JOINT_QUESTIONS.map((q, qi) => {
            const same = result.agreements.includes(q);
            return (
              <section key={q} className={`rounded-2xl border p-4 space-y-2 ${same ? 'bg-orange-50 border-orange-200' : 'bg-amber-50 border-amber-200'}`}>
                <h2 className="font-bold text-slate-900">{c.q[qi]}</h2>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {same && <Check size={16} className="text-orange-700" />}{same ? c.agree : c.differ}
                </p>
                <p className="text-sm text-slate-700">{c.learner.split(':')[0]}: <b>{c.o[qi][learner[q] ?? 0]}</b></p>
                <p className="text-sm text-slate-700">{c.parent.split(':')[0]}: <b>{c.o[qi][parent[q] ?? 0]}</b></p>
              </section>
            );
          })}
          {result.has_disagreement && <p className="text-sm text-slate-700">{c.note}</p>}
          <button onClick={() => router.push('/chat')} className="w-full bg-orange-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2">
            <MessageCircle size={20} />{c.ask}
          </button>
        </>
      )}
    </div>
  );
}
